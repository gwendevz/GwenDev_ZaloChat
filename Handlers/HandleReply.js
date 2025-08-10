// author @GwenDev
const khoChoTheoThread = new Map();
const khoChoTheoMsg = new Map(); 
const khoOnReplyTheoThread = new Map(); 
const MAC_DINH_TTL_MS = 15 * 60_000; 

function chuanHoaPending(threadId, pending) {
  const now = Date.now();
  const ttlMs = Number(pending?.ttlMs) > 0 ? Number(pending.ttlMs) : MAC_DINH_TTL_MS;
  return {
    ...pending,
    threadId: String(threadId),
    authorId: pending?.authorId ? String(pending.authorId) : undefined,
    listMsgId: pending?.listMsgId ? String(pending.listMsgId) : undefined,
    listCliMsgId: pending?.listCliMsgId ? String(pending.listCliMsgId) : undefined,
    createdAt: Number(pending?.createdAt) || now,
    updatedAt: now,
    ttlMs
  };
}

function daHetHan(pending) {
  const now = Date.now();
  const created = Number(pending?.createdAt) || 0;
  const ttlMs = Number(pending?.ttlMs) || MAC_DINH_TTL_MS;
  return created + ttlMs < now;
}

export function datChoPhanHoi(threadId, pending) {
  if (!threadId || !pending) return;
  const norm = chuanHoaPending(threadId, pending);
  khoChoTheoThread.set(String(threadId), norm);
}

export function layChoPhanHoi(threadId) {
  return khoChoTheoThread.get(String(threadId));
}

export function xoaChoPhanHoi(threadId) {
  khoChoTheoThread.delete(String(threadId));
}

export function coChoPhanHoi(threadId) {
  return khoChoTheoThread.has(String(threadId));
}

