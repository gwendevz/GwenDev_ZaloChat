import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { settings } from "../App/Settings.js";
import { ThreadType } from "zca-js";
import { role } from "../Database/Admin.js";
import { user } from "../Database/User.js";
import { query } from "../App/Database.js";
import { group } from "../Database/Group.js";

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
        commands.set(alias.toLowerCase(), { ...command, _aliasOnly: true });
      }
    }
  }
}

async function getLuot(threadId) {
  const [row] = await query(`SELECT luotdung FROM groups WHERE thread_id = ? LIMIT 1`, [threadId]);
  return row?.luotdung ?? 0;
}

async function truLuot(threadId) {
  const luot = await getLuot(threadId);
  const newVal = Math.max(0, luot - 1);
  await query(`UPDATE groups SET luotdung = ? WHERE thread_id = ?`, [newVal, threadId]);
  return newVal;
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
  if (!content.startsWith(prefix) && !command._aliasOnly) return;

  await group(threadId, threadName);

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
    } catch {}
    return;
  }

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

  const luot = await getLuot(threadId);

  if (luot <= 0 && finalRole < 2 && command.name !== "thuebot") {
    try {
      await api.addReaction(
        { icon: "❌", rType: 0, source: 6 },
        {
          type: ThreadType.Group,
          threadId,
          data: {
            msgId: message.data.msgId,
            cliMsgId: message.data.cliMsgId ?? 0,
          },
        }
      );
    } catch {}
    return api.sendMessage(
      "𝐁𝐨𝐭 𝐇𝐞̂́𝐭 𝐋𝐮̛𝐨̛̣𝐭 𝐃𝐮̀𝐧𝐠 𝐑𝐨̂̀𝐢/n 𝐕𝐮𝐢 𝐋𝐨̀𝐧𝐠 𝐂𝐡𝐚𝐭 .𝐭𝐡𝐮𝐞𝐛𝐨𝐭 𝐍𝐞̂́𝐮 𝐌𝐮𝐨̂́𝐧 𝐓𝐢𝐞̂́𝐩 𝐓𝐮̣𝐜 𝐒𝐮̛̉ 𝐃𝐮̣𝐧𝐠.",
      threadId,
      ThreadType.Group
    );
  }
  if (finalRole < 2 && command.name !== "thuebot") {
    const remaining = await truLuot(threadId);
    if ([5, 3, 1].includes(remaining)) {
      await api.sendMessage(` C𝐂𝐚̉𝐧𝐡 𝐁𝐚́𝐨: 𝐁𝐨𝐭 𝐂𝐡𝐢̉ 𝐂𝐨̀𝐧:  ${remaining} 𝐋𝐮̛𝐨̛̣𝐭 𝐃𝐮̀𝐧𝐠/n 𝐕𝐮𝐢 𝐋𝐨̀𝐧𝐠 𝐂𝐡𝐚𝐭 .𝐭𝐡𝐮𝐞𝐛𝐨𝐭 𝐍𝐞̂́𝐮 𝐌𝐮𝐨̂́𝐧 𝐓𝐢𝐞̂́𝐩 𝐓𝐮̣𝐜 𝐒𝐮̛̉ 𝐃𝐮̣𝐧𝐠`, threadId, ThreadType.Group);
    }
  }

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
