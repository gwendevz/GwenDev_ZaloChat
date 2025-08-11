import fs from "fs";
import path from "path";
import axios from "axios";
import { createCanvas, loadImage } from "canvas";
import { ThreadType } from "zca-js";
import {
  dangKyReply,
  datChoPhanHoi,
  clearPendingReply,
} from "../../Handlers/HandleReply.js";
import { query } from "../../App/Database.js";

const TURN_TIME_MS = 90_000;
const activeGames = new Map();

async function getDisplayName(api, uid) {
  try {
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

function sendBoardAndRegister(game, api, header = "") {
  const { threadId, threadType } = game;
  const img = drawBoardImage(game);
  const turn = game.players.find((p) => p.uid === game.turnUid) || {};
  const turnTag = buildMention(turn.name || "?");
  const txt =
    (header ? header + "\n" : "") +
    `Bàn cờ ${game.size}x${game.size}. Đến lượt ${turnTag}`;
  const mArr = turn.uid
    ? [{ pos: txt.lastIndexOf(turnTag), len: turnTag.length, uid: turn.uid }]
    : [];
  return api
    .sendMessage(
      { msg: txt, attachments: [img], mentions: mArr },
      threadId,
      threadType,
    )
    .then(async (res) => {
      try {
        if (fs.existsSync(img)) {
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
      try {
        await query(
          "UPDATE users SET caro = caro + 1 WHERE uid = ?",
          [uid]
        );
      } catch {}
    } else {
      await api.sendMessage("Trận đấu hòa!", threadId, threadType);
    }
    activeGames.delete(threadId);
    clearPendingReply(threadId);
    return;
  }
  const other = otherPlayer(game, uid);
  game.turnUid = other.uid;
  game.turnName = other.name;
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
}

async function startGame(game, api) {
  const first = Math.random() < 0.5 ? game.players[0] : game.players[1];
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
      return api.sendMessage("Chế độ bot chưa hỗ trợ", threadId, threadType);
    }
    // HELP
    return api.sendMessage(
      [
        "🎮 Trò Chơi: Caro",
        "- .caro create",
        "- .caro join",
        "- .caro leave",
        "- .caro rank",
        "- .caro bot (coming soon)",
      ].join("\n"),
      threadId,
      threadType,
    );
  },
};
