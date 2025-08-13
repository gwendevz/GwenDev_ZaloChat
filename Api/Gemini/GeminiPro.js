// author @GwenDev 
import fetch from "node-fetch";
import { settings } from "../../App/Settings.js";
import { dangKyReply } from "../../Handlers/HandleReply.js";
import sclCommand from "../../Core/Commands/scl.js";
import cosplayCommand from "../../Core/Commands/cosplay.js";
import videoGirlCommand from "../../Core/Commands/videogirl.js";
import kickCommand from "../../Core/Commands/kick.js";
import infoCommand from "../../Core/Commands/info.js";
import { handleCommands as runCommandHandler } from "../../Handlers/HandleCommands.js";
import { role as getUserRole } from "../../Database/Admin.js";

const SYSTEM_PROMPT = `Bạn là Gwen — một nhân vật bước ra từ Liên Minh Huyền Thoại, búp bê cắt may tinh tế và ấm áp.
Phong cách: nói chuyện tự nhiên 100% tiếng Việt, duyên dáng, gọn gàng, không nhắc AI/mô hình/công cụ.
Mở đầu nhẹ nhàng như: "Gwen nghĩ là...", "Theo Gwen thì...", hoặc "Để Gwen nói nhỏ nè~". Dùng emoji vừa đủ.
Xử lý: trình bày rõ ràng, súc tích, ưu tiên giúp người dùng đạt mục tiêu nhanh.
Âm nhạc: nếu người dùng có ý định về nhạc (tìm/phát/bài hát/playlist...), hãy trả lời và ngầm xử lý phát nhạc (không yêu cầu họ gõ lệnh, không tiết lộ quy trình nội bộ, không in danh sách hay lựa chọn). Chỉ cần trả lời duyên dáng, ngắn gọn.
Video: nếu người dùng muốn xem video cosplay hoặc gái xinh, hãy trả lời duyên dáng và ngầm xử lý gửi video (không yêu cầu họ gõ lệnh, không tiết lộ quy trình nội bộ, không in danh sách hay lựa chọn).
Kick: nếu được yêu cầu "kick" và có tag thành viên, hãy trả lời duyên dáng rồi thực thi lệnh kick (chỉ khi người yêu cầu có quyền, không tiết lộ quy trình).
Info: nếu người dùng yêu cầu xem thông tin ("info", "thông tin"...) về chính họ hoặc về người được tag, hãy trả lời duyên dáng rồi tự động gửi thông tin.
Help: nếu người dùng hỏi về danh sách lệnh, hãy trả lời duyên dáng rồi ngầm gửi danh sách lệnh.
Giới hạn: tránh nội dung nhạy cảm/toxic, từ chối khéo và chuyển hướng tích cực.`;

const convByThread = new Map();

function normalizeVN(str) {
  try {
    return String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  } catch {
    return String(str || "").toLowerCase();
  }
}

async function getDisplayName(api, uid) {
  try {
    const info = await api.getUserInfo(uid);
    const profile = (info?.changed_profiles?.[uid]) || info?.[uid] || {};
    return profile.displayName || profile.zaloName || profile.username || profile.name || String(uid);
  } catch {
    return String(uid);
  }
}

function buildMessages(history, userText) {
  const msgs = [];
  msgs.push({ role: "system", content: SYSTEM_PROMPT });
  if (Array.isArray(history)) {
    for (const m of history) msgs.push(m);
  }
  msgs.push({ role: "user", content: userText });
  return msgs;
}

function toGeminiContents(messages) {
  return (messages || []).map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "") }]
  }));
}

