// author @GwenDev
import axios from "axios";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import { ThreadType } from "zca-js";
import { dangKyReply } from "../../Handlers/HandleReply.js";
import { downloadFile, convertToAac, createSoundCloudResultsCanvas, muxImageAndAudioToVideo } from "../../Utils/GwenDev.js";
import { settings } from "../../App/Settings.js";

const CACHE_DIR = path.resolve("Data", "Cache", "ZMP3");

const ZMP3 = (settings.apis && settings.apis.zmp3) || {};
const { apiKey: API_KEY, secretKey: SECRET_KEY, version: VERSION, baseUrl: BASE_URL } = ZMP3;

const PARAM_KEYS = ["ctime", "id", "type", "page", "count", "version"]; // filter keys

function pad2(n) { return String(n).padStart(2, "0"); }
function formatDurationSec(sec) {
  const s = Number(sec || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${pad2(r)}`;
}

async function ensureCacheDir() {
  await fsp.mkdir(CACHE_DIR, { recursive: true }).catch(() => {});
}

function sha256Hex(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function hmac512Hex(str, key) {
  return crypto.createHmac("sha512", key).update(Buffer.from(str, "utf8")).digest("hex");
}

function sortParams(params) {
  return Object.fromEntries(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));
}

function encodeParams(params, sep = "") {
  return Object.keys(params)
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join(sep);
}

function paramsString(params) {
  const sorted = sortParams(params);
  const filtered = {};
  for (const key in sorted) {
    if (PARAM_KEYS.includes(key) && sorted[key] !== null && sorted[key] !== "") {
      filtered[key] = sorted[key];
    }
  }
  return encodeParams(filtered);
}

function buildSig(apiPath, params) {
  const s = paramsString(params);
  return hmac512Hex(apiPath + sha256Hex(s), SECRET_KEY);
}

async function getCookie() {
  const res = await axios.get(BASE_URL, { timeout: 10000 });
  const cookies = res.headers?.["set-cookie"] || [];
  return Array.isArray(cookies) && cookies.length ? cookies.map(c => c.split(";" )[0]).join("; ") : "";
}

async function zingRequest(apiPath, params) {
  const cookie = await getCookie();
  const url = BASE_URL + apiPath;
  const res = await axios.get(url, {
    headers: { Cookie: cookie },
    params: { ...params, sig: buildSig(apiPath, params) },
    timeout: 15000,
  });
  return res.data;
}

async function searchMusic(keyword, count = 8) {
  const ctime = Math.floor(Date.now() / 1000).toString();
  const apiPath = "/api/v2/search";
  const params = { q: keyword, type: "song", count, ctime, version: VERSION, apiKey: API_KEY };
  return await zingRequest(apiPath, params);
}

async function getStreamingSong(songId) {
  const ctime = Math.floor(Date.now() / 1000).toString();
  const apiPath = "/api/v2/song/get/streaming";
  const params = { id: songId, ctime, version: VERSION, apiKey: API_KEY };
  return await zingRequest(apiPath, params);
}

async function downloadSongToFile(streaming, titleSafe) {
  await ensureCacheDir();
  const link = streaming?.data?.["128"] || streaming?.data?.["320"];
  if (!link) throw new Error("Không có link tải cho bài hát này.");
  const base = path.join(CACHE_DIR, `zmp3_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const mp3Path = `${base}.mp3`;
  await downloadFile(link, mp3Path);
  return mp3Path;
}

async function sendAsVoiceOrFallback(api, threadId, threadType, mp3Path, coverUrl) {
  try {
    const aacPath = mp3Path.replace(/\.mp3$/i, ".aac");
    await convertToAac(mp3Path, aacPath);
    const uploaded = await api.uploadAttachment([aacPath], threadId, threadType);
    const voiceData = uploaded?.[0];
    if (voiceData?.fileUrl && voiceData?.fileName) {
      const voiceUrl = `${voiceData.fileUrl}/${voiceData.fileName}`;
      await api.sendVoice({ voiceUrl, ttl: 12*60*60_000 }, threadId, threadType);
      setTimeout(async () => { try { await fsp.unlink(aacPath); } catch {} }, 30_000);
      return true;
    }
  } catch {}
  try {
    await api.sendMessage({ msg: "🎧 Đính kèm MP3", attachments: [mp3Path], ttl: 5*60_000 }, threadId, threadType);
  } catch {}
  try {
    if (coverUrl) {
      const base = mp3Path.replace(/\.mp3$/i, "");
      const img = coverUrl ? await (async () => {
        try { return await (await axios.get(coverUrl, { responseType: "arraybuffer", timeout: 15000 })).data; } catch { return null; }
      })() : null;
      let imgPath = null;
      if (img) {
        imgPath = `${base}.jpg`;
        try { await fsp.writeFile(imgPath, img); } catch {}
      }
      const videoPath = `${base}.mp4`;
      await muxImageAndAudioToVideo(imgPath || null, mp3Path, videoPath);
      await api.sendMessage({ msg: "🎬 Video preview (audio+cover)", attachments: [videoPath], ttl: 5*60_000 }, threadId, threadType);
      setTimeout(async () => { try { if (imgPath) await fsp.unlink(imgPath); await fsp.unlink(videoPath); } catch {} }, 30_000);
    }
  } catch {}
  return false;
}

function extractIds(d) {
  const out = { msgId: null, cliMsgId: 0 };
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) return o.forEach(walk);
    if (!out.msgId && o.msgId) out.msgId = o.msgId;
    if (!out.cliMsgId && typeof o.cliMsgId !== "undefined") out.cliMsgId = o.cliMsgId;
    Object.values(o).forEach(walk);
  };
  walk(d);
  return out;
}

