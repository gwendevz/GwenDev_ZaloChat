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
    const uid = message.data?.uidFrom;

  
    const [userExists] = await query("SELECT uid FROM users WHERE uid = ?", [uid]);
    if (!userExists) {
      return api.sendMessage("Bạn chưa có tài khoản trong hệ thống. Vui lòng tương tác với bot trước.", threadId, type);
    }

    switch (sub) {
      case "add": {
        if (mentions.length === 0) {
          return api.sendMessage("Vui lòng tag người bạn muốn thêm làm admin.", threadId, type);
        }

        let successCount = 0;
        for (const user of mentions) {
       
          const [existingUser] = await query("SELECT uid FROM users WHERE uid = ?", [user.uid]);
          if (!existingUser) {
            await api.sendMessage(`Người dùng ${user.dName || user.uid} chưa có tài khoản trong hệ thống.`, threadId, type);
            continue;
          }
          
          await query(
            "UPDATE users SET admin = 2 WHERE uid = ?",
            [user.uid]
          );
          successCount++;
        }

        if (successCount > 0) {
          return api.sendMessage(`Đã thêm ${successCount} người làm admin`, threadId, type);
        } else {
          return api.sendMessage("Không có ai được thêm làm admin.", threadId, type);
        }
      }

      case "rm": {
        if (mentions.length === 0) {
          return api.sendMessage("Vui lòng tag người bạn muốn gỡ quyền admin.", threadId, type);
        }

        let successCount = 0;
        for (const user of mentions) {
        
          const [existingUser] = await query("SELECT uid FROM users WHERE uid = ?", [user.uid]);
          if (!existingUser) {
            await api.sendMessage(`Người dùng ${user.dName || user.uid} chưa có tài khoản trong hệ thống.`, threadId, type);
            continue;
          }
          
          await query("UPDATE users SET admin = 0 WHERE uid = ?", [user.uid]);
          successCount++;
        }

        if (successCount > 0) {
          return api.sendMessage(`Đã gỡ quyền admin của ${successCount} người.`, threadId, type);
        } else {
          return api.sendMessage("Không có ai bị gỡ quyền admin.", threadId, type);
        }
      }

      case "list": {
        const result = await query("SELECT uid, name, admin FROM users WHERE admin > 0 ORDER BY admin DESC");

        if (result.length === 0) {
          return api.sendMessage("Hiện tại chưa có ai là admin.", threadId, type);
        }

        const lines = [
          "╭─────「 DANH SÁCH ADMIN 」─────⭓",
          ...result.map((user, index) =>
            `│ ${index + 1}. ${user.name || "Không rõ"} - ${user.uid}`),
          "╰──────────────────────────────⭓"
        ];

        return api.sendMessage(lines.join("\n"), threadId, type);
      }

      case "ban": {
        if (mentions.length === 0) {
          return api.sendMessage("Vui lòng tag người bạn muốn cấm sử dụng bot.", threadId, type);
        }

        let successCount = 0;
        for (const user of mentions) {
       
          const [existingUser] = await query("SELECT uid FROM users WHERE uid = ?", [user.uid]);
          if (!existingUser) {
            await api.sendMessage(`Người dùng ${user.dName || user.uid} chưa có tài khoản trong hệ thống.`, threadId, type);
            continue;
          }
          
          await query("UPDATE users SET ban = 1 WHERE uid = ?", [user.uid]);
          successCount++;
        }

        if (successCount > 0) {
          return api.sendMessage(`Đã cấm ${successCount} người sử dụng bot.`, threadId, type);
        } else {
          return api.sendMessage("Không có ai bị cấm.", threadId, type);
        }
      }

      case "unban": {
        if (mentions.length === 0) {
          return api.sendMessage("Vui lòng tag người bạn muốn gỡ cấm.", threadId, type);
        }

        let successCount = 0;
        for (const user of mentions) {
          
          const [existingUser] = await query("SELECT uid FROM users WHERE uid = ?", [user.uid]);
          if (!existingUser) {
            await api.sendMessage(`Người dùng ${user.dName || user.uid} chưa có tài khoản trong hệ thống.`, threadId, type);
            continue;
          }
          
          await query("UPDATE users SET ban = 0 WHERE uid = ?", [user.uid]);
          successCount++;
        }

        if (successCount > 0) {
          return api.sendMessage(`Đã gỡ cấm ${successCount} người.`, threadId, type);
        } else {
          return api.sendMessage("Không có ai được gỡ cấm.", threadId, type);
        }
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
