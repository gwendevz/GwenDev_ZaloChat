// author @GwenDev
import fs from "fs";
import path from "path";
import { ThreadType } from "zca-js";
import { dangKyReply, clearPendingReply, datChoPhanHoi } from "../../Handlers/HandleReply.js";

let createCanvas;
let loadImage;
try {
  const mod = await import("canvas");
  createCanvas = mod.createCanvas;
  loadImage = mod.loadImage;
} catch {}

import { Chess } from "chess.js";
import fetch from "node-fetch";
import { settings } from "../../App/Settings.js";
import axios from "axios";

const BOARD_SIZE = 64; 
const DRAW_MARGIN = 48; 
const RANKS = [...Array(8)].map((_, i) => i);
const TOP_PAD = 40;
const AVATAR_TOP_PAD = 48; 
const TURN_TIME_MS = 60_000;

const PIECE_FILES = {
  p: "black-pawn.png",
  r: "black-rook.png",
  n: "black-knight.png",
  b: "black-bishop.png",
  q: "black-queen.png",
  k: "black-king.png",
  P: "white-pawn.png",
  R: "white-rook.png",
  N: "white-knight.png",
  B: "white-bishop.png",
  Q: "white-queen.png",
  K: "white-king.png",
};

const pieceLetters = Object.keys(PIECE_FILES);
let pieceImages = null;
async function ensurePieceImages() {
  if (pieceImages || !loadImage) return;
  const baseDir = path.resolve("Api", "Covua", "Image");
  const imgs = await Promise.all(
    pieceLetters.map(async (k) => {
      const file = path.join(baseDir, PIECE_FILES[k]);
      return await loadImage(file);
    })
  );
  pieceImages = imgs.reduce((acc, img, idx) => {
    acc[pieceLetters[idx]] = img;
    return acc;
  }, {});
}

async function getDisplayName(api, uid) {
  try {
    const info = await api.getUserInfo(uid);
    const profiles = info?.changed_profiles || {};
    const key = Object.keys(profiles).find((k) => k.startsWith(String(uid)));
    const p = key ? profiles[key] : null;
    return p?.displayName || p?.zaloName || p?.username || String(uid);
  } catch {
    return String(uid);
  }
}

async function getUserProfile(api, uid) {
  try {
    const info = await api.getUserInfo(uid);
    const profiles = info?.changed_profiles || {};
    const key = Object.keys(profiles).find((k) => k.startsWith(String(uid)));
    const p = key ? profiles[key] : null;
    return {
      name: p?.displayName || p?.zaloName || p?.username || String(uid),
      avatar: p?.avatar || null,
    };
  } catch {
    return { name: String(uid), avatar: null };
  }
}

function rcToSquare(rc) {
  const s = String(rc || "").trim();
  if (!/^\d{2}$/.test(s)) return null;
  const row = parseInt(s[0], 10);
  const col = parseInt(s[1], 10);
  if (row < 1 || row > 8 || col < 1 || col > 8) return null;
  const file = String.fromCharCode("a".charCodeAt(0) + (col - 1));
  const rank = String(row);
  return `${file}${rank}`;
}

function parseHumanMove(input) {
 const t = String(input || "").trim().toLowerCase().replace(/\s+/g, "");
  const m = t.match(/^(\d{2})-?(\d{2})$/);
  if (m) {
    const from = rcToSquare(m[1]);
    const to = rcToSquare(m[2]);
    if (from && to) return { from, to };
  }
  const m2 = t.match(/^([a-h][1-8])([a-h][1-8])$/);
  if (m2) return { from: m2[1], to: m2[2] };
  return null;
}

