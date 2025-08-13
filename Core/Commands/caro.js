import fs from "fs";
import path from "path";
import axios from "axios";
import { ThreadType } from "zca-js";
import { log } from "../../Utils/Logger.js";
import { suggestMove, loadLearnConfig, openGameLog, appendGameLog, learnFromOutcome } from "../../Api/Caro/CaroApi.js";
import {
  dangKyReply,
  datChoPhanHoi,
  clearPendingReply,
} from "../../Handlers/HandleReply.js";
import { query } from "../../App/Database.js";

let createCanvas;
let loadImage;
try {
  const mod = await import("canvas");
  createCanvas = mod.createCanvas;
  loadImage = mod.loadImage;
} catch {}

const TURN_TIME_MS = 90_000;
const BOT_SEARCH_TIME_MS = 900;
const BOT_MAX_DEPTH = 3;
const BOT_CANDIDATES_LIMIT = 12;

function createRandomBigInt() {
 
  const hi = Math.floor(Math.random() * 0xffffffff);
  const lo = Math.floor(Math.random() * 0xffffffff);
  return (BigInt(hi) << 32n) ^ BigInt(lo);
}

function buildZobrist(size) {
  const cells = size * size;
  const table = Array.from({ length: cells }, () => [createRandomBigInt(), createRandomBigInt()]);
  return table;
}

function computeZobristKey(board, size, zTable) {
  let key = 0n;
  for (let i = 0; i < board.length; i++) {
    const s = board[i];
    if (!s) continue;
    const id = s === "X" ? 0 : 1;
    key ^= zTable[i][id];
  }
  return key;
}

function ensureAiState(game) {
  if (!game.ai) game.ai = {};
  if (!game.ai.zobrist || game.ai.zobristSize !== game.size) {
    game.ai.zobrist = buildZobrist(game.size);
    game.ai.zobristSize = game.size;
  }
  if (!game.ai.tt) game.ai.tt = new Map(); 
  if (!game.ai.history) game.ai.history = Object.create(null); 
  if (!game.ai.killer) game.ai.killer = Array.from({ length: 64 }, () => []);
}
const BOT_UID = "BOT";
const BOT_NAME = "Gemini Bot";
const activeGames = new Map();

async function getDisplayName(api, uid) {
  try {
    if (String(uid) === BOT_UID) return BOT_NAME;
    const info = await api.getUserInfo(uid);
    const profiles = info?.changed_profiles || {};
    const key = Object.keys(profiles).find((k) => k.startsWith(uid));
    const p = key ? profiles[key] : null;
    return p?.displayName || p?.zaloName || p?.username || "Người chơi";
  } catch {
    return "Người chơi";
  }
}
function makeEmptyBoard(size) {
  return Array(size * size).fill(null);
}
function otherPlayer(game, uid) {
  return game.players.find((p) => p.uid !== uid);
}
function buildMention(name) {
  return `@${name}`;
}
function clearTimeoutIfAny(id) {
  if (id)
    try {
      clearTimeout(id);
    } catch {}
}

function pickFallbackMove(game) {
  const { size, board } = game;
  const empties = [];
  for (let i = 0; i < board.length; i++) if (!board[i]) empties.push(i);
  if (empties.length === 0) return -1;
  const center = Math.floor((size * size) / 2);
  if (!board[center]) return center;
   const midR = Math.floor(size / 2);
  const midC = Math.floor(size / 2);
  let best = empties[0];
  let bestD = Infinity;
  for (const idx of empties) {
    const r = Math.floor(idx / size);
    const c = idx % size;
    const d = Math.abs(r - midR) + Math.abs(c - midC);
    if (d < bestD || (d === bestD && idx < best)) {
      bestD = d;
      best = idx;
    }
  }
  return best;
}

function isBotUid(uid) {
  return String(uid) === BOT_UID;
}

function checkVictory(game, lastIdx, symbol) {
  const { board, size } = game;
  const row = Math.floor(lastIdx / size);
  const col = lastIdx % size;
  const need = size <= 3 ? 3 : 5;
  const count = (dr, dc) => {
    let r = row + dr,
      c = col + dc,
      n = 0;
    while (
      r >= 0 &&
      r < size &&
      c >= 0 &&
      c < size &&
      board[r * size + c] === symbol
    ) {
      n++;
      r += dr;
      c += dc;
    }
    return n;
  };
  return [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ].some(([dr, dc]) => 1 + count(dr, dc) + count(-dr, -dc) >= need);
}

