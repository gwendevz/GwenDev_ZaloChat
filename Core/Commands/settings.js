import { query } from "../../App/Database.js";


async function getThreadName(threadId) {
  const result = await query("SELECT name FROM groups WHERE thread_id = ? LIMIT 1", [threadId]);
  return result[0]?.name || `Nhóm ${threadId}`;
}

export default {
  name: "settings",
  description: "Quản lý các cài đặt bot như autodown",
  role: 2,
  cooldown: 10,
group: "admin",
  async run({ message, api, args }) {
    const threadId = message.threadId;
    const type = message.type;
    const cmd = (args[0] || "").toLowerCase();
    const action = (args[1] || "").toLowerCase();

    if (!cmd) {
      return api.sendMessage("Cú pháp: settings <cmd> <on|off|onallgroup|offallgroup|list>", threadId, type);
    }

    switch (action) {
      case "onallgroup": {
        await query("DELETE FROM settings WHERE cmd = ?", [cmd]);
        await query("INSERT INTO settings (cmd, status) VALUES (?, ?)", [cmd, 1]);
        return api.sendMessage(`Đã bật ${cmd} cho tất cả nhóm`, threadId, type);
      }

      case "offallgroup": {
        await query("DELETE FROM settings WHERE cmd = ?", [cmd]);
        await query("INSERT INTO settings (cmd, status) VALUES (?, ?)", [cmd, 0]);
        return api.sendMessage(`Đã tắt ${cmd} cho tất cả nhóm`, threadId, type);
      }

      case "off": {
        const data = await query("SELECT * FROM settings WHERE cmd = ?", [cmd]);
        let groupList = [];

        if (data.length > 0 && data[0].thread) {
          try {
            groupList = JSON.parse(data[0].thread);
          } catch (_) {}
        }

        const groupName = await getThreadName(threadId);

       const index = groupList.findIndex(([id]) => id === threadId);
if (index === -1) {
  groupList.push([threadId, groupName, "off"]);
} else {
  groupList[index][2] = "off"; 
}


        if (data.length > 0) {
          await query("UPDATE settings SET thread = ? WHERE cmd = ?", [JSON.stringify(groupList), cmd]);
        } else {
          await query("INSERT INTO settings (cmd, status, thread) VALUES (?, ?, ?)", [cmd, 1, JSON.stringify(groupList)]);
        }

        return api.sendMessage(`Đã tắt ${cmd} cho nhóm hiện tại`, threadId, type);
      }

      case "on": {
        const data = await query("SELECT * FROM settings WHERE cmd = ?", [cmd]);
        if (data.length === 0) return api.sendMessage(`${cmd} chưa được cài đặt.`, threadId, type);

        let groupList = [];
        try {
          groupList = JSON.parse(data[0].thread || "[]");
        } catch (_) {}

        const newList = groupList.filter(([id]) => id !== threadId);

        const groupName = await getThreadName(threadId);
        newList.push([threadId, groupName, "on"]);

        await query("UPDATE settings SET thread = ? WHERE cmd = ?", [JSON.stringify(newList), cmd]);
        return api.sendMessage(`Đã bật lại ${cmd} cho nhóm hiện tại`, threadId, type);
      }

      case "list": {
        const result = await query("SELECT * FROM settings");

        if (result.length === 0) return api.sendMessage("Chưa có cài đặt nào.", threadId, type);

        let lines = [];

        for (const row of result) {
          lines.push(`── CMD: ${row.cmd}`);
          lines.push(`Trạng thái mặc định: ${row.status === 1 ? "Bật" : "Tắt"}`);

          if (row.thread) {
            try {
              const list = JSON.parse(row.thread);
              if (list.length) {
                lines.push(`Danh sách nhóm được cấu hình riêng:`);
                for (const [id, name, status] of list) {
                  lines.push(`• ${name} (${id}) → ${status.toUpperCase()}`);
                }
              }
            } catch (_) {}
          }

          lines.push("────────────────────");
        }

        return api.sendMessage(lines.join("\n"), threadId, type);
      }

      default:
        return api.sendMessage("Cú pháp: settings <cmd> <on|off|onallgroup|offallgroup|list>", threadId, type);
    }
  }
};
