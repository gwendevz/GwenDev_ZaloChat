import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { ThreadType } from "zca-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commandsDir = __dirname; // Core/Commands

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
    // Fallback: scan all files to find command by exported name
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

  // Remove old entries then add new
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
  // Rebuild in-place to keep the same Map reference
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
      // skip invalid file
      // eslint-disable-next-line no-console
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
    if (sub === "load") {
      const name = (args[1] || "").toLowerCase();
      if (!name) {
        return api.sendMessage("Dùng: .cmd load + tên lệnh", threadId, threadType);
      }
      try {
        const loadedName = await loadSingleCommand(commands, name);
        return api.sendMessage(`Đã load lại lệnh: ${loadedName}`, threadId, threadType);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[CMD] Load lỗi:", err?.message || err);
        return api.sendMessage(`Load lỗi: ${err?.message || err}`, threadId, threadType);
      }
    }

    if (sub === "loadall") {
      try {
        const count = await loadAllCommands(commands);
        return api.sendMessage(`Đã load lại ${count} lệnh.`, threadId, threadType);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[CMD] LoadAll lỗi:", err?.message || err);
        return api.sendMessage(`LoadAll lỗi: ${err?.message || err}`, threadId, threadType);
      }
    }

    return api.sendMessage(
      "Cú pháp:\n.cmd load + tên lệnh — Load lại 1 lệnh\n.cmd loadAll — Load lại toàn bộ lệnh",
      threadId,
      threadType
    );
  }
};