function drawBoardImage(game, highlightIdx = null) {
  if (!createCanvas) return null;
  const { board, size, players, marks } = game;
  const headerH = 90,
    GAP = 10,
    MAX = 600;
  const cell = Math.max(30, Math.floor(MAX / size));
  const boardPx = cell * size;
  const canvas = createCanvas(boardPx, boardPx + headerH + GAP);
  const ctx = canvas.getContext("2d");

  const round = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, headerH);

  ctx.font = "20px Arial";
  const marge = 15;
  const p1 = players[0] || { name: "P1" };
  const p2 = players[1] || { name: "P2" };
  const t1 = `${p1.name} (${marks[p1.uid] || "?"})`;
  const t2 = `${p2.name} (${marks[p2.uid] || "?"})`;
  const w1 = ctx.measureText(t1).width + 30,
    w2 = ctx.measureText(t2).width + 30;
  const yBtn = (headerH - 38) / 2;
  ctx.fillStyle = marks[p1.uid] === "X" ? "#e74c3c" : "#2980b9";
  round(marge, yBtn, w1, 38, 18);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(t1, marge + w1 / 2, yBtn + 19);
  ctx.fillStyle = marks[p2.uid] === "O" ? "#2980b9" : "#e74c3c";
  round(canvas.width - marge - w2, yBtn, w2, 38, 18);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(t2, canvas.width - marge - w2 / 2, yBtn + 19);

  ctx.save();
  ctx.translate(0, headerH + GAP);
  const grad = ctx.createLinearGradient(0, 0, boardPx, boardPx);
  grad.addColorStop(0, "#fafafa");
  grad.addColorStop(1, "#e9e9e9");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, boardPx, boardPx);
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, boardPx, boardPx);
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 3;
  for (let i = 0; i <= size; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(boardPx, i * cell);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, boardPx);
    ctx.stroke();
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const idx = r * size + c,
        x = c * cell + cell / 2,
        y = r * cell + cell / 2,
        m = board[idx];
      if (m) {
        ctx.fillStyle = m === "X" ? "#e74c3c" : "#2980b9";
        ctx.font = `${Math.floor(cell * 0.6)}px Arial`;
        ctx.fillText(m, x, y);
      } else {
        ctx.fillStyle = "#333";
        ctx.font = `bold ${Math.floor(cell * 0.35)}px Arial`;
        ctx.fillText(String(idx + 1), x, y);
      }
    }
  if (highlightIdx !== null) {
    const r = Math.floor(highlightIdx / size),
      c = highlightIdx % size;
    ctx.strokeStyle = "#f1c40f";
    ctx.lineWidth = 3;
    ctx.strokeRect(c * cell + 1, r * cell + 1, cell - 2, cell - 2);
  }
  ctx.restore();

  const dir = path.resolve("Data", "Cache", "Caro");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `caro_${Date.now()}.png`);
  fs.writeFileSync(file, canvas.toBuffer("image/png"));
  return file;
}

function renderBoardText(game) {
  const { board, size } = game;
  const rows = [];
  for (let r = 0; r < size; r++) {
    const cols = [];
    for (let c = 0; c < size; c++) {
      const idx = r * size + c;
      cols.push(board[idx] || String(idx + 1));
    }
    rows.push(cols.join(" "));
  }
  return rows.join("\n");
}

function scheduleTurnTimer(game, api) {
  clearTimeoutIfAny(game.timeoutId);
  game.timeoutId = setTimeout(async () => {
    if (game.state != "playing") return;
    const loser = game.players.find((p) => p.uid === game.turnUid);
    const winner = otherPlayer(game, game.turnUid);
    if (!winner) return;
    game.state = "ended";
    await api.sendMessage(
      {
        msg: `⏱️ ${buildMention(loser.name)} đã quá thời gian nên thua!`,
        mentions: [
          { pos: 2, len: buildMention(loser.name).length, uid: loser.uid },
        ],
      },
      game.threadId,
      game.threadType,
    );
    activeGames.delete(game.threadId);
    clearPendingReply(game.threadId);
  }, TURN_TIME_MS);
}

