import axios from "axios";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { ThreadType } from "zca-js";
import { query } from "../../App/Database.js";
import {
  dangKyReply,
} from "../../Handlers/HandleReply.js";
import { setPendingReply } from "../../Handlers/HandleReply.js";
import { log } from "../../Utils/Logger.js";
import { createCanvas, loadImage } from "canvas";

const COINS_UP = 10_000; 
const COINS_DOWN = 5_000; 
const HIDE_MSG_SEC = 4;

const DATA_URL_DOUBLE =
  path.resolve("Api", "DuoiHinhBatChu", "Data.json"); 
let datasetCache = null;
async function loadDataset() {
  if (datasetCache) return datasetCache;
  const url = DATA_URL_DOUBLE;
  let list;
  if (url.startsWith("http")) {
    const res = await axios.get(url);
    list = res.data?.doanhinh || [];
  } else {
    const raw = await fsp.readFile(url, "utf-8");
    list = JSON.parse(raw)?.doanhinh || [];
  }
  datasetCache = list;
  return datasetCache;
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function extractIds(res) {
  const out = { msgId: null, cliMsgId: 0 };
  const rec = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) return o.forEach(rec);
    if (!out.msgId) {
      if (o.msgId) out.msgId = o.msgId;
      else if (o.messageId) out.msgId = o.messageId;
    }
    if (!out.cliMsgId) {
      if (typeof o.cliMsgId !== "undefined") out.cliMsgId = o.cliMsgId;
      else if (typeof o.clientMsgId !== "undefined") out.cliMsgId = o.clientMsgId;
    }
    Object.values(o).forEach(rec);
  };
  rec(res);
  return out;
}

async function ensureUserRow(uid, name) {
  const [user] = await query("SELECT uid FROM users WHERE uid = ?", [uid]);
  if (user) {
  
    await query("UPDATE users SET name = ? WHERE uid = ?", [name || "Không rõ", uid]);
  }
 
}

async function addCoins(uid, name, amount) {
  await ensureUserRow(uid, name);
  await query(
    `UPDATE users SET coins = COALESCE(coins,0) + ? WHERE uid = ?`,
    [amount, uid],
  );
}

async function subCoins(uid, amount) {
  await query(`UPDATE users SET coins = GREATEST(COALESCE(coins,0) - ?,0) WHERE uid = ?`, [amount, uid]);
}

async function getBalance(uid) {
  const [row] = await query(`SELECT coins FROM users WHERE uid = ? LIMIT 1`, [uid]);
  return row?.coins || 0;
}

async function downloadImage(url, dir, filename) {
  await fsp.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  const buffer = (await axios.get(url, { responseType: "arraybuffer" })).data;
  await fsp.writeFile(filePath, buffer);
  return filePath;
}

async function combineImages(p1, p2, outPath) {
  const [img1, img2] = await Promise.all([loadImage(p1), loadImage(p2)]);
  const SEP = 6; 
  const width = img1.width + SEP + img2.width;
  const height = Math.max(img1.height, img2.height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img1, 0, 0);
  ctx.fillStyle = "#ffffff"; 
  ctx.fillRect(img1.width, 0, SEP, height);
  ctx.drawImage(img2, img1.width + SEP, 0);
  const buffer = canvas.toBuffer("image/png");
  await fsp.writeFile(outPath, buffer);
  return outPath;
}

