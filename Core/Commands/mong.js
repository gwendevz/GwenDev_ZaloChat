import https from "https";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";

export default {
  name: "mong",
  description: "Gửi ảnh mông từ API",
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

      const fileName = `mong_${Date.now()}.jpg`;
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