async function botChooseMove(game) {
  const { size, board, marks, turnUid } = game;
  const myMark = marks[turnUid];
  const ai = game.ai || {};
  const SEARCH_TIME_MS = Math.max(200, ai.searchTimeMs || BOT_SEARCH_TIME_MS);
  const MAX_DEPTH = Math.max(1, ai.maxDepth || BOT_MAX_DEPTH);
  const CAND_LIMIT = Math.max(6, ai.candidatesLimit || BOT_CANDIDATES_LIMIT);
  const gemini = ai.gemini || { enabled: false };
  const centerWeight = Math.max(0, Math.min(2, ai.centerWeight || 0));
  const emptyIndices = board
    .map((v, i) => (v ? null : i))
    .filter((x) => x !== null);
  if (emptyIndices.length === 0) return -1;

  const opponentMark = myMark === "X" ? "O" : "X";
  const need = size <= 3 ? 3 : 5;
 const totalStones = board.reduce((n, v) => (v ? n + 1 : n), 0);
  const centerIdx = Math.floor((size * size) / 2);
  if (totalStones <= 1 && !board[centerIdx]) {
   return centerIdx;
  }

  const tryImmediate = (mark) => {
    for (const idx of emptyIndices) {
      board[idx] = mark;
      const win = checkVictory(game, idx, mark);
      board[idx] = null;
      if (win) return idx;
    }
    return -1;
  };
  let imm = tryImmediate(myMark);
  if (imm !== -1) {
    return imm;
  }
  imm = tryImmediate(opponentMark);
  if (imm !== -1) {
   return imm;
  }

  const oppImmediateWins = [];
  for (const id of emptyIndices) {
    if (board[id]) continue;
    board[id] = opponentMark;
    if (checkVictory(game, id, opponentMark)) oppImmediateWins.push(id);
    board[id] = null;
  }
  if (oppImmediateWins.length === 1) {
    const b = oppImmediateWins[0];
    return b;
  }
  if (oppImmediateWins.length >= 2) {
    
    const midR0 = Math.floor(size / 2), midC0 = Math.floor(size / 2);
    let bestB = oppImmediateWins[0];
    let bestW = Infinity;
    let bestD = Infinity;
    for (const b of oppImmediateWins) {
      board[b] = myMark;
      let w = 0;
      for (const id of emptyIndices) {
        if (board[id]) continue;
        board[id] = opponentMark;
        if (checkVictory(game, id, opponentMark)) w++;
        board[id] = null;
      }
      board[b] = null;
      const r = Math.floor(b / size), c = b % size;
      const d = Math.abs(r - midR0) + Math.abs(c - midC0);
      if (w < bestW || (w === bestW && d < bestD)) {
        bestW = w; bestB = b; bestD = d;
      }
    }
    return bestB;
  }
  const getOpenEnds = (idx, mark, dr, dc) => {
    const r0 = Math.floor(idx / size), c0 = idx % size;
    let len = 1;
    let r = r0 + dr, c = c0 + dc;
    while (r >= 0 && r < size && c >= 0 && c < size && board[r * size + c] === mark) {
      len++; r += dr; c += dc;
    }
    let end1 = (r >= 0 && r < size && c >= 0 && c < size && board[r * size + c] === null) ? (r * size + c) : -1;
    r = r0 - dr; c = c0 - dc;
    while (r >= 0 && r < size && c >= 0 && c < size && board[r * size + c] === mark) {
      len++; r -= dr; c -= dc;
    }
    let end2 = (r >= 0 && r < size && c >= 0 && c < size && board[r * size + c] === null) ? (r * size + c) : -1;
    const openEnds = [end1, end2].filter((x) => x >= 0);
    return { len, openEnds };
  };

  const getOpponentBlocksForOpenFours = (idx, mark) => {
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    const blocks = new Set();
    for (const [dr,dc] of dirs) {
      const { len, openEnds } = getOpenEnds(idx, mark, dr, dc);
      if (len === (need - 1) && openEnds.length >= 1) {
        for (const p of openEnds) blocks.add(p);
      }
    }
    return Array.from(blocks);
  };

  const tryVCF = (maxDepth = 3, nodeBudget = 1500) => {
    let nodes = 0;
    const me = myMark;
    const opp = opponentMark;
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];

    const rec = (depth) => {
      if (nodes++ > nodeBudget) return -1;
    
      const moves = getCandidateMoves();
      for (const m of moves) {
        if (board[m]) continue;
        board[m] = me;
      
        if (checkVictory(game, m, me)) { board[m] = null; return m; }
     
        const blocks = getOpponentBlocksForOpenFours(m, me);
        if (blocks.length > 0) {
      
          let anyWin = true;
          for (const b of blocks) {
            if (board[b]) { anyWin = false; break; }
            board[b] = opp;
            let winNext = -1;
            if (depth + 1 <= maxDepth) {
           
              const res = rec(depth + 1);
              winNext = res;
            }
            board[b] = null;
            if (winNext < 0) { anyWin = false; break; }
          }
          if (anyWin) { board[m] = null; return m; }
        }
        board[m] = null;
      }
      return -1;
    };
    return rec(1);
  };

  const vcfDepth = ai.vcfDepth ?? (MAX_DEPTH >= 5 ? 3 : 2);
  const vcfNodes = ai.vcfNodes ?? (MAX_DEPTH >= 5 ? 2500 : 1200);
  const vcfMove = tryVCF(vcfDepth, vcfNodes);
  if (vcfMove >= 0) {

    return vcfMove;
  }

  const countImmediateWins = (mark) => {
    let cnt = 0;
    for (const id of emptyIndices) {
      if (board[id]) continue;
      board[id] = mark;
      if (checkVictory(game, id, mark)) cnt++;
      board[id] = null;
      if (cnt >= 2) break;
    }
    return cnt;
  };
  for (const id of getCandidateMoves()) {
    if (board[id]) continue;
    board[id] = myMark;
    const wins = countImmediateWins(myMark);
    board[id] = null;
    if (wins >= 2) {
      
      return id;
    }
  }
  const oppWinsNow = countImmediateWins(opponentMark);
  if (oppWinsNow >= 2) {
    let bestId = -1;
    let bestWins = Infinity;
    for (const id of getCandidateMoves()) {
      if (board[id]) continue;
      board[id] = myMark;
      const w = countImmediateWins(opponentMark);
      board[id] = null;
      if (w < bestWins) { bestWins = w; bestId = id; }
      if (bestWins === 0) break;
    }
    if (bestId !== -1) {
       return bestId;
    }
  }

  function getCandidateMoves() {
    const hasAny = board.some(Boolean);
    if (!hasAny) return [Math.floor((size * size) / 2)];
    const candSet = new Set();
    const radius = 2;
    const hasStone = (r, c) => r >= 0 && r < size && c >= 0 && c < size && !!board[r * size + c];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const idx = r * size + c;
        if (board[idx]) continue;
        let near = false;
        for (let dr = -radius; dr <= radius && !near; dr++) {
          for (let dc = -radius; dc <= radius && !near; dc++) {
            if (dr === 0 && dc === 0) continue;
            if (hasStone(r + dr, c + dc)) near = true;
          }
        }
        if (near) candSet.add(idx);
      }
    }
    const addAround = (pIdx, rad = 3) => {
      if (!Number.isInteger(pIdx) || pIdx < 0) return;
      const pr = Math.floor(pIdx / size);
      const pc = pIdx % size;
      for (let r = Math.max(0, pr - rad); r <= Math.min(size - 1, pr + rad); r++) {
        for (let c = Math.max(0, pc - rad); c <= Math.min(size - 1, pc + rad); c++) {
          const idx = r * size + c;
          if (!board[idx]) candSet.add(idx);
        }
      }
    };
    addAround(game.lastHumanIdx, 3);
    addAround(game.lastBotIdx, 3);
    const midR = Math.floor(size / 2);
    const midC = Math.floor(size / 2);
    const center = midR * size + midC;
    if (!board[center]) candSet.add(center);
    for (let r = Math.max(0, midR - 2); r <= Math.min(size - 1, midR + 2); r++) {
      for (let c = Math.max(0, midC - 2); c <= Math.min(size - 1, midC + 2); c++) {
        const md = Math.abs(r - midR) + Math.abs(c - midC);
        if (md <= 2) {
          const idx = r * size + c;
          if (!board[idx]) candSet.add(idx);
        }
      }
    }
    const list = Array.from(candSet);
    return list.length ? list : [Math.floor((size * size) / 2)];
  }

  const scoreRun = (len, openEnds) => {
    if (len >= need) return 1_000_000;
    if (len === need - 1 && openEnds === 2) return 500_000; 
    if (len === need - 1 && openEnds === 1) return 50_000; 
    if (len === need - 2 && openEnds === 2) return 60_000; 
    if (len === need - 2 && openEnds === 1) return 6_000;  
    if (len === need - 3 && openEnds === 2) return 1_200;  
    if (len === need - 3 && openEnds === 1) return 200;     
    return 0;
  };
  const positionBias = (idx) => {
    const r = Math.floor(idx / size);
    const c = idx % size;
    const mid = (size - 1) / 2;
    const md = Math.abs(r - mid) + Math.abs(c - mid);
    const maxMd = mid * 2 || 1;
    const norm = 1 - md / maxMd; // [0..1]
    return norm * norm; // amplify center
  };

  const evaluateBoard = (mark) => {
    const dirs = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    const n = size;
    const get = (r, c) => (r >= 0 && r < n && c >= 0 && c < n ? board[r * n + c] : undefined);
    const other = mark === "X" ? "O" : "X";
    let myScore = 0;
    let oppScore = 0;

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        for (const [dr, dc] of dirs) {
          const cur = get(r, c);
          if (!cur) continue;
          const prev = get(r - dr, c - dc);
          if (prev === cur) continue;
          let rr = r, cc = c, len = 0;
          while (get(rr, cc) === cur) { len++; rr += dr; cc += dc; }
          const before = get(r - dr, c - dc);
          const after = get(rr, cc);
          const openBefore = before === null;
          const openAfter = after === null;
          const openEnds = (openBefore ? 1 : 0) + (openAfter ? 1 : 0);
          const val = scoreRun(len, openEnds);
          if (cur === mark) myScore += val; else if (cur === other) oppScore += val;
        }
      }
    }
    return myScore - oppScore;
  };

  if (gemini.enabled === true) {
    try {
      const mode = game.aiMode || 4;
      const pos = await suggestMove({ board, size, need, myMark, mode, timeoutMs: gemini.timeoutMs || 1200 });
      if (Number.isInteger(pos) && pos >= 0 && pos < board.length && !board[pos]) {
        return pos;
    }
  } catch {}
  }

  const candidatesBase = getCandidateMoves();
  const deadline = Date.now() + SEARCH_TIME_MS;
  const timeUp = () => Date.now() > deadline;

  const orderMoves = (moves, currentMark, ply = 0) => {
    const history = game.ai.history;
    const killers = game.ai.killer[ply] || [];
    const scored = moves.map((idx) => {
      let base = history[idx] || 0;
      if (killers.includes(idx)) base += 1_000;
      board[idx] = currentMark;
      const s = evaluateBoard(myMark);
      board[idx] = null;
      const pos = positionBias(idx) * 3000 * centerWeight;
      return { idx, s: s + base + pos };
    });
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, CAND_LIMIT).map((x) => x.idx);
  };

  let bestMove = candidatesBase[0];
  let bestScore = -Infinity;

  const alphaBeta = (depth, alpha, beta, currentMark, ply = 0) => {
    if (timeUp()) return evaluateBoard(myMark);
    if (depth === 0) return evaluateBoard(myMark);
    const moves = orderMoves(candidatesBase, currentMark, ply);
    const zKeyBase = computeZobristKey(board, size, game.ai.zobrist);
    if (currentMark === myMark) {
      let value = -Infinity;
      for (const idx of moves) {
        board[idx] = currentMark;
        const win = checkVictory(game, idx, currentMark);
        const zKey = zKeyBase ^ game.ai.zobrist[idx][currentMark === "X" ? 0 : 1];
        const cached = game.ai.tt.get(zKey);
        let score;
        if (win) score = 1_000_000; else if (cached && cached.depth >= depth - 1) {
          score = cached.value;
        } else {
          score = alphaBeta(depth - 1, alpha, beta, opponentMark, ply + 1);
          game.ai.tt.set(zKey, { depth: depth - 1, value: score });
        }
        board[idx] = null;
        if (score > value) value = score;
        if (value > alpha) alpha = value;
        if (alpha >= beta) {
          const killers = game.ai.killer[ply] || [];
          if (!killers.includes(idx)) {
            killers.unshift(idx);
            game.ai.killer[ply] = killers.slice(0, 2);
          }
          break;
        }
      }
      return value;
    } else {
      let value = Infinity;
      for (const idx of moves) {
        board[idx] = currentMark;
        const win = checkVictory(game, idx, currentMark);
        const zKey = zKeyBase ^ game.ai.zobrist[idx][currentMark === "X" ? 0 : 1];
        const cached = game.ai.tt.get(zKey);
        let score;
        if (win) score = -1_000_000; else if (cached && cached.depth >= depth - 1) {
          score = cached.value;
        } else {
          score = alphaBeta(depth - 1, alpha, beta, myMark, ply + 1);
          game.ai.tt.set(zKey, { depth: depth - 1, value: score });
        }
        board[idx] = null;
        if (score < value) value = score;
        if (value < beta) beta = value;
        if (alpha >= beta) {
          const killers = game.ai.killer[ply] || [];
          if (!killers.includes(idx)) {
            killers.unshift(idx);
            game.ai.killer[ply] = killers.slice(0, 2);
          }
          break;
        }
      }
      return value;
    }
  };

  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    if (timeUp()) break;
    let localBest = bestMove;
    let localScore = -Infinity;
    const moves = orderMoves(candidatesBase, myMark, 0);
    for (const idx of moves) {
      if (timeUp()) break;
      board[idx] = myMark;
      const win = checkVictory(game, idx, myMark);
      const score = win ? 1_000_000 : alphaBeta(depth - 1, -Infinity, Infinity, opponentMark, 1);
      board[idx] = null;
      if (score > localScore) { localScore = score; localBest = idx; }
    }
    if (localScore > bestScore) { bestScore = localScore; bestMove = localBest; }
    // history heuristic bump for principal move
    if (Number.isInteger(localBest) && localBest >= 0) {
      game.ai.history[localBest] = (game.ai.history[localBest] || 0) + depth * depth;
    }
  }

  if (bestMove !== undefined && bestMove !== null) {
    return bestMove;
  }
  const center = Math.floor((size * size) / 2);
  if (!board[center]) return center;
  return emptyIndices[0];
}

