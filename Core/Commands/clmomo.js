import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import moment from "moment-timezone";
import { createCanvas, loadImage } from "canvas";
import Canvas from "canvas";
import { query } from "../../App/Database.js";
import { ThreadType } from "zca-js";

const _origStderr = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, encoding, cb) => {
  if (typeof chunk === "string" && chunk.includes("Pango-WARNING")) return true;
  return _origStderr(chunk, encoding, cb);
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.join(__dirname, "cache");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });


async function getBalance(uid) {
  const [row] = await query("SELECT coins FROM users WHERE uid = ?", [uid]);
  return row?.coins || 0;
}
async function addCoins(uid, amount) {
  await query("UPDATE users SET coins = COALESCE(coins,0) + ? WHERE uid = ?", [amount, uid]);
}
async function subCoins(uid, amount) {
  await query("UPDATE users SET coins = COALESCE(coins,0) - ? WHERE uid = ?", [amount, uid]);
}

export default {
  name: "clmomo",
  description: "Chẵn lẻ / Tài xỉu mô phỏng MoMo",
  role: 0,
  cooldown: 0,
  group: "game",
  aliases: ["chanlemomo", "clmm"],

  async run({ message, api, args }) {
    const threadId = message.threadId;
    const threadType = message.type ?? ThreadType.User;
    const uid = message.data?.uidFrom;

    if (!uid) {
      return api.sendMessage("Không xác định được người dùng!", threadId, threadType);
    }

    const [userExists] = await query("SELECT uid FROM users WHERE uid = ?", [uid]);
    if (!userExists) {
      return api.sendMessage("Bạn chưa có tài khoản trong hệ thống. Vui lòng tương tác với bot trước.", threadId, threadType);
    }

    const content = (args[0] || "").toLowerCase();
    const coinsStr = args[1] || "";

    if (!content) {
      return api.sendMessage(
        " Hướng dẫn: .clmomo [c|l|c2|l2|n1|n2|n3|n0|t|x|t2|x2] <số tiền>",
        threadId,
        threadType
      );
    }

    if (!coinsStr) {
      return api.sendMessage("Vui lòng nhập số tiền cược!", threadId, threadType);
    }

    const coins = parseInt(coinsStr, 10);
    if (isNaN(coins) || coins < 50) {
      return api.sendMessage("Số tiền cược tối thiểu là 50!", threadId, threadType);
    }
    if (coins > 1_000_000) {
      return api.sendMessage("Số tiền cược tối đa là 1.000.000!", threadId, threadType);
    }

    const bal = await getBalance(uid);
    if (bal < coins) {
      return api.sendMessage("Bạn không đủ tiền để cược!", threadId, threadType);
    }

    const codeGD = String(Math.floor(Math.random() * 90000000000) + 10000000000);
    const lastNumber = parseInt(codeGD.slice(-1));

    const c = [2, 4, 6, 8];
    const l = [1, 3, 5, 7];
    const c2 = [0, 2, 4, 6, 8];
    const l2 = [1, 3, 5, 7, 9];
    const n1 = [1, 2, 3];
    const n2 = [4, 5, 6];
    const n3 = [7, 8, 9];
    const n0 = [0];
    const t = [5, 6, 7, 8];
    const x = [1, 2, 3, 4];
    const t2 = [5, 6, 7, 8, 9];
    const x2 = [0, 1, 2, 3, 4];

    const multi = {
      c: 1.5,
      l: 1.5,
      c2: 1,
      l2: 1,
      n1: 2,
      n2: 2,
      n3: 2,
      n0: 1.5,
      t: 1.5,
      x: 1.5,
      t2: 1,
      x2: 4,
    };

    const groups = {
      c, l, c2, l2, n1, n2, n3, n0, t, x, t2, x2,
    };

    let msg = "";
    const list = groups[content];
    if (!list) {
      await subCoins(uid, coins); 
      return api.sendMessage("Sai nội dung hoặc không hỗ trợ! Tiền cược đã bị trừ.", threadId, threadType);
    }

    const isWin = list.includes(lastNumber);
    if (isWin) {
      const reward = Math.floor(coins * multi[content]);
      await addCoins(uid, reward);
      msg = ` Bạn đã thắng!\nSố cuối mã GD: ${lastNumber}\n💰 Nhận được: +${reward.toLocaleString()} coins`;
    } else {
      await subCoins(uid, coins);
      msg = ` Bạn đã thua!\nSố cuối mã GD: ${lastNumber}\n💸 Mất: -${coins.toLocaleString()} coins`;
    }
    try {
      const FONT_DIR = path.resolve("Data", "Cache", "ChanLeMoMo");
      const fontMedium = path.join(FONT_DIR, "SplineSans-Medium.ttf");
      const fontRegular = path.join(FONT_DIR, "SplineSans.ttf");

      const hasMedium = fs.existsSync(fontMedium);
      const hasRegular = fs.existsSync(fontRegular);

      if (hasMedium) {
        Canvas.registerFont(fontMedium, { family: "SSMedium" });
      }
      if (hasRegular) {
        Canvas.registerFont(fontRegular, { family: "SSRegular" });
      }

      var familyMedium = hasMedium ? "SSMedium" : "Sans";
      var familyRegular = hasRegular ? "SSRegular" : "Sans";
    } catch {}

    const LOCAL_BG_DIR = path.resolve("Data", "Cache", "ChanLeMoMo");
    const bgPathCandidates = [
      path.join(LOCAL_BG_DIR, "chuyentien.png"),
      path.join(LOCAL_BG_DIR, "clmm.png"),
    ];
    const bgPath = bgPathCandidates.find(p => fs.existsSync(p));
    if (!bgPath) {
      return api.sendMessage("Không tìm thấy ảnh nền chuyentien.png / clmm.png!", threadId, threadType);
    }

    const bgImg = await loadImage(bgPath);
    const canvas = createCanvas(bgImg.width, bgImg.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

    ctx.font = `30px ${familyMedium}`;
    ctx.fillStyle = "#000";
    ctx.fillText("-" + coins.toLocaleString() + "đ", 151, 201);

    ctx.font = `26px ${familyMedium}`;
    let name = "User";
    try {
      const infoRes = await api.getUserInfo(uid);
      const profiles = infoRes?.changed_profiles || {};
      const key = Object.keys(profiles).find(k => k.startsWith(uid));
      const p = key ? profiles[key] : null;
      name = p?.displayName || p?.zaloName || p?.username || "User";
    } catch {}
    ctx.textAlign = "right";
    ctx.fillText(name, 547, 816);

    ctx.fillStyle = "#FF00FF";
    ctx.font = `22px ${familyMedium}`;
    const data = ["0993457888", "0984444444", "0992229333", "059874444", "0568777777", "0764322222"];
    const sdt = data[Math.floor(Math.random() * data.length)];
    ctx.fillText(sdt, 547, 884);

    ctx.font = `22px ${familyRegular}`;
    ctx.textAlign = "start";
    ctx.fillText(codeGD, 279, 240);

    ctx.fillStyle = "#000";
    ctx.textAlign = "right";
    ctx.font = `22px ${familyMedium}`;
    ctx.fillText("Miễn phí", 547, 504);
    ctx.fillText("Ví MoMo", 547, 436);

    const time = moment.tz("Asia/Ho_Chi_Minh").format("HH:mm");
    const day = moment.tz("Asia/Ho_Chi_Minh").format("DD/MM/YYYY");
    ctx.fillText(`${time} - ${day}`, 547, 367);

    const outPath = path.join(CACHE_DIR, `clmomo_${Date.now()}.png`);
    await fs.promises.writeFile(outPath, canvas.toBuffer());

    await api.sendMessage({ msg, attachments: [outPath] }, threadId, threadType);
    setTimeout(() => {
      fs.promises.unlink(outPath).catch(() => {});
    }, 30_000);
  },
};
