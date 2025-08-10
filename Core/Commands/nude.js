// author @GwenDev
import https from "https";
import fs from "fs"; 
import fsp from "fs/promises";
import path from "path";

export default {
  name: "nude",
  description: "Gửi ảnh nude từ API",
  role: 0,
  cooldown: 30,
  group: "image",
  aliases: [
    "gửi ảnh nude",
    "cho xem nude",
    "ảnh nude đâu",
    "nude đâu",
    "coi nude đi",
    "nude đi",
    "gửi nude",
    "bật nude lên",
    "xem nude",
    "cho ảnh nude",
    "t muốn xem nude",
    "cho xin nude",
    "nude đâu rồi"
  ],
  noPrefix: true,
  async run({ message, api }) {
    const threadId = message.threadId;
    const threadType = message.type;

    try {
      const imageData = await new Promise((resolve, reject) => {
        https.get("https://api.nemg.me/images/mong", (res) => {
          let data = "";
          res.on("data", (chunk) => data += chunk);
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch (err) {
              reject("Lỗi JSON từ API.");
            }
          });
        }).on("error", reject);
      });

      const imageUrl = imageData.url;
      if (!imageUrl) {
        return api.sendMessage("Không lấy được ảnh từ API.", threadId, threadType);
      }

      const cacheDir = path.resolve("Data", "Cache");
      await fsp.mkdir(cacheDir, { recursive: true });

      const fileName = `nude_${Date.now()}.jpg`;
      const filePath = path.join(cacheDir, fileName);

      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filePath);
        https.get(imageUrl, (res) => {
          res.pipe(file);
          file.on("finish", () => file.close(resolve));
        }).on("error", async (err) => {
          await fsp.unlink(filePath).catch(() => {});
          reject(err);
        });
      });

      await api.sendMessage(
        {
          msg: "mê lắm hả :>?",
          attachments: [filePath],
                 ttl: 30000
        },
        threadId,
        threadType
      );

      await fsp.unlink(filePath);

    } catch (err) {
      console.error("[IMAGE_COMMAND] Lỗi gửi ảnh dú:", err);
      await api.sendMessage("Đã xảy ra lỗi khi gửi ảnh dú.", threadId, threadType);
    }
  }
};