async function startGame({ api, threadId, threadType, uid, userName, messageId }) {
 
  const list = await loadDataset();
  if (list.length === 0) throw new Error("Dataset trống");
  const data = randomItem(list);

  const answer = String(data.tukhoa).trim().toLowerCase();
  const suggestion = data.suggestions || "Không có";
  const sokitu = data.sokitu || "?";

  const cacheDir = path.resolve("Data", "Cache");
  const files = [];
  const safeDownload = async (urlImg, name) => {
    try {
      return await downloadImage(urlImg, cacheDir, name);
    } catch (e) {
       return null;
    }
  };
  const fp1 = await safeDownload(data.link1, `dhbc_${Date.now()}_1.png`);
  const fp2 = await safeDownload(data.link2, `dhbc_${Date.now()}_2.png`);
  if (fp1) files.push(fp1);
  if (fp2) files.push(fp2);

  if (files.length === 0) {
    await api.sendMessage("búg", threadId, threadType);
    return;
  }
  let attachmentsToSend = files;
  let combinedPath = null;
  if (files.length >= 2) {
    combinedPath = path.join(cacheDir, `dhbc_${Date.now()}_comb.png`);
    try {
      await combineImages(files[0], files[1], combinedPath);
      attachmentsToSend = [combinedPath];
    } catch (e) {
       attachmentsToSend = files;
    }
  }

  const body =
    `🎮 Vui lòng reply tin nhắn này để trả lời:\n` +
    `Gợi ý: ${sokitu}\n` +
    `💡 Reply "gợi ý" để xem gợi ý (-${COINS_DOWN.toLocaleString()}$) - chỉ được dùng 1 lần!`;

  const sendRes = await api.sendMessage(
    { msg: body, attachments: attachmentsToSend, ttl: 0 },
    threadId,
    threadType,
  );

  try {
    for (const f of files) {
      if (fs.existsSync(f)) {
        await fsp.unlink(f).catch(() => {});
      }
    }
    if (combinedPath && fs.existsSync(combinedPath)) {
      await fsp.unlink(combinedPath).catch(() => {});
    }
  } catch {}

  const flatten = (v) => (Array.isArray(v) ? v.flat(Infinity) : [v]);
  const allResponses = flatten(sendRes).filter(Boolean);
  const allIds = allResponses.map(extractIds);
  const mainIds = allIds[0] || { msgId: null, cliMsgId: 0 };

  let hintUsed = false;
  const processReply = async ({ message, content }) => {
    try {
      const replyUid = message.data?.uidFrom;
      const replyName = message.data?.senderName || "Người chơi";
      const normalized = (content || "").toLowerCase().trim();
  
      if (replyUid !== uid) {
        await api.sendMessage(`Chỉ ${userName} mới được trả lời câu đố này!`, threadId, threadType);
        return { clear: false };
      }

      if (normalized.startsWith("gợi")) {
        if (hintUsed) {
          await api.sendMessage(` Bạn đã sử dụng gợi ý rồi!`, threadId, threadType);
          return { clear: false };
        }
        const bal = await getBalance(replyUid);
        if (bal < COINS_DOWN) {
          await api.sendMessage(` Bạn không đủ ${COINS_DOWN.toLocaleString()}$ để xem gợi ý.`, threadId, threadType);
          return { clear: false };
        }
        hintUsed = true;
        await subCoins(replyUid, COINS_DOWN);
        await api.sendMessage(` Gợi ý cho bạn: ${suggestion} (-${COINS_DOWN.toLocaleString()}$)`, threadId, threadType);
        return { clear: false };
      }

      if (normalized === answer) {
        await addCoins(replyUid, replyName, COINS_UP);
        await api.sendMessage(` ${replyName} đã trả lời chính xác!\nĐáp án: ${answer} (+${COINS_UP.toLocaleString()}$)`, threadId, threadType);
        if (mainIds.msgId) {
          setTimeout(() => {
            try { api.undo({ msgId: mainIds.msgId, cliMsgId: mainIds.cliMsgId || 0 }, threadId, threadType); } catch {}
          }, HIDE_MSG_SEC * 1000);
        }
        return { clear: true };
      }

      await api.sendMessage(" Sai rồi nha :v", threadId, threadType);
      return { clear: false };
    } catch (err) {
         return { clear: false };
    }
  };

  const makeMatchQuote = (targetMsgId, targetCliId) => ({ message }) => {
    const collected = (() => {
      const ids = [];
      const push = (v) => { if (v !== undefined && v !== null && v !== "") ids.push(String(v)); };
      const d = message.data || {};
      const q = message.quote || d.quote || {};
      push(q.msgId); push(q.cliMsgId); push(q.messageId); push(q.clientMsgId);
      push(d.qMsgId); push(d.qCliMsgId);
      push(d.replyMsgId); push(d.replyCliMsgId);
      if (d.quote) { push(d.quote.messageId); push(d.quote.clientMsgId); }
      if (d.reply) { push(d.reply.msgId); push(d.reply.cliMsgId); }
      return ids;
    })();
    return collected.includes(String(targetMsgId)) || collected.includes(String(targetCliId));
  };
  for (const ids of allIds) {
    if (!ids.msgId && !ids.cliMsgId) continue;
    dangKyReply({
      msgId: ids.msgId,
      cliMsgId: ids.cliMsgId,
      listMsgId: ids.msgId,
      listCliMsgId: ids.cliMsgId,
      threadId,
      command: "dhbc",
      allowThreadFallback: true,
      matcher: makeMatchQuote(ids.msgId, ids.cliMsgId),
      onReply: async ({ message, content }) => processReply({ message, content }),
    });
  }


}

export default {
  name: "dhbc",
  description: "Đuổi hình bắt chữ (minigame)",
  role: 0,
  cooldown: 5,
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

    await startGame({ api, threadId, threadType, uid, userName: message.data?.senderName || "Người dùng", messageId: message.messageId });
  },
};