export async function xuLyChoPhanHoi(message, api) {
  try {
    const threadId = message.threadId;
    const quote = message.quote || message.data?.quote;
    const rawContent = String(message.data?.content ?? message.body ?? "").trim();
    let stripped = rawContent;
    const mentions = Array.isArray(message?.data?.mentions) ? message.data.mentions : null;
    if (mentions && mentions.length > 0) {
      try {
        const sorted = [...mentions].filter(m => Number.isInteger(m?.pos) && Number.isInteger(m?.len)).sort((a,b) => b.pos - a.pos);
        for (const m of sorted) {
          const start = Math.max(0, m.pos);
          const end = Math.min(stripped.length, m.pos + m.len);
          if (start < end) {
            stripped = stripped.slice(0, start) + stripped.slice(end);
          }
        }
      } catch {}
    }
    const content = stripped
      .replace(/@[^\s\n\r\t]+/g, "")
      .replace(/^[\s,:;\-–—]+/, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    const uid = message.data?.uidFrom ?? message.senderId ?? message.data?.uid;

    const collectedQuoteIds = (() => {
      const ids = [];
      const push = (v) => { if (v !== undefined && v !== null && v !== "") ids.push(String(v)); };
      const d = message.data || {};
      const q = message.quote || d.quote || {};
      push(q.globalMsgId); push(q.msgId); push(q.cliMsgId); 
      push(q.messageId); push(q.clientMsgId);
      push(d.qMsgId); push(d.qCliMsgId);
      push(d.replyMsgId); push(d.replyCliMsgId);
      if (d.quote) { 
        push(d.quote.globalMsgId); push(d.quote.messageId); push(d.quote.clientMsgId); 
      }
      if (d.reply) { push(d.reply.msgId); push(d.reply.cliMsgId); }
      
      return Array.from(new Set(ids));
    })();
   
    for (const qid of collectedQuoteIds) {
      const entry = khoChoTheoMsg.get(qid);
      if (!entry) {
      continue;
      }
     
      if (daHetHan(entry)) {
        khoChoTheoMsg.delete(qid);
        continue;
      }
      if (entry.authorId && String(entry.authorId) !== String(uid || "")) {
       continue;
      }
      
      try {
        const handler = entry.onReply || entry.handler;
        if (typeof handler === "function") {
          const kq = await handler({ message, api, data: entry.data, entry, content, rawContent });
          if (!kq || kq?.clear !== false) {
            if (entry.msgId) khoChoTheoMsg.delete(String(entry.msgId));
            if (entry.cliMsgId) khoChoTheoMsg.delete(String(entry.cliMsgId));
            const cur = khoOnReplyTheoThread.get(String(threadId));
            if (cur && (cur.msgId === entry.msgId || cur.cliMsgId === entry.cliMsgId)) {
              khoOnReplyTheoThread.delete(String(threadId));
            }
          } else if (kq?.update) {
            const newEntry = { ...entry, ...kq.update, updatedAt: Date.now() };
            if (entry.msgId) khoChoTheoMsg.set(String(entry.msgId), newEntry);
            if (entry.cliMsgId) khoChoTheoMsg.set(String(entry.cliMsgId), newEntry);
            khoOnReplyTheoThread.set(String(threadId), newEntry);
          }
        return true;
        }
      } catch (e) {
        console.error("Error in quote handler:", e);
        return false;
      }
    }

    const lastEntry = khoOnReplyTheoThread.get(String(threadId));
    const hasReplyIndicator = !!(message.quote || message.data?.quote || message.data?.reply || message.data?.replyMsgId || message.data?.replyCliMsgId);
 
    if (lastEntry && lastEntry.allowThreadFallback === true && hasReplyIndicator && !daHetHan(lastEntry)) {
   
      let shouldAllowFallback = false;
      if (collectedQuoteIds.length > 0) {
        const lastEntryIds = [lastEntry.msgId, lastEntry.cliMsgId].filter(Boolean).map(String);
        shouldAllowFallback = collectedQuoteIds.some(q => lastEntryIds.includes(q));
       } else {
        shouldAllowFallback = true;
    
      }
      
      if (shouldAllowFallback && (!lastEntry.authorId || String(lastEntry.authorId) === String(uid || ""))) {
        try {
          const handler = lastEntry.onReply || lastEntry.handler;
          if (typeof handler === "function") {
          
            const kq = await handler({ message, api, data: lastEntry.data, entry: lastEntry, content, rawContent });
            if (!kq || kq?.clear !== false) {
              if (lastEntry.msgId) khoChoTheoMsg.delete(String(lastEntry.msgId));
              if (lastEntry.cliMsgId) khoChoTheoMsg.delete(String(lastEntry.cliMsgId));
              khoOnReplyTheoThread.delete(String(threadId));
            } else if (kq?.update) {
              const updated = { ...lastEntry, ...kq.update, updatedAt: Date.now() };
              if (lastEntry.msgId) khoChoTheoMsg.set(String(lastEntry.msgId), updated);
              if (lastEntry.cliMsgId) khoChoTheoMsg.set(String(lastEntry.cliMsgId), updated);
              khoOnReplyTheoThread.set(String(threadId), updated);
            }
           
            return true;
          }
        } catch (e) {
          console.error("Error in thread fallback:", e);
          return false;
        }
      } else {
         }
    }

   const pending = layChoPhanHoi(threadId);
    if (!pending) {
      return false;
    }

    if (daHetHan(pending)) { 
      xoaChoPhanHoi(threadId); 
      return false; 
    }

    const coQuote = collectedQuoteIds.length > 0;
    const coGiongChon = /(\b\d{1,3}\b)|(trang\s*\d{1,3})/i.test(content);

    if (pending.authorId && pending.authorId !== String(uid || "")) {
     return false;
    }

    if (typeof pending.handler !== "function") {
       xoaChoPhanHoi(threadId);
      return false;
    }

    let nenDispatch = false;

    if (!nenDispatch && typeof pending.matcher === "function") {
      try {
        nenDispatch = !!pending.matcher({ message, pending, content });
       } catch (e) {
        }
    }

    if (!nenDispatch && coQuote) {
      const pendingIds = [pending.listMsgId, pending.listCliMsgId].filter(Boolean).map(String);
      if (collectedQuoteIds.length && pendingIds.length) {
        nenDispatch = collectedQuoteIds.some(q => pendingIds.includes(q));
        } else if (collectedQuoteIds.length && pendingIds.length === 0) {
      
      }
    }

    if (!nenDispatch && !coQuote && pending.anyText === true) {
      nenDispatch = true;
     
    }

    if (!nenDispatch && !coQuote && coGiongChon) {
      nenDispatch = true;
      
    }

  
    if (!nenDispatch) {
   
      return false;
    }
 const ketQua = await pending.handler({ message, api, pending, content, rawContent });

    if (!ketQua) {
       xoaChoPhanHoi(threadId);
    } else if (ketQua.clear === true) {
       xoaChoPhanHoi(threadId);
    } else if (ketQua.update) {
      datChoPhanHoi(threadId, { ...pending, ...ketQua.update, updatedAt: Date.now() });
    }

    return true;
  } catch (err) {
  return false;
  }
}

export const setPendingReply = datChoPhanHoi;
export const getPendingReply = layChoPhanHoi;
export const clearPendingReply = xoaChoPhanHoi;
export const hasPendingReply = coChoPhanHoi;
export const dispatchPendingReply = xuLyChoPhanHoi;

export function dangKyReply({ msgId, cliMsgId, threadId, authorId, command, data, ttlMs, onReply, handler, allowThreadFallback }) {
  if (!msgId && !cliMsgId) return;
  const now = Date.now();
  const entry = {
    msgId: msgId ? String(msgId) : undefined,
    cliMsgId: cliMsgId ? String(cliMsgId) : undefined,
    // Tự động map để logic quote checking hoạt động
    listMsgId: msgId ? String(msgId) : undefined,
    listCliMsgId: cliMsgId ? String(cliMsgId) : undefined,
    threadId: String(threadId),
    authorId: authorId ? String(authorId) : undefined,
    command: command || undefined,
    data: data || undefined,
    onReply,
    handler,
    allowThreadFallback: allowThreadFallback !== false,
    createdAt: now,
    updatedAt: now,
    ttlMs: Number(ttlMs) > 0 ? Number(ttlMs) : MAC_DINH_TTL_MS
  };
  if (entry.msgId) khoChoTheoMsg.set(entry.msgId, entry);
  if (entry.cliMsgId) khoChoTheoMsg.set(entry.cliMsgId, entry);
  if (entry.threadId) khoOnReplyTheoThread.set(String(entry.threadId), entry);
  return entry;
}

export function huyReplyByMsgId(id) {
  if (!id) return false;
  const key = String(id);
  return khoChoTheoMsg.delete(key);
}

setInterval(() => {
  try {
    const now = Date.now();
    let removed = 0;
    for (const [threadId, pending] of khoChoTheoThread.entries()) {
      const created = Number(pending?.createdAt) || 0;
      const ttlMs = Number(pending?.ttlMs) || MAC_DINH_TTL_MS;
      if (created + ttlMs < now) {
        khoChoTheoThread.delete(threadId);
        removed++;
      }
    }

  } catch (e) {
  }
}, 60_000);