async function botMove(game, api) {
  try {
  if (game.state !== "playing") return;
  if (!isBotUid(game.turnUid)) return;
  clearTimeoutIfAny(game.timeoutId);
    let idx = -1;
    try {
      idx = await botChooseMove(game);
    } catch (e) {
      idx = pickFallbackMove(game);
    }
    if (!Number.isInteger(idx) || idx < 0) idx = pickFallbackMove(game);
    if (!Number.isInteger(idx) || idx < 0) return;
  const sym = game.marks[game.turnUid];
  game.board[idx] = sym;
  game.lastBotIdx = idx;
  try { appendGameLog(game.gameLogFile, { ev: "bot_move", idx, sym }); } catch {}
  const win = checkVictory(game, idx, sym);
  const full = game.board.every(Boolean);
    if (win || full) {
    game.state = "ended";
    await sendBoardAndRegister(game, api, `🤖 ${BOT_NAME} đã đánh ô: ${idx + 1}.`);
      if (win) {
        try { appendGameLog(game.gameLogFile, { ev: "end", result: "bot_win" }); await learnFromOutcome({ mode: game.aiMode || 4, result: "bot_win" }); } catch {}
        await api.sendMessage(`🤖 ${BOT_NAME} đã thắng!`, game.threadId, game.threadType);
      } else {
        try { appendGameLog(game.gameLogFile, { ev: "end", result: "draw" }); } catch {}
        await api.sendMessage("Trận đấu hòa!", game.threadId, game.threadType);
      }
    activeGames.delete(game.threadId);
    clearPendingReply(game.threadId);
    return;
  }
  const human = otherPlayer(game, game.turnUid);
  game.turnUid = human.uid;
  game.turnName = human.name;
  await sendBoardAndRegister(game, api, `🤖 ${BOT_NAME} đã đánh ô: ${idx + 1}.`);
  } catch {
  
  }
}

