import axios from "axios";
import { load as loadHTML } from "cheerio";
import { ThreadType } from "zca-js";
import path from "path";
import fs from "fs";
import { downloadFile, convertToAac } from "../../Utils/GwenDev.js";

const pendingSearchByThread = new Map();

function toVNTimeString() {
  try {
    return new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  } catch {
    return new Date().toLocaleString("vi-VN");
  }
}

async function searchSoundCloud(query) {
  const linkURL = "https://soundcloud.com";
  const headers = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  };

  const res = await axios.get(`https://m.soundcloud.com/search?q=${encodeURIComponent(query)}`, { headers });
  const $ = loadHTML(res.data);

  const results = [];
  $("div > ul > li > div").each((index, element) => {
    if (index >= 5) return false;
    const title = $(element).find("a").attr("aria-label")?.trim() || "";
    const url = linkURL + (($(element).find("a").attr("href") || "").trim());
    const thumb = $(element).find("a > div > div > div > picture > img").attr("src")?.trim() || "";
    const artist = $(element).find("a > div > div > div").eq(1).text()?.trim() || "";
    const views = $(element).find("a > div > div > div > div > div").eq(0).text()?.trim() || "";
    const timestamp = $(element).find("a > div > div > div > div > div").eq(1).text()?.trim() || "";
    const release = $(element).find("a > div > div > div > div > div").eq(2).text()?.trim() || "";

    if (title && url) {
      results.push({ title, url, thumb, artist, views, timestamp, release });
    }
  });

  return results;
}

async function fetchAudioFromAutoDown(trackUrl) {
  const apiUrl = `https://api.zeidteam.xyz/media-downloader/atd2?url=${encodeURIComponent(trackUrl)}`;
  const res = await axios.get(apiUrl, { timeout: 20000 });
  const data = res.data || {};
  const audio = Array.isArray(data.medias) ? data.medias.find(m => m.type === "audio" && m.url) : null;
  if (!audio?.url) throw new Error("API autodown không trả về audio");
  return {
    audioUrl: audio.url,
    quality: audio.quality || audio.format || "",
    thumbnail: data.thumbnail || "",
    title: data.title || "",
    author: data.author || data.unique_id || ""
  };
}

