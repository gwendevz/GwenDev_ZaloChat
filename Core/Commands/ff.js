import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { Logger, log } from "../../Utils/Logger.js";

export default {
  name: "ff",
  description: "Xem thông tin tài khoản Free Fire",
  role: 0,
  cooldown: 5,
  group: "game",
  aliases: [
    "freefire", "thông tin freefire", "ff info", "xem ff", "uid ff"
  ],

  async run({ message, api, args }) {
    const threadId   = message.threadId;
    const threadType = message.type;

    const uid = args[0]?.trim();
    if (!uid) {
      return api.sendMessage("⚠️ Vui lòng nhập UID Free Fire!", threadId, threadType);
    }

    const region   = "vn";
    const infoURL  = `https://zrojectx-info-free-fire.vercel.app/player-info-zprojectx?uid=${uid}&region=${region}`;
    const imageURL = `https://jnl-outfit-v4.vercel.app/outfit-image?uid=${uid}&region=${region}&key=Dev-JNL`;

    try {
      const { data } = await axios.get(infoURL, { timeout: 10_000 });

      if (!data?.basicInfo) {
        throw new Error("Không tìm thấy thông tin tài khoản hoặc UID không hợp lệ.");
      }

      const basicInfo  = data.basicInfo  || {};
      const petInfo    = data.petInfo    || {};
      const socialInfo = data.socialInfo || {};

      const name        = basicInfo.nickname        || "Không rõ";
      const level       = basicInfo.level           || "N/A";
      const exp         = basicInfo.exp             || 0;
      const likes       = basicInfo.liked           || 0;
      const rankPoints  = basicInfo.rankingPoints   || 0; // Điểm rank
      const season      = basicInfo.seasonId        || "N/A";
      const badge       = basicInfo.badgeId         || "N/A";

      let gender = "Không rõ";
      if (typeof socialInfo.gender === "string") {
        if (socialInfo.gender.includes("MALE"))   gender = "Nam";
        if (socialInfo.gender.includes("FEMALE")) gender = "Nữ";
      }

      const petName  = petInfo.name   || "Không có";
      const petLevel = petInfo.level  || "N/A";
      const petSkin  = petInfo.skinId || "N/A";

      const msg =
`🎮 𝗧𝗛Ô𝗡𝗚 𝗧𝗜𝗡 𝗧À𝗜 𝗞𝗛𝗢Ả𝗡 𝗙𝗥𝗘𝗘 𝗙𝗜𝗥𝗘 🎮\n` +
`👤 Tên: ${name}\n` +
`🆔 UID: ${uid}\n` +
`⭐ Level: ${level} (EXP: ${exp})\n` +
`❤️ Lượt thích: ${likes}\n` +
`🏅 Điểm Rank: ${rankPoints}\n` +
`📛 Season: ${season}\n` +
`🎖️ Badge ID: ${badge}\n` +
`🚻 Giới tính: ${gender}\n` +
`🐶 Pet: ${petName} (Level ${petLevel}) | Skin: ${petSkin}\n` +
`🌍 Khu vực: ${basicInfo.region || "VN"}\n` +
`📦 Phiên bản: ${basicInfo.releaseVersion || "N/A"}`;

      const outfitRes = await axios.get(imageURL, { responseType: "arraybuffer", timeout: 10_000 });

      const cacheDir = path.resolve("Data", "Cache");
      await fs.mkdir(cacheDir, { recursive: true });

      const filePath = path.join(cacheDir, `ff_${uid}_${Date.now()}.png`);
      await fs.writeFile(filePath, outfitRes.data);

      await api.sendMessage({
        msg: msg,
        attachments: [filePath],
        ttl: 120_000
      }, threadId, threadType);

      await fs.unlink(filePath).catch(() => {});

    } catch (err) {
      log(`Lỗi khi lấy thông tin Free Fire: ${err.message || err}`, "error");

      if (err.message?.includes("Không tìm thấy")) {
        return api.sendMessage("❌ Không tìm thấy thông tin tài khoản. Vui lòng kiểm tra lại UID.", threadId, threadType);
      }
      return api.sendMessage("❌ Có lỗi xảy ra khi lấy thông tin. Vui lòng thử lại sau.", threadId, threadType);
    }
  }
};