function sendBoardAndRegister(game, api, header = "") {
  const { threadId, threadType } = game;
  const img = drawBoardImage(game);
  const turn = game.players.find((p) => p.uid === game.turnUid) || {};
  const turnTag = buildMention(turn.name || "?");
  const base = `Bàn cờ ${game.size}x${game.size}. Đến lượt ${turnTag}`;
  const txt = (header ? header + "\n" : "") + base + (img ? "" : `\n\n${renderBoardText(game)}`);
  const mArr = turn.uid && !isBotUid(turn.uid)
    ? [{ pos: txt.lastIndexOf(turnTag), len: turnTag.length, uid: turn.uid }]
    : [];
  const payload = img ? { msg: txt, attachments: [img], mentions: mArr } : { msg: txt, mentions: mArr };
  return api
    .sendMessage(
      payload,
      threadId,
      threadType,
    )
    .then(async (res) => {
      try {
        if (img && fs.existsSync(img)) {
          await fs.promises.unlink(img).catch(() => {});
        }
      } catch {}

      if (game.lastBoardMsgId) {
        try {
          await api.undo(
            {
              msgId: game.lastBoardMsgId,
              cliMsgId: game.lastBoardCliMsgId || 0,
            },
            threadId,
            threadType,
          );
        } catch {}
      }
      const extract = (d) => {
        const out = { msgId: null, cliMsgId: 0 };
        const rec = (o) => {
          if (!o || typeof o != "object") return;
          if (Array.isArray(o)) return o.forEach(rec);
          if (!out.msgId && o.msgId) out.msgId = o.msgId;
          if (!out.cliMsgId && typeof o.cliMsgId != "undefined")
            out.cliMsgId = o.cliMsgId;
          Object.values(o).forEach(rec);
        };
        rec(d);
        return out;
      };
      const ids = extract(res);
      game.lastBoardMsgId = ids.msgId;
      game.lastBoardCliMsgId = ids.cliMsgId;
      if (!isBotUid(game.turnUid)) {
        dangKyReply({
          msgId: ids.msgId,
          cliMsgId: ids.cliMsgId,
          threadId,
          command: "caro",
          allowThreadFallback: true,
          matcher: ({ content }) => /^\d{1,3}$/.test(content.trim()),
          onReply: async ({ message, content }) => {
            await handleMove(game, message, content.trim(), api);
            return { clear: false };
          },
        });
        datChoPhanHoi(threadId, {
          authorId: game.turnUid,
          ttlMs: TURN_TIME_MS + 10_000,
          matcher: ({ content }) => /^\d{1,3}$/.test((content || "").trim()),
          handler: async ({ message, content }) => {
            await handleMove(game, message, content.trim(), api);
            return { clear: false };
          },
        });
        scheduleTurnTimer(game, api);
      } else {
       
        setTimeout(() => {
          botMove(game, api).catch(() => {});
        }, 200);
      }
      return res;
    });
}