export default {
  name: "zingmp3",
  description: "Tìm kiếm và phát/tải nhạc từ ZingMP3 (canvas search)",
  role: 0,
  cooldown: 5,
  group: "music",
  aliases: ["zmp3"],
  noPrefix: false,

  async run({ message, api, args }) {
    const threadId = message.threadId;
    const threadType = message.type ?? ThreadType.User;
    const query = (args || []).join(" ").trim();
    if (!query) {
      return api.sendMessage({ msg: "⚠️ Vui lòng nhập từ khóa tìm kiếm", ttl: 60_000 }, threadId, threadType);
    }

    try {
      const res = await searchMusic(query, 8);
      const items = res?.data?.items || [];
      if (!items.length) {
        return api.sendMessage({ msg: `❗Không tìm thấy kết quả cho "${query}"`, ttl: 60_000 }, threadId, threadType);
      }

      const top = items.slice(0, 8);
      let canvas = null;
      try {
        const list = top.map((it) => ({
          title: `${it.title} — ${it.artistsNames}`,
          artist: it.album?.title || "",
          thumb: it.thumbnail || it.thumbnailM || "",
          timestamp: formatDurationSec(it.duration || 0),
        }));
        canvas = await createSoundCloudResultsCanvas(list, `ZingMP3: ${query}`);
      } catch {}

      const lines = top.map((it, i) => `\n${i + 1}. 🎵 ${it.title}\n👤 ${it.artistsNames}\n⏳ ${formatDurationSec(it.duration || 0)}`).join("\n─────────────────");
      const sent = await api.sendMessage({
        msg: `•- [ Kết quả tìm kiếm ZingMP3 ] -•\n${lines}\n\n👉 Reply số để phát/tải`,
        attachments: canvas ? [canvas] : [],
        ttl: 10*60_000,
      }, threadId, threadType);

      const { msgId, cliMsgId } = extractIds(sent);
      dangKyReply({
        msgId,
        cliMsgId,
        threadId,
        command: "zingmp3",
        data: { mode: "list", items: top, query },
        onReply: async ({ message: rep, api, content, data }) => {
          const tId = rep.threadId; const tType = rep.type ?? ThreadType.User;
          const text = String(content || "").trim();
          const idx = parseInt(text, 10) - 1;
          if (Number.isNaN(idx) || idx < 0 || idx >= data.items.length) {
            await api.sendMessage({ msg: "Số thứ tự không hợp lệ.", ttl: 60_000 }, tId, tType);
            return { clear: false };
          }
          const pick = data.items[idx];
          try {
            const streaming = await getStreamingSong(pick.encodeId);
            const mp3Path = await downloadSongToFile(streaming, pick.title);
            await api.sendMessage({ msg: `🎵 ${pick.title} — ${pick.artistsNames}`, ttl: 60_000 }, tId, tType);
            const sentVoice = await sendAsVoiceOrFallback(api, tId, tType, mp3Path, pick.thumbnail || pick.thumbnailM);
            setTimeout(async () => { try { await fsp.unlink(mp3Path); } catch {} }, 30_000);
          } catch (e) {
            await api.sendMessage({ msg: `❌ Lỗi tải: ${e?.message || e}` }, tId, tType);
          }
          return { clear: true };
        },
      });

      setTimeout(async () => { try { if (canvas) await fsp.unlink(canvas); } catch {} }, 60_000);
    } catch (err) {
      return api.sendMessage({ msg: `Đã xảy ra lỗi: ${err?.message || err}`, ttl: 60_000 }, threadId, threadType);
    }
  },
};


