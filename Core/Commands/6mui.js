// author @GwenDev
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import https from "https";
import { ThreadType } from "zca-js";

const DATA_FILE = path.resolve("Api", "Data", "Image", "6Mui.json");

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function downloadStream(url, outPath) {
  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outPath);
    https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
       
        https.get(res.headers.location, (res2) => {
          res2.pipe(file);
          file.on("finish", () => file.close(() => resolve(outPath)));
        }).on("error", async (err) => {
          try { await fsp.unlink(outPath); } catch {}
          reject(err);
        });
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve(outPath)));
    }).on("error", async (err) => {
      try { await fsp.unlink(outPath); } catch {}
      reject(err);
    });
  });
}

export default {
  name: "6mui",
  description: "Random ảnh 6 múi",
  role: 0,
  cooldown: 2,
  group: "image",
  aliases: [
    "6 múi",
    "sixpack",
    "six pack",
    "ảnh 6 múi",
    "cho xem 6 múi",
    "bụng 6 múi",
    "bật 6 múi",
    "sixpack đâu",
    "six pack đâu"
  ],
  noPrefix: true,
  async run({ message, api, args }) {
    const threadId = message.threadId;
    const threadType = message.type ?? ThreadType.User;
    try {
      const raw = await fsp.readFile(DATA_FILE, "utf-8");
      const urls = JSON.parse(raw);
      if (!Array.isArray(urls) || urls.length === 0) {
        return api.sendMessage("Danh sách ảnh trống.", threadId, threadType);
      }
      const url = pick(urls);
      const cacheDir = path.resolve("Data", "Cache", "SixPack");
      const ts = Date.now();
      const ex = (() => {
        try { const u = new URL(url); const e = path.extname(u.pathname); return e || ".jpg"; } catch { return ".jpg"; }
      })();
      const filePath = path.join(cacheDir, `six_${ts}${ex}`);
      await downloadStream(url, filePath);
      const send = await api.sendMessage({ msg: "𝗕𝗼̛́𝘁 𝗚𝗵𝗶𝗲̂̀𝗻 𝗟𝗮̣𝗶 𝗡𝗵𝗮 -.-", attachments: [filePath], ttl: 30000 }, threadId, threadType);
      try {
        if (fs.existsSync(filePath)) await fsp.unlink(filePath).catch(() => {});
      } catch {}
      return send;
    } catch {
      return api.sendMessage("Lỗi tải ảnh.", threadId, threadType);
    }
  },
};