async function handleMove(game, message, content, api) {
  const { threadId, threadType } = game;
  const uid = message.data?.uidFrom;
  if (game.state !== "playing") return;
  if (uid !== game.turnUid)
    return api.sendMessage("Chưa tới lượt bạn!", threadId, threadType);
  const idx = parseInt(content, 10) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= game.board.length)
    return api.sendMessage("Ô không hợp lệ!", threadId, threadType);
  if (game.board[idx])
    return api.sendMessage("Ô đã được đánh!", threadId, threadType);
  const sym = game.marks[uid];
  clearTimeoutIfAny(game.timeoutId);
  game.board[idx] = sym;
  try { appendGameLog(game.gameLogFile, { ev: "human_move", idx, sym }); } catch {}
  game.lastHumanIdx = idx;
  const win = checkVictory(game, idx, sym);
  const full = game.board.every(Boolean);
  if (win || full) {
    game.state = "ended";
    await sendBoardAndRegister(game, api);
    if (win) {
      await api.sendMessage(
        `🎉 ${game.players.find((p) => p.uid === uid).name} đã thắng!`,
        threadId,
        threadType,
      );
      try { appendGameLog(game.gameLogFile, { ev: "end", result: "human_win" }); await learnFromOutcome({ mode: game.aiMode || 4, result: "bot_lose" }); } catch {}
      try {
        if (!isBotUid(uid)) {
          await query(
            "UPDATE users SET caro = caro + 1 WHERE uid = ?",
            [uid]
          );
        }
      } catch {}
    } else {
      await api.sendMessage("Trận đấu hòa!", threadId, threadType);
      try { appendGameLog(game.gameLogFile, { ev: "end", result: "draw" }); } catch {}
    }
    activeGames.delete(threadId);
    clearPendingReply(threadId);
    return;
  }
  const other = otherPlayer(game, uid);
  game.turnUid = other.uid;
  game.turnName = other.name;
  if (!isBotUid(other.uid)) {
    datChoPhanHoi(threadId, {
      authorId: other.uid,
      ttlMs: TURN_TIME_MS + 10_000,
      matcher: ({ content }) => /^\d{1,3}$/.test((content || "").trim()),
      handler: async ({ message, content }) => {
        await handleMove(game, message, content.trim(), api);
        return { clear: false };
      },
    });
    await sendBoardAndRegister(game, api, `Bạn đã đánh ô: ${idx + 1}.`);
  } else {
    await sendBoardAndRegister(game, api, `Bạn đã đánh ô: ${idx + 1}.`);
  }
}

async function startGame(game, api) {
  let first;

  const hasBot = game.players.some((p) => isBotUid(p.uid));
  if (game.aiMode === 4 && hasBot) {
    first = game.players.find((p) => isBotUid(p.uid));
  } else {
    first = Math.random() < 0.5 ? game.players[0] : game.players[1];
  }
  const second = otherPlayer(game, first.uid);
  game.marks[first.uid] = "X";
  game.marks[second.uid] = "O";
  game.turnUid = first.uid;
  game.turnName = first.name;
  game.state = "playing";
  await sendBoardAndRegister(
    game,
    api,
    `Bắt đầu ván caro ${game.size}x${game.size}!\n${buildMention(first.name)} đi trước (X)`,
  );
  try { appendGameLog(game.gameLogFile, { ev: "start", first: first.uid, second: second.uid }); } catch {}
}

