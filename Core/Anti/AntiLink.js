// author @GwenDev
import { query } from "../../App/Database.js";

const WHITELISTED_DOMAINS = ["gwendev.com"];

async function isAntiLinkEnabled(threadId) {
  const rows = await query("SELECT status, thread FROM settings WHERE cmd = 'antilink' LIMIT 1");
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

function isWhitelistedLink(href = "") {
  try {
    const url = new URL(href);
    const domain = url.hostname.replace(/^www\./, "");
    return WHITELISTED_DOMAINS.includes(domain);
  } catch (err) {
     return false;
  }
}
const URL_REGEX = /(?:https?:\/\/|www\.|ftp\.)\S+|(?<!\w)[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+(?:\/[^\s]*)?(?!\w)/gi;

function extractUrls(text) {
  if (typeof text !== 'string') {
    return [];
  }
  const matches = text.match(URL_REGEX);
  return matches || [];
}

export function startAntiLink(api) {
  api.listener.on("message", async (msg) => {
    const threadId = msg.threadId;
    const userId = msg.data?.uidFrom;
    const name = msg.senderName || "Người dùng";
    const type = msg.type;
    const data = msg.data;
    const msgBody = String(msg.data?.content || ''); 

    if (!userId || !data) return;

    const allow = await isAntiLinkEnabled(threadId);
    if (!allow) {
     return;
    }

    let containsUnwhitelistedLink = false;
    let detectedLink = null;

    if (data.msgType === "chat.recommended" && data.content?.action === "recommened.link") {
      const link = data.content?.href;
      if (link) {
        if (!isWhitelistedLink(link)) {
          containsUnwhitelistedLink = true;
          detectedLink = link;
           } else {
         }
      }
    }

    
    if (msgBody && !containsUnwhitelistedLink) {
      const urlsInBody = extractUrls(msgBody);
      if (urlsInBody.length > 0) {
        for (const url of urlsInBody) {
          if (!isWhitelistedLink(url)) {
            containsUnwhitelistedLink = true;
            detectedLink = url;
            break; 
          } else {
           
          }
        }
      }
    }

    if (containsUnwhitelistedLink) {
      try {
       
        if (data.cliMsgId && data.msgId) {
          await api.deleteMessage({
            threadId,
            type,
            data: {
              cliMsgId: data.cliMsgId,
              msgId: data.msgId,
              uidFrom: userId
            }
          }, false);
        } else {
        }

        const responseMsg = `@${name}, để gwen nói cho nghe này. giờ gwen đang được bật chặn gửi link nên là chú em đừng có gửi linh tinh. `; 
      await api.sendMessage({               
          msg: responseMsg,
          mentions: [{
            uid: userId,
            pos: responseMsg.indexOf(`@${name}`),
            len: name.length + 1
          }]
        }, threadId, type);
        } catch (err) {
         }
    }
  });
}
