// author @GwenDev
import fs from "fs";
import fsp from "fs/promises";
import axios from "axios";
import { createCanvas, loadImage } from "canvas";
import path from "path";

const cacheDir = path.resolve("Data", "Cache", "GhepDoi");
const bgPath = path.join(cacheDir, "ghepmat.png");

async function ensureBackground() {
  if (!fs.existsSync(cacheDir)) await fsp.mkdir(cacheDir, { recursive: true });
  if (!fs.existsSync(bgPath)) {
    const { data } = await axios.get("https://i.imgur.com/BJVyOkq.jpg", { responseType: "arraybuffer" });
    await fsp.writeFile(bgPath, data);
  }
}

async function resizeAndCropCircle(image, size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, 0, 0, size, size);
  return canvas;
}

async function combineAvatars(avatarPaths, outputPath) {
  await ensureBackground();
  const [bg, ...avImgs] = await Promise.all([
    loadImage(bgPath),
    ...avatarPaths.map(p => loadImage(p)),
  ]);

  const circles = await Promise.all(avImgs.map(img => resizeAndCropCircle(img, 102)));

  const canvas = createCanvas(bg.width, bg.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bg, 0, 0, bg.width, bg.height);
  
  ctx.drawImage(circles[0], 430, 100);
  ctx.drawImage(circles[1], 520, 155);

  const buffer = canvas.toBuffer("image/png");
  await fsp.writeFile(outputPath, buffer);
}

export default {
  name: "chupchung",
  description: "Chụp chung với người được tag.",
  cooldown: 5,
  role: 0,
  group: "fun",
  aliases: ["chụp chung"],
  noPrefix: true,

  async run({ message, api }) {
    const threadId = message.threadId;
    const type = message.type;
    const mentions = message.data.mentions || [];
    if (mentions.length === 0) {
      return api.sendMessage("Vui lòng tag một người để chụp chung.", threadId, type);
    }

    try {
      const uid1 = message.data.uidFrom;
      const uid2 = mentions[0].uid;

      const info = await api.getUserInfo([uid1, uid2]);
      const changedProfiles = info.changed_profiles || {};
      let profile1 = null, profile2 = null;
      for (const [key, value] of Object.entries(changedProfiles)) {
        const uid = key.split("_")[0];
        if (uid === uid1) profile1 = value;
        if (uid === uid2) profile2 = value;
      }
      if (!profile1 || !profile2) {
        return api.sendMessage("Không thể lấy avatar người dùng.", threadId, type);
      }

      const avatar1Url = profile1.avatar;
      const avatar2Url = profile2.avatar;

      const avatar1Path = path.join(cacheDir, `${uid1}_avatar_${Date.now()}.png`);
      const avatar2Path = path.join(cacheDir, `${uid2}_avatar_${Date.now()}.png`);

      const [av1Data, av2Data] = await Promise.all([
        axios.get(avatar1Url, { responseType: "arraybuffer" }),
        axios.get(avatar2Url, { responseType: "arraybuffer" }),
      ]);

      await Promise.all([
        fsp.writeFile(avatar1Path, av1Data.data),
        fsp.writeFile(avatar2Path, av2Data.data),
      ]);

      const resultPath = path.join(cacheDir, `chupchung_${uid1}_${uid2}_${Date.now()}.png`);
      await combineAvatars([avatar1Path, avatar2Path], resultPath);

      await api.sendMessage(
        {
          msg: "📸 Chụp chung đã sẵn sàng!",
          attachments: [resultPath],
          mentions: [
            { tag: "Bạn", uid: uid1 },
            { tag: "Người ấy", uid: uid2 },
          ],
          ttl: 120_000,
        },
        threadId,
        type
      );

      setTimeout(() => {
        [avatar1Path, avatar2Path, resultPath].forEach(p => fsp.unlink(p).catch(() => {}));
      }, 60_000);

    } catch (err) {
      console.error("[CHUPCHUNG_COMMAND] Lỗi:", err);
      api.sendMessage("Đã xảy ra lỗi khi tạo ảnh.", threadId, type);
    }
  },
};