export default {
  name: "caro",
  description: "Chơi caro",
  role: 0,
  cooldown: 3,
  group: "minigame",
  aliases: [],
  noPrefix: false,
  async run({ message, api, args }) {
    const threadId = message.threadId,
      threadType = message.type ?? ThreadType.User,
      uid = message.data?.uidFrom;
    
    // Kiểm tra user có tồn tại trong database không
    const [userExists] = await query("SELECT uid FROM users WHERE uid = ?", [uid]);
    if (!userExists) {
      return api.sendMessage("Bạn chưa có tài khoản trong hệ thống. Vui lòng tương tác với bot trước.", threadId, threadType);
    }
    
    const sub = (args[0] || "").toLowerCase();
    // CREATE
    if (sub === "create") {
      if (activeGames.has(threadId))
        return api.sendMessage(
          "Đã có phòng caro trong nhóm.",
          threadId,
          threadType,
        );
      const modes = Array.from({ length: 14 }, (_, i) => i + 3);
      const list = modes.map((s, i) => `${i + 1}. ${s}x${s}`).join("\n");
      const prompt = `🎮 𝐕𝐮𝐢 𝐋𝐨̀𝐧𝐠 𝐂𝐡𝐨̣𝐧 𝐁𝐚̀𝐧 𝐂𝐚𝐫𝐨\n⋆────────────────⋆\n${list}\n⋆────────────────⋆\n❓ Reply Tin Nhắn Bot + STT Để Tạo Bàn Caro`;
      const res = await api.sendMessage(prompt, threadId, threadType);
      const msgId = res?.message?.msgId ?? res?.msgId ?? null;
      const cli = res?.message?.cliMsgId ?? res?.cliMsgId ?? null;
      dangKyReply({
        msgId,
        cliMsgId: cli,
        threadId,
        authorId: uid,
        command: "caro",
        onReply: async ({ content }) => {
          const pick = parseInt(content.trim(), 10);
          if (!pick || pick < 1 || pick > modes.length) {
            await api.sendMessage(
              "Lựa chọn không hợp lệ!",
              threadId,
              threadType,
            );
            return { clear: false };
          }
          const size = modes[pick - 1];
          const name = await getDisplayName(api, uid);
          const game = {
            threadId,
            threadType,
            size,
            board: makeEmptyBoard(size),
            players: [{ uid, name }],
            marks: {},
            state: "waiting",
            turnUid: null,
            turnName: null,
            lastBoardMsgId: null,
            lastBoardCliMsgId: 0,
            timeoutId: null,
          };
          activeGames.set(threadId, game);
          const need = size <= 3 ? 3 : 5;
          await api.sendMessage(
            `Tạo phòng đấu thành công!\nMode: ${size}x${size} (thắng khi nối ${need} ô liên tiếp)\nVui lòng chat .caro join để tham gia ván đấu.`,
            threadId,
            threadType,
          );
          return { clear: true };
        },
      });
      return;
    }
    // JOIN
    if (sub === "join") {
      const game = activeGames.get(threadId);
      if (!game)
        return api.sendMessage(
          "Không có phòng, dùng .caro create",
          threadId,
          threadType,
        );
      if (game.state !== "waiting")
        return api.sendMessage(
          "Phòng đã đủ người hoặc đang chơi!",
          threadId,
          threadType,
        );
      if (game.players.some((p) => p.uid === uid))
        return api.sendMessage("Bạn đã tham gia rồi!", threadId, threadType);
      const name = await getDisplayName(api, uid);
      game.players.push({ uid, name });
      await api.sendMessage(`${name} đã tham gia phòng!`, threadId, threadType);
      await startGame(game, api);
      return;
    }
    // LEAVE
    if (sub === "leave") {
      const game = activeGames.get(threadId);
      if (!game)
        return api.sendMessage("Không có phòng caro.", threadId, threadType);
      const idx = game.players.findIndex((p) => p.uid === uid);
      if (idx === -1)
        return api.sendMessage(
          "Bạn không tham gia ván nào.",
          threadId,
          threadType,
        );
      if (game.state === "waiting") {
        game.players.splice(idx, 1);
        if (game.players.length === 0) activeGames.delete(threadId);
        return api.sendMessage("Đã rời phòng chờ.", threadId, threadType);
      }
      if (game.state === "playing") {
        const winner = otherPlayer(game, uid);
        if (winner) {
          try {
            await query(
              "UPDATE users SET caro = caro + 1 WHERE uid = ?",
              [winner.uid]
            );
          } catch {}
          await api.sendMessage(
            `⚠️ ${game.players.find((p) => p.uid === uid).name} rời trận, ${winner.name} thắng!`,
            threadId,
            threadType,
          );
        }
        activeGames.delete(threadId);
        clearPendingReply(threadId);
        return;
      }
    }
    // RANK
    if (sub === "rank") {
      try {
        const rows = await query(
          "SELECT uid,name,caro FROM users WHERE caro IS NOT NULL ORDER BY caro DESC LIMIT 10",
        );
        if (!rows.length)
          return api.sendMessage("Chưa có dữ liệu.", threadId, threadType);
        if (!createCanvas) {
       
          const lines = ["🏆 Top 10 Caro:"]; 
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            lines.push(`${i + 1}. ${r.name || r.uid}: ${r.caro} điểm`);
          }
          return api.sendMessage(lines.join("\n"), threadId, threadType);
        }
        const uids = rows.map((r) => r.uid);
        const avatars = {};
        try {
          const info = await api.getUserInfo(uids);
          const map = info.changed_profiles || {};
          rows.forEach((r) => {
            const k = Object.keys(map).find((x) => x.startsWith(r.uid));
            if (k) avatars[r.uid] = map[k].avatar;
          });
        } catch {}
        const width = 700,
          rowH = 70,
          headerH = 100,
          height = headerH + rows.length * rowH + 40;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext("2d");
        const g = ctx.createLinearGradient(0, 0, 0, height);
        g.addColorStop(0, "#1b2735");
        g.addColorStop(1, "#090a0f");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 40px Arial";
        ctx.textAlign = "center";
        ctx.fillText("CARO RANKING TOP 10", width / 2, 60);
        ctx.textAlign = "left";
        for (let i = 0; i < rows.length; i++) {
          const y = headerH + i * rowH;
          const rnk = i + 1;
          if (avatars[rows[i].uid]) {
            try {
              const buf = await axios.get(avatars[rows[i].uid], {
                responseType: "arraybuffer",
              });
              const img = await loadImage(buf.data);
              const sz = 50;
              ctx.save();
              ctx.beginPath();
              ctx.arc(60, y + rowH / 2, sz / 2, 0, Math.PI * 2);
              ctx.closePath();
              ctx.clip();
              ctx.drawImage(img, 35, y + rowH / 2 - sz / 2, sz, sz);
              ctx.restore();
            } catch {}
          }
          ctx.fillStyle = "#f1c40f";
          ctx.font = "bold 28px Arial";
          ctx.fillText(String(rnk), 10, y + rowH / 2 + 10);
          ctx.fillStyle = "#ecf0f1";
          ctx.font = "24px Arial";
          ctx.fillText(rows[i].name || "Không rõ", 100, y + rowH / 2 + 10);
          ctx.fillStyle = "#e67e22";
          ctx.font = "24px Arial";
          ctx.textAlign = "right";
          ctx.fillText(`${rows[i].caro} điểm`, width - 40, y + rowH / 2 + 10);
          ctx.textAlign = "left";
        }
        const dir = path.resolve("Data", "Cache", "CaroRank");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `rank_${Date.now()}.png`);
        fs.writeFileSync(file, canvas.toBuffer("image/png"));
        const result = await api.sendMessage(
          { msg: "🏆 Bảng Xếp Hạng Caro", attachments: [file] },
          threadId,
          threadType,
        );
        
        try {
          if (fs.existsSync(file)) {
            await fs.promises.unlink(file).catch(() => {});
          }
        } catch {}
        
        return result;
      } catch {
        return api.sendMessage("Lỗi xếp hạng", threadId, threadType);
      }
    }
    if (sub === "canvas" || sub === "preview") {
      const sz = parseInt(args[1] || "", 10);
      if (!sz || sz < 3 || sz > 16)
        return api.sendMessage(
          "Dùng: .caro canvas <3-16>",
          threadId,
          threadType,
        );
      const dummy = {
        threadId,
        threadType,
        size: sz,
        board: makeEmptyBoard(sz),
        players: [
          { uid: "0", name: "A" },
          { uid: "1", name: "B" },
        ],
        marks: {},
      };
      const img = drawBoardImage(dummy);
      if (!img) {
        const text = `Preview ${sz}x${sz}\n\n${renderBoardText(dummy)}`;
        return api.sendMessage(text, threadId, threadType);
      }
      const result = await api.sendMessage(
        { msg: `Preview ${sz}x${sz}`, attachments: [img] },
        threadId,
        threadType,
      );
      
      try {
        if (fs.existsSync(img)) {
          await fs.promises.unlink(img).catch(() => {});
        }
      } catch {}
      
      return result;
    }
    if (sub === "bot") {
      if (activeGames.has(threadId))
        return api.sendMessage(
          "Đã có phòng caro trong nhóm.",
          threadId,
          threadType,
        );
      const diffMsg = [
        "🎮 Chọn độ khó:",
        "1. Easy",
        "2. Normal",
        "3. Hard",
        "4. Super Hard",
        "❓ Trả lời tin nhắn này bằng số (1-4)"
      ].join("\n");
      const sent = await api.sendMessage(diffMsg, threadId, threadType);
      const diffMsgId = sent?.message?.msgId ?? sent?.msgId;
      const diffCli = sent?.message?.cliMsgId ?? sent?.cliMsgId ?? 0;
      dangKyReply({
        msgId: diffMsgId,
        cliMsgId: diffCli,
        threadId,
        authorId: uid,
        command: "caro",
        onReply: async ({ content }) => {
          const pick = parseInt(String(content || "").trim(), 10);
          if (![1,2,3,4].includes(pick)) {
            await api.sendMessage("Vui lòng chọn 1-4.", threadId, threadType);
            return { clear: false };
          }
          const sizes = [3,4,5,6,7,8,9,10,12,14,16];
          const options = sizes.map((s, i) => `${i + 1}. ${s}x${s}`).join("\n");
          const msg = [
            "🧩 Chọn kích thước bàn:",
            options,
            "❓ Trả lời tin nhắn này bằng STT"
          ].join("\n");
          const sent2 = await api.sendMessage(msg, threadId, threadType);
          const msg2Id = sent2?.message?.msgId ?? sent2?.msgId;
          const cli2 = sent2?.message?.cliMsgId ?? sent2?.cliMsgId ?? 0;
          dangKyReply({
            msgId: msg2Id,
            cliMsgId: cli2,
            threadId,
            authorId: uid,
            command: "caro",
            onReply: async ({ content }) => {
              const stt = parseInt(String(content || "").trim(), 10);
              if (!stt || stt < 1 || stt > sizes.length) {
                await api.sendMessage("Lựa chọn không hợp lệ!", threadId, threadType);
                return { clear: false };
              }
              const size = sizes[stt - 1];
      const name = await getDisplayName(api, uid);
             
              const diffParams = {
               
                1: {
                  maxDepth: 1,
                  searchTimeMs: 300,
                  candidatesLimit: 10,
                  centerWeight: 1.2,
                  centerRadius: 2,
                  gemini: {
                    enabled: true,
                    timeoutMs: 800,
                    systemPrompt:
                      "Bạn là AI caro (Easy). Chỉ trả về MỘT số hợp lệ (1..S*S). Chiến lược: ưu tiên an toàn, chặn đe doạ rõ ràng, tránh nước vô nghĩa, TRUNG TÂM ƯU TIÊN khi đầu ván, không đi ở biên khi chưa cần."
                  }
                },
                2: {
                  maxDepth: 2,
                  searchTimeMs: 800,
                  candidatesLimit: 14,
                  centerWeight: 1.4,
                  centerRadius: 2,
                  gemini: {
                    enabled: true,
                    timeoutMs: 1000,
                    systemPrompt:
                      "Bạn là AI caro (Normal). Chỉ trả về MỘT số hợp lệ (1..S*S). Chiến lược: cân bằng công thủ, ƯU TIÊN trung tâm và chéo trung tâm, chặn ngay đe doạ, tránh biên nếu không có giá trị."
                  }
                },
                3: {
                  maxDepth: 3,
                  searchTimeMs: 1200,
                  candidatesLimit: 18,
                  centerWeight: 1.6,
                  centerRadius: 3,
                  gemini: {
                    enabled: true,
                    timeoutMs: 1200,
                    systemPrompt:
                      "Bạn là AI caro (Hard). Chỉ trả về MỘT số hợp lệ (1..S*S). Chiến lược: đe doạ kép, chuỗi mở 3/4, KIỂM SOÁT TRUNG TÂM mạnh, tránh nước biên vô nghĩa, ưu tiên giao điểm gần trung tâm."
                  }
                },
                4: {
                  maxDepth: 7,
                  searchTimeMs: 3500,
                  candidatesLimit: 30,
                  centerWeight: 2.5,
                  centerRadius: 3,
                  vcfDepth: 4,
                  vcfNodes: 5000,
                  gemini: {
                    enabled: false,
                    timeoutMs: 1800,
                    systemPrompt:
                      "Bạn là AI gomoku (Super Hard). Chỉ trả về MỘT số hợp lệ (1..S*S). Chiến lược: ƯU TIÊN THẮNG/ÉP THẮNG, ĐÒN KÉP, KIỂM SOÁT TRUNG TÂM VÀ VÀNH TRUNG TÂM, bám trục/chéo trung tâm, không đi biên trừ khi bắt buộc."
                  }
                },
              };
            
              const learn = await loadLearnConfig(pick).catch(() => ({}));
      const game = {
        threadId,
        threadType,
        size,
        board: makeEmptyBoard(size),
        players: [
          { uid, name },
          { uid: BOT_UID, name: BOT_NAME },
        ],
        marks: {},
        state: "waiting",
        turnUid: null,
        turnName: null,
        lastBoardMsgId: null,
        lastBoardCliMsgId: 0,
        timeoutId: null,
                ai: { ...diffParams[pick], ...learn },
                aiMode: pick
      };
              game.gameLogFile = await openGameLog({ mode: pick, size }).catch(() => null);
              appendGameLog(game.gameLogFile, { ev: "create", mode: pick, size });
      activeGames.set(threadId, game);
      await startGame(game, api);
              return { clear: true };
            }
          });
          return { clear: true };
        }
      });
      return;
    }
    // HELP
    return api.sendMessage(
      [
        "🎮 Trò Chơi: Caro",
        "- .caro create",
        "- .caro join",
        "- .caro leave",
        "- .caro rank",
        "- .caro bot [size]",
      ].join("\n"),
      threadId,
      threadType,
    );
  },
};