export default {
  name: "scl",
  description: "Tìm và phát voice nhạc SoundCloud",
  role: 0,
  cooldown: 0,
  group: "music",
  aliases: ["audio"],
  noPrefix: true,

  async run({ message, api, args }) {
    const threadId = message.threadId;
    const threadType = message.type ?? ThreadType.User;
    const uid = message.data?.uidFrom;
    const content = String(message.data?.content || "").trim().toLowerCase();

    if (content.startsWith("audio")) {
      const num = parseInt(args?.[0] || "", 10);
      if (!num || Number.isNaN(num)) {
        return api.sendMessage("[💌]→ Vui lòng nhập: audio <số thứ tự>", threadId, threadType);
      }

      const pending = pendingSearchByThread.get(threadId);
      if (!pending || !Array.isArray(pending.items) || pending.items.length === 0) {
        return api.sendMessage("[💌]→ Không có danh sách chờ. Hãy tìm trước bằng .scl <từ khóa>.", threadId, threadType);
      }

      if (pending.authorId && pending.authorId !== uid) {
        return api.sendMessage("[💌]→ Danh sách này thuộc người khác vừa tìm. Hãy tự tìm bằng .scl <từ khóa>.", threadId, threadType);
      }

      if (num < 1 || num > pending.items.length) {
        return api.sendMessage("[💌]→ Lựa chọn không hợp lệ trong danh sách.", threadId, threadType);
      }

      const chosen = pending.items[num - 1];
      try {
        const sent = await api.sendMessage(
          `Đang xử lý voice: ${chosen.title}\n👤 ${chosen.artist || "Unknown"}`,
          threadId,
          threadType
        );

        const media = await fetchAudioFromAutoDown(chosen.url);
        const mp3Url = media.audioUrl;
        const quality = media.quality;

        const cacheDir = path.join("Data", "Cache");
        fs.mkdirSync(cacheDir, { recursive: true });
        const base = path.join(cacheDir, `scl_${Date.now()}`);
        const rawPath = base; 
        const aacPath = `${base}.aac`;

        await downloadFile(mp3Url, rawPath);
        await convertToAac(rawPath, aacPath);

        const uploaded = await api.uploadAttachment([aacPath], threadId, threadType);
        const voiceData = uploaded?.[0];
        if (!voiceData?.fileUrl || !voiceData?.fileName) {
          throw new Error("Upload voice thất bại");
        }
        const voiceUrl = `${voiceData.fileUrl}/${voiceData.fileName}`;

        await api.sendVoice({ voiceUrl, ttl: 900_000 }, threadId, threadType);

        const done = await api.sendMessage(
          `${chosen.title}\n🔊 Chất lượng: ${quality || "n/a"}\n⏰ ${toVNTimeString()}`,
          threadId,
          threadType
        );

        const listMsgId = pending.listMsgId;
        const listCliMsgId = pending.listCliMsgId ?? 0;
        if (listMsgId) {
          try { await api.undo({ msgId: listMsgId, cliMsgId: listCliMsgId }, threadId, threadType); } catch {}
        }
        if (sent?.msgId) {
          try { await api.undo({ msgId: sent.msgId, cliMsgId: message.data?.cliMsgId ?? 0 }, threadId, threadType); } catch {}
        }
        if (done?.msgId) {
          try { await api.undo({ msgId: done.msgId, cliMsgId: message.data?.cliMsgId ?? 0 }, threadId, threadType); } catch {}
        }

        pendingSearchByThread.delete(threadId);

        setTimeout(() => {
          try {
            if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
            if (fs.existsSync(aacPath)) fs.unlinkSync(aacPath);
          } catch {}
        }, 5000);
      } catch (err) {
        console.error("[SCL] Lỗi gửi voice:", err?.message || err);
        return;
      } finally {
        
        pendingSearchByThread.delete(threadId);
      }

      return;
    }

    const query = (args || []).join(" ").trim();
    if (!query) {
      return api.sendMessage("Phần tìm kiếm không được để trống!", threadId, threadType);
    }

    try {
      const items = await searchSoundCloud(query);
      if (!items || items.length === 0) {
        return api.sendMessage(`Không có kết quả cho "${query}"`, threadId, threadType);
      }

      const top = items.slice(0, 5);
      pendingSearchByThread.set(threadId, {
        items: top,
        authorId: uid,
        expireAt: Date.now() + 5 * 60 * 1000,
      });

      setTimeout(() => {
        const cur = pendingSearchByThread.get(threadId);
        if (cur && cur.expireAt && cur.expireAt <= Date.now()) {
          pendingSearchByThread.delete(threadId);
        }
      }, 5 * 60 * 1000 + 1000);

      const lines = top.map((it, i) => `\n${i + 1}. 👤 ${it.artist || "Unknown"}\n📜 ${it.title}\n⏳ ${it.timestamp || "?"}`);
      const listMessage = `【🔎】Kết quả: ${query}${lines.join("\n")}\n\n👉 Gõ: audio <số> để gửi voice (vd: audio 1)`;

      const res = await api.sendMessage(listMessage, threadId, threadType);
      const listMsgId = res?.message?.msgId ?? res?.msgId ?? null;
      const listCliMsgId = res?.message?.cliMsgId ?? res?.cliMsgId ?? 0;
      const saved = pendingSearchByThread.get(threadId) || {};
      saved.items = top;
      saved.authorId = uid;
      saved.expireAt = Date.now() + 5 * 60 * 1000;
      saved.listMsgId = listMsgId;
      saved.listCliMsgId = listCliMsgId;
      saved.used = false;
      saved.busy = false;
      pendingSearchByThread.set(threadId, saved);
      return res;
    } catch (err) {
      console.error("[SCL] Lỗi tìm kiếm:", err?.message || err);
      return;
    }
  },
};


