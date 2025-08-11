// author @GwenDev
import { query } from "../../App/Database.js";

function parseDuration(str) {
  if (!str) return null;

  const normalized = str.toLowerCase()
    .replace(/phút|phut/g, 'm')
    .replace(/giờ|gio/g, 'h')
    .replace(/giây|giay/g, 's')
    .replace(/ngày|day/g, 'd')
    .replace(/\s+/g, '');

  const regex = /(\d+)([smhd])/g;
  let totalMs = 0;
  let match;

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  while ((match = regex.exec(normalized)) !== null) {
    const value = parseInt(match[1]);
    const unit = match[2];
    if (!multipliers[unit]) return null;
    totalMs += value * multipliers[unit];
  }

  return totalMs > 0 ? totalMs : null;
}


export default {
  name: "mute",
  description: "Cấm hoặc gỡ cấm người dùng nhắn tin",
  role: 2,
  cooldown: 5,
group: "admin",
async run({ message, api, args }) {
  const mentions = message.data?.mentions || [];
  const threadId = message.threadId;
  const type = message.type;

  const isSpecialSub = ["list", "mutelist", "unmute"].includes(args[0]?.toLowerCase());


  if (isSpecialSub) {
    const sub = args[0]?.toLowerCase();

    if (sub === "list" || sub === "mutelist") {
      const rows = await query("SELECT uid, name, mute_expire FROM users WHERE mute = 1");
      if (!rows.length) return api.sendMessage("Không có ai đang bị mute.", threadId, type);

      const now = Date.now();
      const list = [
        "╭────「 DANH SÁCH BỊ MUTE 」────⭓",
        ...rows.map((u, i) => {
          let timeLeft = "vĩnh viễn";
          if (u.mute_expire) {
            const remaining = u.mute_expire - now;
            timeLeft = remaining > 0 ? `${Math.floor(remaining / 60000)} phút nữa` : "hết hạn (đang xử lý...)";
          }
          return `│ ${i + 1}. ${u.name || "Không rõ"} - ${u.uid} (${timeLeft})`;
        }),
        "╰──────────────────────────────⭓"
      ];

      return api.sendMessage(list.join("\n"), threadId, type);
    }

    if (sub === "unmute") {
      if (!mentions.length) return api.sendMessage("Tag người bạn muốn unmute.", threadId, type);

      for (const user of mentions) {
        await query("UPDATE users SET mute = 0, mute_expire = NULL WHERE uid = ?", [user.uid]);
      }

      return api.sendMessage(`Đã gỡ mute ${mentions.length} người.`, threadId, type);
    }
  }
  if (!mentions.length)
    return api.sendMessage("Tag người bạn muốn mute.", threadId, type);

  const durationArg = args.find(arg => /^[\d\s]*(s|m|h|d|giây|phút|giờ|ngày)$/i.test(arg));
  let duration = null;
  let expireTime = null;

  if (durationArg && durationArg.toLowerCase() !== "vinhvien") {
    duration = parseDuration(durationArg);
    if (!duration) {
      return api.sendMessage("Sai định dạng thời gian. Ví dụ: 10m, 2h, 1d", threadId, type);
    }
    expireTime = Date.now() + duration;
  }

  for (const user of mentions) {
    await query(
      "UPDATE users SET mute = 1, mute_expire = ? WHERE uid = ?",
      [expireTime, user.uid]
    );
  }

  const timeMsg = duration ? `(trong ${durationArg})` : "(vĩnh viễn)";
  return api.sendMessage(`Đã mute ${mentions.length} người ${timeMsg}.`, threadId, type);
}

};
