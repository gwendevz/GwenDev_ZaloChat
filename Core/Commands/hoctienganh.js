// author waguri kaori – simple English test command
import fs from "fs";
import path from "path";
import { ThreadType } from "zca-js";
import { query } from "../../App/Database.js";
import { dangKyReply } from "../../Handlers/HandleReply.js";
import { createCanvas, loadImage } from "canvas";

const CACHE_DIR = path.join("Data", "Cache", "hoctienganh");
fs.mkdirSync(CACHE_DIR, { recursive: true });

const QUESTIONS_PATH = path.join("Api", "HocTiengAnh", "questions.json");

function getUserData(uid) {
  const file = path.join(CACHE_DIR, `${uid}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  return { score: 0, total: 0 };
}
function saveUserData(uid, data) {
  fs.writeFileSync(path.join(CACHE_DIR, `${uid}.json`), JSON.stringify(data, null, 2));
}

// ---------- Question helpers ----------
function loadAllQuestions() {
  try {
    const raw = fs.readFileSync(QUESTIONS_PATH, "utf8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr;
  } catch {}
  return [];
}
function pickRandomQuestions(n = 24) {
  const all = loadAllQuestions();
  return all.sort(() => Math.random() - 0.5).slice(0, n);
}

// ---------- Canvas card ----------
function wrap(ctx, text, x, y, maxW, lh) {
  const words = String(text || "").split(/\s+/g);
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW) {
      ctx.fillText(line, x, y);
      y += lh;
      line = w;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lh;
}
async function makeCard({ qObj, idx, total }) {
  const W = 1000,
    H = 540,
    canvas = createCanvas(W, H),
    ctx = canvas.getContext("2d");
  // green bg
  ctx.fillStyle = "#58CC02";
  ctx.fillRect(0, 0, W, H);
  const cardX = 60,
    cardY = 60,
    cardW = W - 120,
    cardH = H - 120,
    r = 24;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(cardX + r, cardY);
  ctx.arcTo(cardX + cardW, cardY, cardX + cardW, cardY + cardH, r);
  ctx.arcTo(cardX + cardW, cardY + cardH, cardX, cardY + cardH, r);
  ctx.arcTo(cardX, cardY + cardH, cardX, cardY, r);
  ctx.arcTo(cardX, cardY, cardX + cardW, cardY, r);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#333";
  ctx.font = "600 28px Arial";
  ctx.fillText(`Câu ${idx}/${total}`, cardX + 24, cardY + 30);

  ctx.font = "bold 26px Arial";
  const after = wrap(ctx, qObj.q, cardX + 24, cardY + 90, cardW - 48, 34);

  const opts = ["A", "B", "C", "D"], vals = [qObj.a, qObj.b, qObj.c, qObj.d];
  ctx.font = "24px Arial";
  let y = after + 20;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = "#EDEFF4";
    ctx.fillRect(cardX + 24, y, cardW - 48, 48);
    ctx.fillStyle = "#000";
    ctx.fillText(`${opts[i]}. ${vals[i]}`, cardX + 40, y + 32);
    y += 70;
  }
  const out = path.join(CACHE_DIR, `q_${Date.now()}.png`);
  fs.writeFileSync(out, canvas.toBuffer("image/png"));
  return out;
}

export default {
  name: "hoctienganh",
  group: "group",
  role: 0,
  cooldown: 5,
  async run({ message, api, args }) {
    const uid = message.data?.uidFrom;
    const threadId = message.threadId;
    const threadType = message.type ?? ThreadType.User;
    const sub = (args[0] || "").toLowerCase();

    const user = getUserData(uid);

    if (!sub) {
      return api.sendMessage(
        `📚 Học tiếng Anh\n• hoctienganh kiemtra – Làm bài 24 câu\n• hoctienganh diemso – Điểm cá nhân\n• hoctienganh top – Bảng xếp hạng`,
        threadId,
        threadType
      );
    }

    if (sub === "diemso") {
      const [row] = await query(`SELECT tienganh FROM users WHERE uid = ? LIMIT 1`, [uid]);
      const scoreDb = row?.tienganh || 0;
      const tests = Math.floor(scoreDb / 24);
      return api.sendMessage(`📊 Điểm tiếng Anh: ${scoreDb} / 24 Câu`, threadId, threadType);
    }

    if (sub === "top") {
      const rows = await query(`SELECT name, tienganh FROM users ORDER BY tienganh DESC LIMIT 10`);
      const lines = rows.map((r, i) => `${i + 1}. ${r.name || "User"} – ${r.tienganh || 0}`);
      return api.sendMessage(`🏆 TOP TIẾNG ANH\n` + lines.join("\n"), threadId, threadType);
    }

    if (sub === "kiemtra") {
      const qs = pickRandomQuestions(24);
      const state = { idx: 0, correct: 0, list: qs };

      const sendQ = async () => {
        const qObj = state.list[state.idx];
        const img = await makeCard({ qObj, idx: state.idx + 1, total: 24 });
        const res = await api.sendMessage({ msg: "", attachments: [img] }, threadId, threadType);
        setTimeout(() => {
          fs.promises.unlink(img).catch(() => {});
        }, 120_000);
        const mid = res?.message?.msgId ?? res?.msgId;
        const cid = res?.message?.cliMsgId ?? res?.cliMsgId ?? 0;
        dangKyReply({
          msgId: mid,
          cliMsgId: cid,
          threadId,
          authorId: uid,
          command: "hoctienganh-test",
          ttlMs: 30 * 60_000,
          handler: async ({ content }) => {
            const ans = content.trim().toUpperCase()[0];
            if ("ABCD".includes(ans)) {
              if (ans === qObj.ans.toUpperCase()) state.correct++;
              state.idx++;
              if (state.idx >= 24) {
                const percent = Math.round((state.correct / 24) * 100);
                await api.sendMessage(`Hoàn thành: ${state.correct}/24 (${percent}%)`, threadId, threadType);
                await query(`UPDATE users SET tienganh = COALESCE(tienganh,0)+? WHERE uid=?`, [state.correct, uid]);
                user.score += state.correct;
                user.total += 24;
                saveUserData(uid, user);
                return { clear: true };
              }
              await sendQ();
              return { clear: true };
            }
            if (content.trim().toLowerCase() === "nopbai") {
              await api.sendMessage(`Bạn đã nộp sớm. Đúng ${state.correct}/${state.idx}`, threadId, threadType);
              return { clear: true };
            }
            return { clear: false };
          },
        });
      };

      await sendQ();
      return;
    }

    return api.sendMessage(" Lệnh không hợp lệ!", threadId, threadType);
  },
};
