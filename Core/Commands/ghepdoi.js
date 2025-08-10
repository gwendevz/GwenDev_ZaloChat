// author @GwenDev
import fs from "fs";
import fsp from "fs/promises";
import axios from "axios";
import { createCanvas, loadImage } from "canvas";
import path from "path";
import { query } from "../../App/Database.js";

const bgPath = path.resolve("Data", "Cache", "GhepDoi", "ghepdoi.jpg");
const weddingPath = path.resolve("Data", "Cache", "GhepDoi", "giaykethon.jpg");
const cacheDir = path.resolve("Data", "Cache", "GhepDoi");
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

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
  const images = await Promise.all(avatarPaths.map(p => loadImage(p)));
  const resized = await Promise.all(images.map(img => resizeAndCropCircle(img, 50)));
  const canvas = createCanvas(500, 500);
  const ctx = canvas.getContext("2d");
  const bg = await loadImage(bgPath);
  ctx.drawImage(bg, 0, 0, 500, 500);
  ctx.drawImage(resized[0], 175, 150);
  ctx.drawImage(resized[1], 315, 80);
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(outputPath, buffer);
}

async function fillWeddingCertificate(profile1, profile2) {
  const outputPath = path.resolve("Data", "Cache", "GhepDoi", `giaykethon_filled_${Date.now()}.jpg`);

  const canvas = createCanvas(640, 525); 
  const ctx = canvas.getContext("2d");

  const img = await loadImage(weddingPath);
  ctx.drawImage(img, 0, 0, 640, 525);

  ctx.font = "14px Arial";
  ctx.fillStyle = "black";

  const name1 = profile1.displayName || profile1.zaloName || profile1.username || "Zalo";
  const name2 = profile2.displayName || profile2.zaloName || profile2.username || "Zalo";

  ctx.fillText(name1, 190, 190); // Họ và tên chồng
  ctx.fillText("30/11/2000", 190, 210); // Ngày, tháng, năm sinh chồng (mặc định)
  ctx.fillText("Kinh", 130, 230); // Dân tộc chồng
  ctx.fillText("Việt Nam", 230, 225); // Quốc tịch chồng
  ctx.fillText("Zalo", 190, 245); // Nơi thường trú/tạm trú chồng
  ctx.fillText("88888888", 190, 285); // Số Giấy CMND/Hộ chiếu chồng
  ctx.fillText(name1, 190, 350); // Chữ ký của chồng

  ctx.fillText(name2, 470, 190); // Họ và tên vợ
  ctx.fillText("30/11/2000", 470, 210); // Ngày, tháng, năm sinh vợ (mặc định)
  ctx.fillText("Kinh", 400, 230); // Dân tộc vợ
  ctx.fillText("Việt Nam", 520, 225); // Quốc tịch vợ
  ctx.fillText("Zalo", 470, 245); // Nơi thường trú/tạm trú vợ
  ctx.fillText("88888888", 470, 285); // Số Giấy CMND/Hộ chiếu vợ
  ctx.fillText(name2, 460, 350); // Chữ ký của vợ

  const today = new Date();
  ctx.fillText(today.getDate().toString().padStart(2, '0'), 430, 395); // Ngày đăng ký
  ctx.fillText((today.getMonth() + 1).toString().padStart(2, '0'), 490, 395); // Tháng đăng ký
  ctx.fillText(today.getFullYear().toString(), 540, 395); // Năm đăng ký

  ctx.fillText("gwendev", 150, 490); // Cán bộ Tư pháp hộ tịch
  ctx.fillText("AnhDuc", 450, 490); // Chủ tịch

  const buffer = canvas.toBuffer("image/jpeg");
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

function getLoveMessage(percent) {
  if (percent >= 90) return "Hai bạn là cặp đôi hoàn hảo, định mệnh sắp gọi tên!";
  if (percent >= 80) return "Tình yêu này đẹp như mơ, hãy nắm lấy nhé!";
  if (percent >= 70) return "Có sự kết nối mạnh mẽ, hãy thử tìm hiểu nhau!";
  if (percent >= 60) return "Một chút duyên, một chút nợ – đủ để bắt đầu!";
  if (percent >= 50) return "Có thể chỉ là một cái duyên nhỏ, nhưng biết đâu đó là khởi đầu?";
  if (percent >= 40) return "Tình yêu cần thời gian, hãy cho nhau cơ hội!";
  if (percent >= 30) return "Chưa chắc hợp, nhưng biết đâu bất ngờ!";
  if (percent >= 20) return "Còn xa vời, nhưng không gì là không thể!";
  if (percent >= 10) return "Tình duyên mong manh như sương sớm!";
  return "Có lẽ bạn nên thử... người khác 😅";
}

export default {
  name: "ghepdoi",
  description: "Ghép đôi người dùng với tỷ lệ tình duyên.",
  cooldown: 10,
  role: 0,
  group: "group",
  aliases: ["ghép đôi", "ghép", "tình duyên", "love", "match"],
  noPrefix: true,

  async run({ message, api, args }) {
    const threadId = message.threadId;
    const type = message.type;
    const mentions = message.data.mentions || [];
    const senderUid = message.data.uidFrom;

    try {
      let user1Uid = senderUid;
      let user2Uid;

      if (mentions.length > 0) {
        user2Uid = mentions[0].uid;
      } else if (args[0]) {
        const genderFilter = args[0].toLowerCase();
        if (!["nam", "nữ"].includes(genderFilter)) {
          return api.sendMessage("Vui lòng @tag người hoặc dùng `.ghepdoi nam` / `.ghepdoi nữ`.", threadId, type);
        }

        const users = await query("SELECT uid, tuongtac FROM users");
        const filtered = [];

        for (const user of users) {
          if (user.uid === senderUid) continue;
          try {
            const data = JSON.parse(user.tuongtac || "[]");
            const inThread = data.some(t => t.threadId === threadId);
            if (!inThread) continue;

            const info = await api.getUserInfo(user.uid);
            const changedProfiles = info.changed_profiles || {};
            const profileKey = Object.keys(changedProfiles).find(k => k.startsWith(user.uid));
            const profile = changedProfiles[profileKey];
            if (!profile || typeof profile.gender === "undefined") continue;

            const gender = profile.gender === 0 ? "nam" : profile.gender === 1 ? "nữ" : "khác";
            if (gender === genderFilter) {
              filtered.push({ uid: user.uid, avatar: profile.avatar });
            }
          } catch (_) {
            continue;
          }
        }

        if (filtered.length === 0) {
          return api.sendMessage(`Không tìm thấy người dùng giới tính "${genderFilter}" trong nhóm.`, threadId, type);
        }

        const randomUser = filtered[Math.floor(Math.random() * filtered.length)];
        user2Uid = randomUser.uid;
      } else {
        return api.sendMessage("Vui lòng @tag người hoặc dùng `.ghepdoi nam` / `.ghepdoi nữ`.", threadId, type);
      }

      const info = await api.getUserInfo([user1Uid, user2Uid]);
      const changedProfiles = info.changed_profiles || {};
      let profile1 = null, profile2 = null;
      for (const [key, value] of Object.entries(changedProfiles)) {
        const uid = key.split("_")[0];
        if (uid === user1Uid) profile1 = value;
        if (uid === user2Uid) profile2 = value;
      }

      if (!profile1 || !profile2) {
        return api.sendMessage("Không thể lấy thông tin người dùng.", threadId, type);
      }

      const avatar1Path = path.join(cacheDir, `${user1Uid}_avatar.png`);
      const avatar2Path = path.join(cacheDir, `${user2Uid}_avatar.png`);
      const [avatar1Data, avatar2Data] = await Promise.all([
        axios.get(profile1.avatar, { responseType: "arraybuffer" }),
        axios.get(profile2.avatar, { responseType: "arraybuffer" }),
      ]);

      fs.writeFileSync(avatar1Path, avatar1Data.data);
      fs.writeFileSync(avatar2Path, avatar2Data.data);

      const resultPath = path.join(cacheDir, `result_${Date.now()}.png`);
      await combineAvatars([avatar1Path, avatar2Path], resultPath);

      const compatibility = Math.floor(Math.random() * 101);
      const messageText = getLoveMessage(compatibility);
      const name1 = profile1.displayName || profile1.zaloName || profile1.username || "Bạn";
      const name2 = profile2.displayName || profile2.zaloName || profile2.username || "Người ấy";

      const sent = await api.sendMessage(
        
        {
          msg: `💞 Tỉ lệ tình duyên giữa ${name1} và ${name2} là: ${compatibility}%\n📝 ${messageText}`,
          mentions: [
            { tag: name1, uid: user1Uid },
            { tag: name2, uid: user2Uid },
          ],
          attachments: [resultPath],
          ttl: 30000
        },
        threadId,
        type
      );
      if (compatibility > 50) {
        if (fs.existsSync(weddingPath)) {
          const filledWeddingPath = await fillWeddingCertificate(profile1, profile2);
          await api.sendMessage(
            {
              msg: "Đây là giấy kết hôn của hai bạn",
              attachments: [filledWeddingPath]
            },
            threadId,
            type
          );
          await fsp.unlink(filledWeddingPath).catch(() => {});
        }
      }

      await fsp.unlink(avatar1Path).catch(() => {});
      await fsp.unlink(avatar2Path).catch(() => {});
      await fsp.unlink(resultPath).catch(() => {});

    } catch (err) {
      console.error("[GHEPDOI_COMMAND] Lỗi:", err);
      api.sendMessage("Đã xảy ra lỗi khi ghép đôi.", threadId, type);
    }
  }
};
