import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { settings } from "../App/Settings.js";
import { ThreadType } from "zca-js";
import { role } from "../Database/Admin.js";
import { user } from "../Database/User.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands = new Map();
const cooldowns = new Map();

const commandsPath = path.join(__dirname, "../Core/Commands");
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const fileUrl = pathToFileURL(filePath).href;
  const { default: command } = await import(fileUrl);
  if (command?.name) {
    commands.set(command.name.toLowerCase(), command);
    if (Array.isArray(command.aliases)) {
      for (const alias of command.aliases) {
        commands.set(alias.toLowerCase(), { ...command, _aliasOnly: true }); // đánh dấu alias
      }
    }
  }
}

export async function handleCommands(message, api) {
  const content = typeof message.data?.content === "string" ? message.data.content.trim() : "";
  if (!content) return;

  const prefix = settings.prefix;
  const threadId = message.threadId;
  const uid = message.data.uidFrom;
  const userName = message.data.senderName || "Người dùng";
  const threadName = message.threadName || "Box Chat";

  let commandName = null;
  let args = [];
  let command = null;

  if (content.startsWith(prefix)) {
    const split = content.slice(prefix.length).trim().split(/\s+/);
    commandName = split.shift()?.toLowerCase();
    args = split;
    command = commands.get(commandName);
  } else {
    for (const [key, cmd] of commands.entries()) {
      if (
        cmd.noPrefix === true &&
        cmd.aliases?.includes(key) &&
        content.toLowerCase().startsWith(key)
      ) {
        commandName = key;
        args = content.slice(key.length).trim().split(/\s+/);
        command = cmd;
        break;
      }
    }
  }

  if (!command) return;

  if (!content.startsWith(prefix) && !command._aliasOnly) {
    return; // không phải alias → không cho chạy
  }

  // Kiểm tra ban
  const allowed = await user(uid, userName, threadId, threadName);
  if (!allowed) {
    try {
      await api.addReaction(
        { icon: "❌", rType: 0, source: 6 },
        {
          type: threadId.length > 10 ? ThreadType.Group : ThreadType.User,
          threadId,
          data: {
            msgId: message.data.msgId,
            cliMsgId: message.data.cliMsgId ?? 0,
          },
        }
      );
    } catch (err) {
      console.warn(`[REACTION] Không thể thả ❌ do bị cấm:`, err);
    }
    return;
  }

  // Kiểm tra quyền
  const requiredRole = command.role ?? 0;
  const userDbRole = await role(uid);
  let groupRole = 0;

  if (threadId.length > 10) {
    try {
      const info = await api.getGroupInfo(threadId);
      const group = info.gridInfoMap?.[threadId];
      if (group?.creatorId === uid || group?.adminIds?.includes(uid)) {
        groupRole = 1;
      }
    } catch (err) {
      console.error("[ZALO] - Không thể lấy thông tin nhóm:", err);
    }
  }

  const finalRole = Math.max(userDbRole, groupRole);
  if (finalRole < requiredRole) {
    return api.sendMessage("Bạn không đủ quyền để sử dụng lệnh này.", threadId, message.type ?? ThreadType.User);
  }

  // Cooldown
  const cooldownTime = command.cooldown || 0;
  if (cooldownTime > 0 && finalRole < 2) {
    if (!cooldowns.has(command.name)) cooldowns.set(command.name, new Map());

    const now = Date.now();
    const userCooldowns = cooldowns.get(command.name);
    const lastUsed = userCooldowns.get(uid) || 0;
    const remaining = cooldownTime * 1000 - (now - lastUsed);

    if (remaining > 0) {
      const secondsLeft = Math.ceil(remaining / 1000);
      for (let i = secondsLeft; i > 0; i--) {
        setTimeout(async () => {
          try {
            await api.addReaction(
              { icon: "⏰", rType: 0, source: 6 },
              {
                type: threadId.length > 10 ? ThreadType.Group : ThreadType.User,
                threadId,
                data: {
                  msgId: message.data.msgId,
                  cliMsgId: message.data.cliMsgId ?? 0,
                },
              }
            );
          } catch (err) {
            console.warn(`[REACTION] Thả ⏰ (${i}) thất bại:`, err);
          }
        }, (secondsLeft - i) * 1000);
      }
      return;
    }

    userCooldowns.set(uid, now);
  }

  try {
    await command.run({ message, api, args, commands });
  } catch (err) {
    console.error(`Lỗi khi thực thi lệnh "${command.name}":`, err);
    await api.sendMessage(`Đã xảy ra lỗi khi chạy lệnh "${command.name}"`, threadId, message.type ?? ThreadType.User);
  }
}
