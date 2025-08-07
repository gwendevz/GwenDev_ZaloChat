import { query } from "../App/Database.js";
import { log } from "../Utils/Logger.js";

const WHITELISTED_DOMAINS = ["gwendev.com"];

// Regex bắt tất cả link và domain (kể cả thiếu giao thức)
const LINK_REGEX = /\b((https?:\/\/)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/\S*)?)/gi;

// Danh sách hậu tố domain cần chặn
const BLOCKED_SUFFIXES = [
  ".com", ".net", ".org", ".xyz", ".cn", ".top", ".tk", ".ml", ".ga",
  ".buzz", ".shop", ".cf", ".info", ".biz", ".online", ".store", ".live", ".tech", ".club"
];

async function isAntiLinkEnabled(threadId) {
  const rows = await query("SELECT status, thread FROM settings WHERE cmd = 'antilink' LIMIT 1");
  if (!rows.length) return true;

  const { status, thread } = rows[0];
  let list = [];
  try { list = thread ? JSON.parse(thread) : []; } catch {}

  const entry = list.find(([id]) => id === threadId);
  return entry ? entry[2] === "on" : status === 1;
}

function isWhitelistedLink(href = "") {
  try {
    const url = new URL(href.startsWith("http") ? href : `https://${href}`);
    const domain = url.hostname.replace(/^www\./, "");
    return url.protocol === "https:" && WHITELISTED_DOMAINS.includes(domain);
  } catch {
    return false;
  }
}

function containsBlockedSuffix(text = "") {
  const lc = text.toLowerCase();
  return BLOCKED_SUFFIXES.some(suffix => lc.includes(suffix));
}

function containsBlacklistedDomain(text = "") {
  const matches = [...text.matchAll(LINK_REGEX)];

  for (const match of matches) {
    const raw = match[0].toLowerCase();
    // Bỏ qua nếu trong whitelist
    if (isWhitelistedLink(raw)) continue;

    // Nếu domain có đuôi nằm trong blacklist thì chặn
    const suffixMatch = BLOCKED_SUFFIXES.find(suffix => raw.endsWith(suffix) || raw.includes(suffix + "/"));
    if (suffixMatch) return raw;
  }

  return null;
}

async function handleLinkViolation(api, threadId, userId, name, type, data, content = "") {
  try {
    if (data.cliMsgId && data.msgId) {
      await api.deleteMessage({
        threadId,
        type,
        data: { cliMsgId: data.cliMsgId, msgId: data.msgId, uidFrom: userId }
      }, false);
    }

    log(`[ANTI] - Bị chặn: ${content || "[không rõ nội dung]"}`);

    const msgBody = `@${name}, để gwen nói cho nghe này. gwen đang bật chặn link nên đừng gửi link nữa nha!`;
    await api.sendMessage({
      msg: msgBody,
      mentions: [{
        uid: userId,
        pos: msgBody.indexOf(`@${name}`),
        len: name.length + 1
      }]
    }, threadId, type);

  } catch (err) {
    log("[ANTI] - Lỗi khi xử lý:", err);
  }
}

export function startAntiLink(api) {
  api.listener.on("message", async (msg) => {
    const threadId = msg.threadId;
    const userId = msg.data?.uidFrom;
    const name = msg.senderName || "Người dùng";
    const type = msg.type;
    const data = msg.data;

    if (!userId || !data) return;
    if (!(await isAntiLinkEnabled(threadId))) return;

    // Case 1: Loại link "chat.recommended"
    if (data.msgType === "chat.recommended" && data.content?.action === "recommened.link") {
      const link = data.content?.href;
      if (!isWhitelistedLink(link)) {
        return await handleLinkViolation(api, threadId, userId, name, type, data, link);
      }
    }

    // Case 2: Text thường
    const text = data.body || data.content?.text || data.message?.body || "";
    if (text) {
      const badMatch = containsBlacklistedDomain(text);
      if (badMatch) {
        return await handleLinkViolation(api, threadId, userId, name, type, data, badMatch);
      }
    }
  });
}
