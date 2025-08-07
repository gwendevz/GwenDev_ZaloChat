import { query } from "../App/Database.js";
import { log } from "../Utils/Logger.js";
const SPAM_LIMITS = {
  warning1: 3,
  warning2: 5,
  kick: 6
};

const SPAM_TIME = 2000;
const spamCache = {};
const warned = {};

async function isAntiSpamEnabled(threadId) {
  const rows = await query("SELECT status, thread FROM settings WHERE cmd = 'antispam' LIMIT 1");
  if (!rows.length) return true;

  const { status, thread } = rows[0];
  let list = [];

  try {
    list = thread ? JSON.parse(thread) : [];
  } catch (err) {
   
  }

  const entry = list.find(([id]) => id === threadId);
  if (entry) return entry[2] === "on";
  return status === 1;
}

export function startAntiSpam(api) {
  api.listener.on("message", async (msg) => {
    const threadId = msg.threadId;
    const userId = msg.data?.uidFrom;
    const name = msg.senderName || "Người dùng";
    const type = msg.type;
    if (!userId) return;

    const allow = await isAntiSpamEnabled(threadId);
    if (!allow) return;

    const now = Date.now();
    if (!spamCache[threadId]) spamCache[threadId] = {};
    if (!spamCache[threadId][userId]) spamCache[threadId][userId] = [];

    const userCache = spamCache[threadId][userId];
    userCache.push(now);
    spamCache[threadId][userId] = userCache.filter(ts => now - ts <= SPAM_TIME);

    const count = userCache.length;
    warned[threadId] = warned[threadId] || {};
    warned[threadId][userId] = warned[threadId][userId] || { w1: false, w2: false };

    try {
      if (count > SPAM_LIMITS.warning1) {
        if (msg.data?.cliMsgId && msg.data?.msgId) {
          await api.deleteMessage({
            threadId,
            type,
            data: {
              cliMsgId: msg.data.cliMsgId,
              msgId: msg.data.msgId,
              uidFrom: userId
            }
          }, false);
        }
      }

      if (count > SPAM_LIMITS.warning1 && !warned[threadId][userId].w1) {
        warned[threadId][userId].w1 = true;
        const msgBody = `@${name}, ê ê ê không spam nha. không vui đâu nha`;
        return await api.sendMessage({
          msg: msgBody,
          mentions: [{
            uid: userId,
            pos: msgBody.indexOf(`@${name}`),
            len: name.length + 1
          }]
        }, threadId, type);
      }

      if (count > SPAM_LIMITS.warning2 && !warned[threadId][userId].w2) {
        warned[threadId][userId].w2 = true;
        const msgBody = `@${name}, máaaaaaaaaa con lợn này lì thế ? spam nữa gwen kick luôn đó nha ?`;
        return await api.sendMessage({
          msg: msgBody,
          mentions: [{
            uid: userId,
            pos: msgBody.indexOf(`@${name}`),
            len: name.length + 1
          }]
        }, threadId, type);
      }

      if (count > SPAM_LIMITS.kick) {
        try {
          await api.removeUserFromGroup([userId], threadId);

          const msgBody = `Tạm biệt.. để gwen kick mài nè coan chóa`;
          await api.sendMessage({
            msg: msgBody,
            mentions: [{
              uid: userId,
              pos: msgBody.indexOf(`@${name}`),
              len: name.length + 1
            }]
          }, threadId, type);
        } catch (err) {
         
        }
        spamCache[threadId][userId] = [];
        warned[threadId][userId] = { w1: false, w2: false };
      }

    } catch (err) {
    
    }
  });
}