async function drawBoardImage(chess, footerText = "", players = { userName: "", userAvatar: null, opponentName: "Gemini", opponentAvatar: null, turn: "user" }) {
  if (!createCanvas) return null;
  await ensurePieceImages();
  const avatarArea = 120;
  const canvas = createCanvas(
    BOARD_SIZE * 8 + DRAW_MARGIN * 2,
    TOP_PAD + BOARD_SIZE * 8 + DRAW_MARGIN * 2 + avatarArea
  );
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  RANKS.forEach((r) => {
    RANKS.forEach((c) => {
      const color = (r + c) % 2 === 0 ? "#f0d9b5" : "#b58863";
      const x = DRAW_MARGIN + c * BOARD_SIZE;
      const y = TOP_PAD + DRAW_MARGIN + r * BOARD_SIZE;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, BOARD_SIZE, BOARD_SIZE);
  
      const rank = 8 - r;
      const col = c + 1;
      const label = `${rank}${col}`;
      ctx.font = "bold 13px Arial";
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(label, x + 3, y + 2);
    });
  });

  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.strokeRect(DRAW_MARGIN, TOP_PAD + DRAW_MARGIN, BOARD_SIZE * 8, BOARD_SIZE * 8);

  ctx.font = "18px Arial";
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  RANKS.forEach((i) => {
    ctx.fillText(8 - i, DRAW_MARGIN / 2, TOP_PAD + DRAW_MARGIN + i * BOARD_SIZE + BOARD_SIZE / 2);
    ctx.fillText(String.fromCharCode(65 + i), DRAW_MARGIN + i * BOARD_SIZE + BOARD_SIZE / 2, TOP_PAD + DRAW_MARGIN + BOARD_SIZE * 8 + DRAW_MARGIN / 2);
  });

  const board = chess.board();
  board.forEach((row, r) => {
    row.forEach((p, c) => {
      if (!p) return;
      const key = p.color === "b" ? p.type : p.type.toUpperCase();
      const img = pieceImages?.[key];
      if (img) {
        ctx.drawImage(
          img,
          DRAW_MARGIN + c * BOARD_SIZE,
          TOP_PAD + DRAW_MARGIN + r * BOARD_SIZE,
          BOARD_SIZE,
          BOARD_SIZE
        );
      }
    });
  });
  const baseY = TOP_PAD + DRAW_MARGIN + BOARD_SIZE * 8 + AVATAR_TOP_PAD;
  const avatarSize = 64;
  const leftX = DRAW_MARGIN + 80;
  const rightX = DRAW_MARGIN + BOARD_SIZE * 8 - 80 - avatarSize;

  if (players?.userAvatar) {
    try {
      const buf = await axios.get(players.userAvatar, { responseType: "arraybuffer" });
      const img = await loadImage(buf.data);
      ctx.save();
      ctx.beginPath();
      ctx.arc(leftX + avatarSize / 2, baseY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, leftX, baseY, avatarSize, avatarSize);
      ctx.restore();
    } catch {
      ctx.fillStyle = "#ddd";
      ctx.beginPath();
      ctx.arc(leftX + avatarSize / 2, baseY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = "#ddd";
    ctx.beginPath();
    ctx.arc(leftX + avatarSize / 2, baseY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#111";
  ctx.font = "18px Arial";
  ctx.textAlign = "center";
  ctx.fillText(players?.userName || "Người chơi", leftX + avatarSize / 2, baseY + avatarSize + 22);
 if (players?.opponentAvatar) {
    try {
      const buf = await axios.get(players.opponentAvatar, { responseType: "arraybuffer" });
      const img = await loadImage(buf.data);
      ctx.save();
      ctx.beginPath();
      ctx.arc(rightX + avatarSize / 2, baseY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, rightX, baseY, avatarSize, avatarSize);
      ctx.restore();
    } catch {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(rightX + avatarSize / 2, baseY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ccc";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(rightX + avatarSize / 2, baseY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = "#111";
  ctx.font = "18px Arial";
  ctx.textAlign = "center";
  ctx.fillText(players?.opponentName || "Gemini", rightX + avatarSize / 2, baseY + avatarSize + 22);

  
  try {
    const ringColor = "#86efac";
    const ringWidth = 6;
    const ringBlur = 10;
    if (players?.turn === "user") {
      ctx.save();
      ctx.beginPath();
      ctx.arc(leftX + avatarSize / 2, baseY + avatarSize / 2, avatarSize / 2 + ringWidth, 0, Math.PI * 2);
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = ringWidth;
      ctx.shadowColor = "rgba(34,197,94,0.5)";
      ctx.shadowBlur = ringBlur;
      ctx.stroke();
      ctx.restore();
    } else if (players?.turn === "bot") {
      ctx.save();
      ctx.beginPath();
      ctx.arc(rightX + avatarSize / 2, baseY + avatarSize / 2, avatarSize / 2 + ringWidth, 0, Math.PI * 2);
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = ringWidth;
      ctx.shadowColor = "rgba(34,197,94,0.5)";
      ctx.shadowBlur = ringBlur;
      ctx.stroke();
      ctx.restore();
    }
  } catch {}

  const cacheDir = path.resolve("Data", "Cache", "Covua");
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const file = path.join(cacheDir, `covua_${Date.now()}.png`);
  fs.writeFileSync(file, canvas.toBuffer("image/png"));
  return file;
}

const activeGames = new Map(); 
function otherPlayerUid(game, uid) {
  if (!game.whiteUid || !game.blackUid) return null;
  return String(uid) === String(game.whiteUid) ? game.blackUid : game.whiteUid;
}
function clearTurnTimer(game) {
  try { if (game.turnTimeoutId) clearTimeout(game.turnTimeoutId); } catch {}
  game.turnTimeoutId = null;
}

function buildLegalMoveMap(chess) {
  const moves = chess.moves({ verbose: true });
  return moves.map((m) => {
    const rankFileToRc = (sq) => {
      const file = sq[0].charCodeAt(0) - "a".charCodeAt(0) + 1;
      const rank = parseInt(sq[1], 10);
      return `${rank}${file}`;
    };
    return {
      from: m.from,
      to: m.to,
      san: m.san,
      rc: `${rankFileToRc(m.from)}-${rankFileToRc(m.to)}`,
    };
  });
}

function chooseFallbackBotMove(chess) {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;
  return moves[Math.floor(Math.random() * moves.length)];
}

async function askGeminiForMove({ chess, side }) {
  try {
    const fen = chess.fen();
    const legal = buildLegalMoveMap(chess);
    const legalList = legal.map((m) => `- ${m.rc} (${m.from}${m.to})`).join("\n");
    const prompt = `Bạn là engine cờ vua. Nhiệm vụ: chọn 1 nước đi HỢP LỆ duy nhất cho bên ${side === "b" ? "ĐEN" : "TRẮNG"}.
Trạng thái bàn cờ (FEN): ${fen}
Danh sách tất cả nước đi hợp lệ (đã chuyển đổi):\n${legalList}\n\nYÊU CẦU:
- Trả về đúng 1 dòng, chỉ chứa nước đi định dạng RC-RC: rrcc, ví dụ: "22-32" nghĩa là từ hàng 2 cột 2 sang hàng 3 cột 2 (b2-b3). Không giải thích thêm.
- Nếu có phong cấp, vẫn trả định dạng RC-RC theo from-to (ví dụ: "72-82" tương ứng b7-b8=Q).`;
    const apiKey = settings.apis?.gemini?.key;
    const model = settings.apis?.gemini?.model || "gemini-2.5-flash";
    if (!apiKey) throw new Error("Missing GEMINI API KEY");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const body = {
      contents: [
        { role: "user", parts: [{ text: prompt }] }
      ],
      generationConfig: { temperature: 0.3, maxOutputTokens: 256 }
    };
    const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await resp.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const answer = parts.map(p => p.text || "").join("").trim();
    const text = String(answer || "").trim().toLowerCase();
    const m = text.match(/(\d{2})\s*[-\s]?\s*(\d{2})/);
    if (!m) return null;
    const from = rcToSquare(m[1]);
    const to = rcToSquare(m[2]);
    if (!from || !to) return null;
    const ok = legal.find((mv) => mv.from === from && mv.to === to);
    if (!ok) return null;
    return { from, to };
  } catch {
    return null;
  }
}

export default {
  name: "covua",
  description: "Chơi cờ vua với bot Gemini (chat kiểu 22-32, không cần reply)",
  group: "minigame",
  role: 0,
  cooldown: 3,
  aliases: [],
  noPrefix: false,

  async run({ message, api, args }) {
    const threadId = message.threadId;
    const threadType = message.type ?? ThreadType.User;
    const uid = message.data?.uidFrom;
    const sub = (args[0] || "").toLowerCase();

    if (!sub || !["bot","create","join"].includes(sub)) {
      return api.sendMessage(
        { msg: "Dùng: .covua bot | .covua create | .covua join", ttl: 60_000 },
        threadId,
        threadType
      );
    }

    if (sub !== "join" && activeGames.has(threadId)) {
      return api.sendMessage({ msg: "⚙️ Đã có ván cờ đang diễn ra trong nhóm.", ttl: 60_000 }, threadId, threadType);
    }

    if (sub === "create") {
     
      const waiting = {
        mode: "pvp_wait",
        threadId,
        threadType,
        creatorUid: uid,
        createdAt: Date.now(),
        timeoutId: null,
      };
      activeGames.set(threadId, waiting);
      waiting.timeoutId = setTimeout(async () => {
        try {
          const cur = activeGames.get(threadId);
          if (cur && cur.mode === "pvp_wait") {
            activeGames.delete(threadId);
            await api.sendMessage({ msg: "⏰ Phòng cờ vua đã hết hạn sau 60s.", ttl: 60_000 }, threadId, threadType);
          }
        } catch {}
      }, 60_000);
      return api.sendMessage({ msg: "🎮 Đã tạo phòng cờ vua. Người khác gõ .covua join để tham gia. (phòng hết hạn sau 60s)", ttl: 60_000 }, threadId, threadType);
    }

    if (sub === "join") {
      const room = activeGames.get(threadId);
      if (!room) {
        return api.sendMessage({ msg: "Không có phòng chờ. Gõ .covua create để tạo.", ttl: 60_000 }, threadId, threadType);
      }
      if (room.mode && room.mode !== "pvp_wait") {
        return api.sendMessage({ msg: "Không có phòng chờ. Gõ .covua create để tạo.", ttl: 60_000 }, threadId, threadType);
      }
      if (String(room.creatorUid) === String(uid)) {
        return api.sendMessage({ msg: "Bạn không thể tự join phòng của mình.", ttl: 60_000 }, threadId, threadType);
      }

      const chess = new Chess();
      const game = {
        mode: "pvp",
        chess,
        whiteUid: room.creatorUid,
        blackUid: uid,
        turnUid: room.creatorUid,
        threadId,
        threadType,
        lastBoardMsgId: null,
        lastBoardCliMsgId: 0,
        turnTimeoutId: null,
      };
      activeGames.set(threadId, game);
      try { if (room.timeoutId) clearTimeout(room.timeoutId); } catch {}

      const whiteProfile = await getUserProfile(api, game.whiteUid);
      const blackProfile = await getUserProfile(api, game.blackUid);
      const header = `Bắt đầu ván PVP!\nTrắng: ${whiteProfile.name}\nĐen: ${blackProfile.name}`;
      const img = await drawBoardImage(chess, "", { userName: whiteProfile.name, userAvatar: whiteProfile.avatar, opponentName: blackProfile.name, opponentAvatar: blackProfile.avatar, turn: "user" });
      const sent = await api.sendMessage({ msg: header, attachments: img ? [img] : [], ttl: 60_000 }, threadId, threadType);

      const extractIds = (d) => {
        const out = { msgId: null, cliMsgId: 0 };
        const walk = (o) => {
          if (!o || typeof o !== "object") return;
          if (Array.isArray(o)) return o.forEach(walk);
          if (!out.msgId && o.msgId) out.msgId = o.msgId;
          if (!out.cliMsgId && typeof o.cliMsgId !== "undefined") out.cliMsgId = o.cliMsgId;
          Object.values(o).forEach(walk);
        };
        walk(d);
        return out;
      };
      const ids = extractIds(sent);
      game.lastBoardMsgId = ids.msgId || (sent?.message?.msgId ?? sent?.msgId ?? null);
      game.lastBoardCliMsgId = ids.cliMsgId || (sent?.message?.cliMsgId ?? sent?.cliMsgId ?? 0);
      const moveMatcher = ({ content }) => /^(\s*[a-h][1-8]\s*[a-h][1-8]\s*|\s*\d{2}\s*[-\s]?\s*\d{2}\s*)$/i.test(String(content || ""));
      const onHumanMove = async ({ message: m, content }) => {
        const who = m.data?.uidFrom;
        if (![game.whiteUid, game.blackUid].includes(who)) return { clear: false };
        if (who !== game.turnUid) {
          await api.sendMessage({ msg: "⚙️ Chưa tới lượt bạn!", ttl: 60_000 }, threadId, threadType);
          return { clear: false };
        }
        const parsed = parseHumanMove(content);
        if (!parsed) {
          await api.sendMessage({ msg: "Nước đi không hợp lệ. VD: 22-32", ttl: 60_000 }, threadId, threadType);
          return { clear: false };
        }
        try {
          const res = game.chess.move({ from: parsed.from, to: parsed.to, promotion: "q" });
          if (!res) throw new Error("illegal");
        } catch {
          await api.sendMessage({ msg: "Nước đi không hợp lệ!", ttl: 60_000 }, threadId, threadType);
          return { clear: false };
        }

        clearTurnTimer(game);

        if (game.chess.isCheckmate() || game.chess.isDraw() || game.chess.isStalemate()) {
          const winnerUid = game.chess.isCheckmate() ? who : null;
          const msg = winnerUid ? `♟️ Checkmate! ${winnerUid === game.whiteUid ? whiteProfile.name : blackProfile.name} thắng.` : "Trận đấu hòa!";
        const imgEnd = await drawBoardImage(game.chess, "", { userName: whiteProfile.name, userAvatar: whiteProfile.avatar, opponentName: blackProfile.name, opponentAvatar: blackProfile.avatar, turn: null });
          try { if (game.lastBoardMsgId) await api.undo({ msgId: game.lastBoardMsgId, cliMsgId: game.lastBoardCliMsgId || 0 }, threadId, threadType); } catch {}
          await api.sendMessage({ msg, attachments: imgEnd ? [imgEnd] : [], ttl: 60_000 }, threadId, threadType);
          activeGames.delete(threadId);
          clearPendingReply(threadId);
          return { clear: true };
        }
        game.turnUid = otherPlayerUid(game, who);
        const isWhiteTurn = game.turnUid === game.whiteUid;
        const imgTurn = await drawBoardImage(game.chess, "", { userName: whiteProfile.name, userAvatar: whiteProfile.avatar, opponentName: blackProfile.name, opponentAvatar: blackProfile.avatar, turn: isWhiteTurn ? "user" : "bot" });
        try { if (game.lastBoardMsgId) await api.undo({ msgId: game.lastBoardMsgId, cliMsgId: game.lastBoardCliMsgId || 0 }, threadId, threadType); } catch {}
        const sentTurn = await api.sendMessage({ msg: `Đến lượt ${isWhiteTurn ? whiteProfile.name : blackProfile.name}`, attachments: imgTurn ? [imgTurn] : [], ttl: 60_000 }, threadId, threadType);
        const idsT = extractIds(sentTurn);
        game.lastBoardMsgId = idsT.msgId || (sentTurn?.message?.msgId ?? sentTurn?.msgId ?? null);
        game.lastBoardCliMsgId = idsT.cliMsgId || (sentTurn?.message?.cliMsgId ?? sentTurn?.cliMsgId ?? 0);

        clearTurnTimer(game);
        game.turnTimeoutId = setTimeout(async () => {
          try {
            const loser = game.turnUid;
            const loserName = loser === game.whiteUid ? whiteProfile.name : blackProfile.name;
            const winnerName = loser === game.whiteUid ? blackProfile.name : whiteProfile.name;
            const imgEnd = await drawBoardImage(game.chess, "", { userName: whiteProfile.name, userAvatar: whiteProfile.avatar, opponentName: blackProfile.name, opponentAvatar: blackProfile.avatar, turn: null });
            try { if (game.lastBoardMsgId) await api.undo({ msgId: game.lastBoardMsgId, cliMsgId: game.lastBoardCliMsgId || 0 }, threadId, threadType); } catch {}
            await api.sendMessage({ msg: `⏰ ${loserName} quá 60s, xử thua. ${winnerName} thắng!`, attachments: imgEnd ? [imgEnd] : [], ttl: 60_000 }, threadId, threadType);
          } catch {}
          activeGames.delete(threadId);
          clearPendingReply(threadId);
        }, TURN_TIME_MS);

        return { clear: false };
      };

      dangKyReply({
        msgId: ids.msgId,
        cliMsgId: ids.cliMsgId,
        threadId,
        authorId: undefined,
        command: "covua",
        data: game,
        allowThreadFallback: true,
        matcher: moveMatcher,
        onReply: onHumanMove,
      });
      datChoPhanHoi(threadId, {
        authorId: undefined,
        matcher: moveMatcher,
        handler: onHumanMove,
      });
      clearTurnTimer(game);
      game.turnTimeoutId = setTimeout(async () => {
        try {
          const imgEnd = await drawBoardImage(game.chess, "", { userName: whiteProfile.name, userAvatar: whiteProfile.avatar, botName: blackProfile.name, turn: null });
          try { if (game.lastBoardMsgId) await api.undo({ msgId: game.lastBoardMsgId, cliMsgId: game.lastBoardCliMsgId || 0 }, threadId, threadType); } catch {}
          await api.sendMessage({ msg: `⏰ ${whiteProfile.name} quá 60s, xử thua. ${blackProfile.name} thắng!`, attachments: imgEnd ? [imgEnd] : [], ttl: 60_000 }, threadId, threadType);
        } catch {}
        activeGames.delete(threadId);
        clearPendingReply(threadId);
      }, TURN_TIME_MS);
      return;
    }

    const chess = new Chess();
    const game = {
      chess,
      userUid: uid,
      botUid: "gemini-bot",
      turn: "user",
      threadId,
      threadType,
      lastBoardMsgId: null,
      lastBoardCliMsgId: 0,
    };
    activeGames.set(threadId, game);

    const userProfile = await getUserProfile(api, uid);
    const header = `Bắt đầu ván cờ!\nNgười chơi (TRẮNG): ${userProfile.name}\nBot (ĐEN): Gemini`;
    const img = await drawBoardImage(chess, "", { userName: userProfile.name, userAvatar: userProfile.avatar, opponentName: "Gemini", opponentAvatar: null, turn: "user" });
    const sent = await api.sendMessage({ msg: header, attachments: img ? [img] : [], ttl: 60_000 }, threadId, threadType);

    const msgId = sent?.message?.msgId ?? sent?.msgId ?? null;
    const cliMsgId = sent?.message?.cliMsgId ?? sent?.cliMsgId ?? 0;
    const extractIds = (d) => {
      const out = { msgId: null, cliMsgId: 0 };
      const walk = (o) => {
        if (!o || typeof o !== "object") return;
        if (Array.isArray(o)) return o.forEach(walk);
        if (!out.msgId && o.msgId) out.msgId = o.msgId;
        if (!out.cliMsgId && typeof o.cliMsgId !== "undefined") out.cliMsgId = o.cliMsgId;
        Object.values(o).forEach(walk);
      };
      walk(d);
      return out;
    };
    const firstIds = extractIds(sent);
    game.lastBoardMsgId = firstIds.msgId || msgId;
    game.lastBoardCliMsgId = firstIds.cliMsgId || cliMsgId;

    const moveMatcher = ({ content }) => /^(\s*[a-h][1-8]\s*[a-h][1-8]\s*|\s*\d{2}\s*[-\s]?\s*\d{2}\s*)$/i.test(String(content || ""));
    const handleMove = async ({ message: m, content }) => {
      const curUid = m.data?.uidFrom;
      if (curUid !== game.userUid) return { clear: false };
      if (game.turn !== "user") {
        await api.sendMessage({ msg: "⚙️ Chưa tới lượt bạn!", ttl: 60_000 }, threadId, threadType);
        return { clear: false };
      }

      const parsed = parseHumanMove(content);
      if (!parsed) {
        await api.sendMessage({ msg: "Nước đi không hợp lệ. Ví dụ: 22-32 (b2-b3)", ttl: 60_000 }, threadId, threadType);
        return { clear: false };
      }

      try {
        const res = game.chess.move({ from: parsed.from, to: parsed.to, promotion: "q" });
        if (!res) throw new Error("illegal");
      } catch {
        await api.sendMessage({ msg: "Nước đi không hợp lệ!", ttl: 60_000 }, threadId, threadType);
        return { clear: false };
      }

      if (game.chess.isCheckmate() || game.chess.isDraw() || game.chess.isStalemate()) {
        const endMsg = game.chess.isCheckmate()
          ? "♟️ Checkmate! Bạn (TRẮNG) thắng."
          : "Trận đấu hòa!";
        const img2 = await drawBoardImage(game.chess, "Kết thúc ván");
        try {
          if (game.lastBoardMsgId) {
            await api.undo({ msgId: game.lastBoardMsgId, cliMsgId: game.lastBoardCliMsgId || 0 }, threadId, threadType);
          }
        } catch {}
        await api.sendMessage({ msg: endMsg, attachments: img2 ? [img2] : [], ttl: 60_000 }, threadId, threadType);
        activeGames.delete(threadId);
        clearPendingReply(threadId);
        return { clear: true };
      }

      game.turn = "bot";
      const userProfile2 = await getUserProfile(api, game.userUid);
      const img2 = await drawBoardImage(game.chess, "", { userName: userProfile2.name, userAvatar: userProfile2.avatar, opponentName: "Gemini", opponentAvatar: null, turn: "bot" });
      try {
        if (game.lastBoardMsgId) {
          await api.undo({ msgId: game.lastBoardMsgId, cliMsgId: game.lastBoardCliMsgId || 0 }, threadId, threadType);
        }
      } catch {}
      const sent2 = await api.sendMessage({ msg: "Đến lượt Bot (ĐEN)", attachments: img2 ? [img2] : [], ttl: 60_000 }, threadId, threadType);
      {
        const ids2 = extractIds(sent2);
        game.lastBoardMsgId = ids2.msgId || (sent2?.message?.msgId ?? sent2?.msgId ?? null);
        game.lastBoardCliMsgId = ids2.cliMsgId || (sent2?.message?.cliMsgId ?? sent2?.cliMsgId ?? 0);
      }
      let botMove = await askGeminiForMove({ chess: game.chess, side: "b" });
      if (!botMove) {
        const fb = chooseFallbackBotMove(game.chess);
        if (fb) botMove = { from: fb.from, to: fb.to };
      }

      if (!botMove) {
        await api.sendMessage({ msg: "Bot không thể tìm nước đi. Ván cờ kết thúc.", ttl: 60_000 }, threadId, threadType);
        activeGames.delete(threadId);
        clearPendingReply(threadId);
        return { clear: true };
      }

      try {
        game.chess.move({ from: botMove.from, to: botMove.to, promotion: "q" });
      } catch {}

      if (game.chess.isCheckmate() || game.chess.isDraw() || game.chess.isStalemate()) {
        const endMsg = game.chess.isCheckmate()
          ? "♟️ Checkmate! Bot (ĐEN) thắng."
          : "Trận đấu hòa!";
      const up3 = await getUserProfile(api, game.userUid);
      const img3 = await drawBoardImage(game.chess, "", { userName: up3.name, userAvatar: up3.avatar, opponentName: "Gemini", opponentAvatar: null, turn: null });
        try {
          if (game.lastBoardMsgId) {
            await api.undo({ msgId: game.lastBoardMsgId, cliMsgId: game.lastBoardCliMsgId || 0 }, threadId, threadType);
          }
        } catch {}
        await api.sendMessage({ msg: endMsg, attachments: img3 ? [img3] : [], ttl: 60_000 }, threadId, threadType);
        activeGames.delete(threadId);
        clearPendingReply(threadId);
        return { clear: true };
      }

      game.turn = "user";
      const up4 = await getUserProfile(api, game.userUid);
      const img4 = await drawBoardImage(game.chess, "", { userName: up4.name, userAvatar: up4.avatar, opponentName: "Gemini", opponentAvatar: null, turn: "user" });
      try {
        if (game.lastBoardMsgId) {
          await api.undo({ msgId: game.lastBoardMsgId, cliMsgId: game.lastBoardCliMsgId || 0 }, threadId, threadType);
        }
      } catch {}
      const sent4 = await api.sendMessage({ msg: "Đến lượt bạn (TRẮNG)", attachments: img4 ? [img4] : [], ttl: 60_000 }, threadId, threadType);
      {
        const ids4 = extractIds(sent4);
        game.lastBoardMsgId = ids4.msgId || (sent4?.message?.msgId ?? sent4?.msgId ?? null);
        game.lastBoardCliMsgId = ids4.cliMsgId || (sent4?.message?.cliMsgId ?? sent4?.cliMsgId ?? 0);
      }
      datChoPhanHoi(threadId, {
        authorId: game.userUid,
        matcher: moveMatcher,
        handler: async ({ message, content }) => handleMove({ message, content }),
      });
      return { clear: false };
    };

    dangKyReply({
      msgId,
      cliMsgId,
      threadId,
      authorId: uid,
      command: "covua",
      data: game,
      allowThreadFallback: true,
      matcher: moveMatcher,
      onReply: handleMove,
    });
    datChoPhanHoi(threadId, {
      authorId: uid,
      matcher: moveMatcher,
      handler: async ({ message, content }) => handleMove({ message, content }),
    });
  },
};


