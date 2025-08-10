// author @GwenDev
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { ThreadType } from "zca-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commandsDir = __dirname; 

async function importWithBust(filePath) {
  const url = pathToFileURL(filePath).href + `?t=${Date.now()}`;
  return await import(url);
}

function removeCommandFromMap(commands, name) {
  const keysToDelete = [];
  for (const [key, value] of commands.entries()) {
    if (value?.name === name || (value?._aliasOnly && value.name === name)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(k => commands.delete(k));
}

async function loadSingleCommand(commands, name) {
  let filePath = path.join(commandsDir, `${name}.js`);
  if (!fs.existsSync(filePath)) {
    const files = fs.readdirSync(commandsDir).filter(f => f.endsWith(".js"));
    let found = null;
    for (const f of files) {
      try {
        const mod = await importWithBust(path.join(commandsDir, f));
        const cmd = mod?.default;
        if (cmd?.name?.toLowerCase() === name.toLowerCase()) {
          found = path.join(commandsDir, f);
          break;
        }
      } catch {}
    }
    if (!found) throw new Error(`Không tìm thấy file cho lệnh "${name}"`);
    filePath = found;
  }

  const mod = await importWithBust(filePath);
  const cmd = mod?.default;
  if (!cmd?.name) throw new Error(`Lệnh trong file không hợp lệ`);

  removeCommandFromMap(commands, cmd.name);
  commands.set(cmd.name.toLowerCase(), cmd);
  if (Array.isArray(cmd.aliases)) {
    for (const alias of cmd.aliases) {
      commands.set(alias.toLowerCase(), { ...cmd, _aliasOnly: true });
    }
  }
  return cmd.name;
}

async function loadAllCommands(commands) {
  const files = fs.readdirSync(commandsDir).filter(f => f.endsWith(".js"));
  commands.clear();
  let count = 0;
  for (const f of files) {
    try {
      const mod = await importWithBust(path.join(commandsDir, f));
      const cmd = mod?.default;
      if (!cmd?.name) continue;
      commands.set(cmd.name.toLowerCase(), cmd);
      if (Array.isArray(cmd.aliases)) {
        for (const alias of cmd.aliases) {
          commands.set(alias.toLowerCase(), { ...cmd, _aliasOnly: true });
        }
      }
      count++;
    } catch (e) {
     
      console.error(`[CMD] Lỗi load file ${f}:`, e?.message || e);
    }
  }
  return count;
}

export default {
  name: "cmd",
  description: "hok bíc",
  role: 2,
  cooldown: 0,
  group: "admin",
  aliases: [],
  noPrefix: false,

  async run({ message, api, args, commands }) {
    const threadId = message.threadId;
    const threadType = message.type ?? ThreadType.User;

    const sub = (args[0] || "").toLowerCase();
    if (sub === "new" || sub === "create") {
      const rawName = (args[1] || "").trim();
      const force = args.includes("--force");
      if (!rawName) {
        return api.sendMessage("Dùng: .cmd new <ten_lenh> [--force]", threadId, threadType);
      }
      const valid = rawName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");
      if (!valid) {
        return api.sendMessage("Tên lệnh chỉ được chứa a-z, 0-9, -, _", threadId, threadType);
      }

      const target = path.join(commandsDir, `${valid}.js`);
      if (fs.existsSync(target) && !force) {
        return api.sendMessage(`File đã tồn tại: ${valid}.js (thêm --force để ghi đè)`, threadId, threadType);
      }

      const template = `import { ThreadType } from "zca-js";
import { dangKyReply } from "../../Handlers/HandleReply.js";

export default {
  name: "${valid}",
  description: "Mô tả lệnh ${valid}",
  role: 0,
  cooldown: 3,
  group: "tool",
  aliases: [],
  noPrefix: false,

  async run({ message, api, args }) {
    const threadId = message.threadId;
    const threadType = message.type ?? ThreadType.User;
    const uid = message.data?.uidFrom;

    const res = await api.sendMessage("Nhập nội dung...", threadId, threadType);
    const msgId = res?.message?.msgId ?? res?.msgId ?? null;
    const cliMsgId = res?.message?.cliMsgId ?? res?.cliMsgId ?? null;

    dangKyReply({
      msgId,
      cliMsgId,
      threadId,
      authorId: uid,
      command: "${valid}",
      onReply: async ({ message, api, content }) => {
        await api.sendMessage("Bạn vừa nhập: " + (content || ""), message.threadId, message.type ?? ThreadType.User);
        return { clear: true };
      }
    });
  }
};
`;

      try {
        fs.writeFileSync(target, template, "utf8");
        try { await loadSingleCommand(commands, valid); } catch {}
        return api.sendMessage(`Đã tạo lệnh mẫu: ${valid}.js`, threadId, threadType);
      } catch (e) {
        console.error("[CMD] Tạo lệnh lỗi:", e?.message || e);
        return api.sendMessage(`Tạo lệnh lỗi: ${e?.message || e}`, threadId, threadType);
      }
    }
    if (sub === "load") {
      const name = (args[1] || "").toLowerCase();
      if (!name) {
        return api.sendMessage("Dùng: .cmd load + tên lệnh", threadId, threadType);
      }
      try {
        const loadedName = await loadSingleCommand(commands, name);
        return api.sendMessage(`Đã load lại lệnh: ${loadedName}`, threadId, threadType);
      } catch (err) {
       
        console.error("[CMD] Load lỗi:", err?.message || err);
        return api.sendMessage(`Load lỗi: ${err?.message || err}`, threadId, threadType);
      }
    }

    if (sub === "loadall") {
      try {
        const count = await loadAllCommands(commands);
        return api.sendMessage(`Đã load lại ${count} lệnh.`, threadId, threadType);
      } catch (err) {
        
        console.error("[CMD] LoadAll lỗi:", err?.message || err);
        return api.sendMessage(`LoadAll lỗi: ${err?.message || err}`, threadId, threadType);
      }
    }

    return api.sendMessage(
      "Cú pháp:\n.cmd new <tên> [--force] — Tạo file lệnh mẫu\n.cmd load <tên> — Load lại 1 lệnh\n.cmd loadAll — Load lại toàn bộ lệnh",
      threadId,
      threadType
    );
  }
};