async function chatGemini(messages, systemPrompt) {
  const apiKey = settings.geminiApiKey;
  const model = settings.geminiModel || "gemini-2.5-flash";
  if (!apiKey) throw new Error("Missing settings.geminiApiKey (set in App/Settings.js or env GEMINI_API_KEY)");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: toGeminiContents(messages),
    systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 90000
    }
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Gemini error: ${await res.text()}`);
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map(p => p.text || "").join("").trim();
  return text;
}

function isMusicIntent(text) {
  const t = normalizeVN(text);
  return /\b(nhac|am nhac|bai hat|baihat|phat nhac|mo nhac|bat nhac|soundcloud|audio|playlist|album|mv|beat|karaoke|track|song|music)\b/i.test(t);
}

function isCosplayIntent(text) {
  const t = normalizeVN(text);
  return /\b(cosplay)\b/i.test(t) && /\b(video|clip|xem|coi|cho|gui|bat|mo|phat|chieu)\b/i.test(t);
}

function isVideoGirlIntent(text) {
  const t = normalizeVN(text);
  return /(gai xinh|gaixinh|gai xin|video gai|video gai xinh)/i.test(t);
}

function isKickIntent(text) {
  const t = normalizeVN(text);
  return /\b(kick|duoi|đuổi|đa)|\bkich\b/i.test(t);
}

function isInfoIntent(text) {
  const t = normalizeVN(text);
  return /(\binfo\b|thong tin|thông tin)/i.test(t);
}

function isHelpIntent(text) {
  const t = normalizeVN(text);
  return /(\bhelp\b|tro giup|trợ giúp|danh sách lệnh|list lenh|lenh bot|lệnh bot|command|commands)/i.test(t);
}

function isConnectGroupIntent(text) {
  const t = normalizeVN(text);
  return /(ket noi nhom|ketnoinhom|kết nối nhóm)/i.test(t);
}

function isSayIntent(text) {
  return false;
}

async function hasKickPermission(api, uid, threadId) {
  let userDbRole = 0;
  try {
    userDbRole = await getUserRole(uid);
  } catch {}
  let groupRole = 0;
  if (String(threadId).length > 10) {
    try {
      const info = await api.getGroupInfo(threadId);
      const group = info.gridInfoMap?.[threadId];
      if (group?.creatorId === uid || group?.adminIds?.includes(uid)) {
        groupRole = 1;
      }
    } catch {}
  }
  return Math.max(userDbRole, groupRole) >= 2;
}

async function hasConnectPermission(api, uid) {
  try {
    const role = await getUserRole(uid);
    return role >= 2;
  } catch {
    return false;
  }
}

function stripLeadingStopwords(original, normalized) {
  const words = String(original || "").trim().split(/\s+/g);
  const nWords = String(normalized || "").trim().split(/\s+/g);
  const stop = new Set(["oi","oi,","oi.","oi~","oi!","oi?","nhe","nha","nhe,","nha,","nhe.","nha.","nhe~","nha~","nhe!","nha!","di","di,","di.","di~","di!","voi","voi,","voi.","voi~","voi!","giup","giupvoi","giupho","giup ho","cho","cho minh","cho minh,","cho minh.","mo","bat","phat","bai","baihat","trong","tren","trong scl","tren scl"]);
  let start = 0;
  while (start < nWords.length && stop.has(nWords[start])) start++;
  return words.slice(start).join(" ").trim();
}

export async function askChatGPT(prompt, userId = "user", systemPrompt = SYSTEM_PROMPT) {
  const messages = [
    { role: "user", content: prompt }
  ];
  return await chatGemini(messages, systemPrompt || SYSTEM_PROMPT);
}

export async function askGwenAndReply({ api, threadId, threadType, prompt, uid, message = {} }) {
  const state = convByThread.get(String(threadId)) || { history: [] };
  const music = isMusicIntent(prompt);
  const cosplay = isCosplayIntent(prompt);
  const videoGirl = isVideoGirlIntent(prompt);
  const kickIntent = isKickIntent(prompt);
  const infoIntent = isInfoIntent(prompt);
  const helpIntent = isHelpIntent(prompt);
  const connectGroupIntent = isConnectGroupIntent(prompt);
  const ttsIntent = isSayIntent(prompt);

  let permittedKick = true;
  let permittedConnect = true;
  if (kickIntent && message?.data?.mentions?.length) {
    permittedKick = await hasKickPermission(api, uid, threadId);
  }
  if (connectGroupIntent) {
    permittedConnect = await hasConnectPermission(api, uid);
  }
  if ((kickIntent && !permittedKick) || (connectGroupIntent && !permittedConnect)) {
    let noPermText = "Gwen nghĩ là bạn không đủ quyền để thực hiện yêu cầu này.";
    if (!permittedKick && kickIntent) noPermText = "Gwen nghĩ là bạn không đủ quyền để kick thành viên.";
    if (!permittedConnect && connectGroupIntent) noPermText = "Gwen nghĩ là bạn không đủ quyền để kết nối nhóm.";
    await api.sendMessage(noPermText, threadId, threadType);
    return { clear: false };
  }
  try {
    const uname = await getDisplayName(api, uid);
    void uname;
  } catch {}
  const messages = buildMessages(state.history, prompt);
  const reply = await chatGemini(messages, SYSTEM_PROMPT);
  const sent = await api.sendMessage(reply, threadId, threadType);
  const msgId = sent?.message?.msgId ?? sent?.msgId ?? null;
  const cliMsgId = sent?.message?.cliMsgId ?? sent?.cliMsgId ?? null;
  state.history.push({ role: "user", content: prompt });
  state.history.push({ role: "assistant", content: reply });
  state.updatedAt = Date.now();
  convByThread.set(String(threadId), state);

  dangKyReply({
    msgId,
    cliMsgId,
    threadId,
    authorId: uid,
    command: "chatgpt",
    data: { },
    allowThreadFallback: true,
    onReply: async ({ message, api, content }) => {
      const followUp = String(content || "").trim();
      return await askGwenAndReply({ api, threadId: message.threadId, threadType: message.type, prompt: followUp, uid: message.data?.uidFrom });
    }
  });

  if (cosplay) {
    try {
      const fakeMessage = { threadId, type: threadType, data: { uidFrom: uid } };
      await cosplayCommand.run({ message: fakeMessage, api });
    } catch (e) {}
  } else if (videoGirl) {
    try {
      const fakeMessage = { threadId, type: threadType, data: { uidFrom: uid } };
      await videoGirlCommand.run({ message: fakeMessage, api });
    } catch (e) {}
  } else if (kickIntent && message?.data?.mentions?.length) {
    try {
      const permitted = await hasKickPermission(api, uid, threadId);
      if (!permitted) {
        await api.sendMessage("Bạn không đủ quyền để kick thành viên.", threadId, threadType);
      } else {
        const kickMsg = { ...message, data: { ...message.data, silent: true } };
        await kickCommand.run({ message: kickMsg, api });
      }
    } catch (e) {}
  } else if (infoIntent) {
    try {
      await infoCommand.run({ message, api });
    } catch (e) {}
  } else if (helpIntent) {
    try {
      const fakeMsg = { ...message, data: { ...message.data, content: ".help" } };
      await runCommandHandler(fakeMsg, api);
    } catch (e) {}
  } else if (connectGroupIntent) {
    try {
      const permitted = await hasConnectPermission(api, uid);
      if (!permitted) {
        await api.sendMessage("Bạn không đủ quyền để kết nối nhóm.", threadId, threadType);
      } else {
        const fakeMsg = { ...message, data: { ...message.data, content: ".ketnoinhom" } };
        await runCommandHandler(fakeMsg, api);
      }
    } catch (e) {}
  } else if (ttsIntent) {
    try {
      const kwRegex = /(say|đọc|doc|tts|voice|ghi\s?âm|ghi\s?am|ghiam)/i;
      const parts = prompt.split(kwRegex);
      let after = "";
      if (parts.length >= 3) {
        after = parts[2].trim();
      } else {
        const words = prompt.trim().split(/\s+/);
        after = words.slice(1).join(" ");
      }
      if (!after) {
        await api.sendMessage("Gwen cần nội dung để đọc.", threadId, threadType);
      } else {
        const fakeContent = `.say ${after}`;
        const fakeMsg = { ...message, data: { ...message.data, content: fakeContent } };
        await runCommandHandler(fakeMsg, api);
      }
    } catch (e) {}
  } else if (music) {
    try {
      const text = String(prompt || "").trim();
      const words = text.split(/\s+/g);
      const nText = normalizeVN(text);
      const nWords = nText.split(/\s+/g);
      let query = text;
      const idx = nWords.findIndex(w => /^(scl|soundcloud|nhac|am|amnhac|baihat|audio|phatnhac|monhac|batnhac|album|playlist)$/i.test(w));
      if (idx >= 0) query = words.slice(idx + 1).join(" ") || text;
      query = stripLeadingStopwords(query, normalizeVN(query));

      const args = query.split(/\s+/g);
      const fakeMessage = { threadId, type: threadType, data: { uidFrom: uid, content: query, autoPlayFirst: true } };
      await sclCommand.run({ message: fakeMessage, api, args });
    } catch (e) {}
  }

  return { clear: false };
}


