import { TextStyle } from "zca-js";

export default {
  name: "help",
  description: "Hiển thị danh sách lệnh hoặc thông tin chi tiết từng lệnh",
  version: "1.1.3",
  author: "GwenDev",
  group: "system",
  role: 0,
  cooldown: 10,
  aliases: ["trợ giúp", "danh sách lệnh", "commands là gì", "list lệnh", "hướng dẫn"],
  noPrefix: true,

  async run({ api, message, args, commands }) {
    if (args.length > 0) {
      const input = args.join(" ").toLowerCase();
      const command =
        commands.get(input) ||
        [...commands.values()].find(cmd => cmd.aliases?.includes(input));

      if (!command) {
        return api.sendMessage(`Không tìm thấy lệnh: "${input}".`, message.threadId, message.type);
      }

      const aliases = command.aliases?.length ? command.aliases.join(" | ") : "Không có";
      const prefix = `.${command.name}`;
      const noPrefix = aliases;
      const role =
        command.role === 2
          ? "Admin"
          : command.role === 1
          ? "Quản Trị"
          : "Người Dùng";

      const detail = `〔 HELP ${command.name.toUpperCase()} 〕
• Info: ${command.description || "Không có mô tả"}
• Version: ${command.version || "1.0.0"}
• Prefix: ${prefix}
• NoPrefix: ${noPrefix}
• Cooldown: ${command.cooldown || 0}s
• Role: ${role}
• Author: ${command.author || "Không rõ"}`;

      return api.sendMessage(detail, message.threadId, message.type);
    }

    const groupMap = {
      "MINIGAME": [],
      "GROUP": [],
      "ADMIN": [],
      "SYSTEM": [],
      "AI CHAT": [],
      "WORK": [],
      "MUSIC": [],
      "VIDEO": [],
      "IMAGE": [],
      "AUTO": [],
      "ANTI": [],
      "OTHER": [],
    };

    for (const [name, command] of commands) {
      if (command.aliases?.includes(name)) continue;
      const group = command.group?.toUpperCase() || "OTHER";
      if (!groupMap[group]) groupMap["OTHER"].push(name);
      else groupMap[group].push(name);
    }

    const totalCommands = [...commands.entries()].filter(
      ([name, cmd]) => !cmd.aliases?.includes(name)
    ).length;

    let msg = "⋆──────────────────⋆\n";
    const styles = [];
    let cursor = msg.length;

    for (const group in groupMap) {
      const cmds = groupMap[group];
      if (cmds.length > 0) {
        const title = `〔 ${group} 〕\n`;
        msg += title;

        styles.push(
          {
            start: cursor,
            len: title.trim().length,
            st: TextStyle.Bold
          },
          {
            start: cursor,
            len: title.trim().length,
            st: TextStyle.Green
          }
        );

        cursor += title.length;

        for (let i = 0; i < cmds.length; i += 8) {
          const line = cmds.slice(i, i + 8).join(", ") + ".\n";
          msg += line;
          cursor += line.length;
        }

        msg += "\n";
        cursor += 1;
      }
    }

    const footer =
      "⋆──────────────────⋆\n" +
      `⚙️ Tổng Lệnh: ${totalCommands}\n\n` +
      ".help <tenlenh>: Xem hướng dẫn dùng lệnh\n" +
      ".help gioithieu: Xem thông tin về GwenBot\n\n" ;

    msg += footer;

    return api.sendMessage({
      msg,
      styles,
      ttl: 120000
    }, message.threadId, message.type);
  }
};
