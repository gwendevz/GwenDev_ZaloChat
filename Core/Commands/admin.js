// author @GwenDev
import { query } from "../../App/Database.js";

export default {
  name: "admin",
  description: "Quản lý admin: add, rm, list, ban, unban",
  role: 2,
  group: "admin",
  cooldown: 10,
  async run({ message, api, args }) {
    const mentions = message.data?.mentions || [];
    const sub = args[0]?.toLowerCase();
    const threadId = message.threadId;
    const type = message.type;

    switch (sub) {
      case "add": {
        if (mentions.length === 0) {
          return api.sendMessage("Vui lòng tag người bạn muốn thêm làm admin.", threadId, type);
        }

        for (const user of mentions) {
          await query(
            "INSERT INTO users (uid, name, admin) VALUES (?, ?, 2) ON DUPLICATE KEY UPDATE admin = 2",
            [user.uid, user.dName || "Không rõ"]
          );
        }

        return api.sendMessage(`Đã thêm ${mentions.length} người làm admin`, threadId, type);
      }

      case "rm": {
        if (mentions.length === 0) {
          return api.sendMessage("Vui lòng tag người bạn muốn gỡ quyền admin.", threadId, type);
        }

        for (const user of mentions) {
          await query("UPDATE users SET admin = 0 WHERE uid = ?", [user.uid]);
        }

        return api.sendMessage(`Đã gỡ quyền admin của ${mentions.length} người.`, threadId, type);
      }

      case "list": {
        const result = await query("SELECT uid, name, admin FROM users WHERE admin > 0 ORDER BY admin DESC");

        if (result.length === 0) {
          return api.sendMessage("Hiện tại chưa có ai là admin.", threadId, type);
        }

        const lines = [
          "╭─────「 DANH SÁCH ADMIN 」─────⭓",
          ...result.map((user, index) =>
            `│ ${index + 1}. ${user.name || "Không rõ"} - ${user.uid} (cấp ${user.admin})`),
          "╰──────────────────────────────⭓"
        ];

        return api.sendMessage(lines.join("\n"), threadId, type);
      }

      case "ban": {
        if (mentions.length === 0) {
          return api.sendMessage("Vui lòng tag người bạn muốn cấm sử dụng bot.", threadId, type);
        }

        for (const user of mentions) {
          await query("UPDATE users SET ban = 1 WHERE uid = ?", [user.uid]);
        }

        return api.sendMessage(`Đã cấm ${mentions.length} người sử dụng bot.`, threadId, type);
      }

      case "unban": {
        if (mentions.length === 0) {
          return api.sendMessage("Vui lòng tag người bạn muốn gỡ cấm.", threadId, type);
        }

        for (const user of mentions) {
          await query("UPDATE users SET ban = 0 WHERE uid = ?", [user.uid]);
        }

        return api.sendMessage(`Đã gỡ cấm ${mentions.length} người.`, threadId, type);
      }

      default:
        return api.sendMessage(
          "Cú pháp: admin add @tag | rm @tag | list | ban @tag | unban @tag",
          threadId,
          type
        );
    }
  },
};
