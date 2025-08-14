// author @GwenDev
import https from "https";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";

const DATA_FILE = path.resolve("Api", "Data", "Image", "Mông.json");

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
  name: "mong",
  description: "Gửi ảnh mông từ data",
  role: 0,
  group: "image",
  cooldown: 30,
  aliases: [
    "gửi ảnh mông",
    "cho xem mông",
    "ảnh mông đâu",
    "mông đâu",
    "coi mông đi",
    "mông đi",
    "gửi mông",
    "bật mông lên",
    "xem mông",
    "cho ảnh mông",
    "t muốn xem mông",
    "cho xin mông",
    "mông đâu rồi"
  ],
  noPrefix: true,
  async run({ message, api }) {
    const threadId = message.threadId;
    const threadType = message.type;
    try {
      const raw = await fsp.readFile(DATA_FILE, "utf-8");
      const urls = JSON.parse(raw);
      if (!Array.isArray(urls) || urls.length === 0) {
        return api.sendMessage("Danh sách ảnh trống.", threadId, threadType);
      }
      const url = pick(urls);
      const cacheDir = path.resolve("Data", "Cache", "Mong");
      const ts = Date.now();
      const ext = (() => { try { const u = new URL(url); return path.extname(u.pathname) || ".jpg"; } catch { return ".jpg"; } })();
      const filePath = path.join(cacheDir, `mong_${ts}${ext}`);
      await downloadStream(url, filePath);
      await api.sendMessage({ msg: "mê lắm hả :>?", attachments: [filePath], ttl: 30000 }, threadId, threadType);
      try { if (fs.existsSync(filePath)) await fsp.unlink(filePath).catch(() => {}); } catch {}
    } catch (err) {
      await api.sendMessage("Đã xảy ra lỗi khi gửi ảnh mông.", threadId, threadType);
    }
  }
};
