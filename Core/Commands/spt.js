// author @GwenDev
import axios from "axios";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { dangKyReply } from "../../Handlers/HandleReply.js";
import { ThreadType } from "zca-js";
import { convertToAac, downloadFile, muxImageAndAudioToVideo, createSoundCloudResultsCanvas } from "../../Utils/GwenDev.js";
import { settings } from "../../App/Settings.js";
const logger = () => {};

let youtubeSr = null;

const CACHE_DIR = path.resolve("Data", "Cache", "SPT");

const { endpoints: API_ENDPOINTS = {}, keys: API_KEYS = {} } = settings.apis?.spt || {};

function formatDuration(ms) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function vnNowString() {
  const pad = (n) => String(n).padStart(2, "0");
  const local = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const dd = pad(local.getDate());
  const mm = pad(local.getMonth() + 1);
  const yyyy = local.getFullYear();
  const hh = pad(local.getHours());
  const mi = pad(local.getMinutes());
  const ss = pad(local.getSeconds());
  return `${dd}/${mm}/${yyyy} || ${hh}:${mi}:${ss}`;
}

function calculateSimilarity(str1 = "", str2 = "") {
  const normalize = (str) => String(str)
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const s1 = normalize(str1);
  const s2 = normalize(str2);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const words1 = s1.split(" ");
  const words2 = s2.split(" ");
  let commonWords = 0;
  for (const w of words1) if (w.length > 2 && words2.includes(w)) commonWords++;
  return commonWords / Math.max(words1.length, words2.length);
}

async function getSpotifyToken() {
  const body = "grant_type=client_credentials";
  const headers = {
    Authorization: "Basic " + Buffer.from(`${API_KEYS.spotify.clientId}:${API_KEYS.spotify.clientSecret}`).toString("base64"),
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const res = await axios.post(API_ENDPOINTS.spotify.token, body, { headers, timeout: 15000 });
  return res.data?.access_token;
}

async function searchSpotify(query, filters, limit = 8) {
  try {
    const token = await getSpotifyToken();
    let searchQuery = query || "";
    if (filters?.artist) searchQuery += ` artist:${filters.artist}`;
    if (filters?.album) searchQuery += ` album:${filters.album}`;
    if (filters?.genre) searchQuery += ` genre:${filters.genre}`;
    if (filters?.year) searchQuery += ` year:${filters.year}`;

    const res = await axios.get(API_ENDPOINTS.spotify.search, {
      headers: { Authorization: `Bearer ${token}` },
      params: { q: searchQuery, type: "track,artist,album", limit, market: "VN" },
      timeout: 20000,
    });
    return res.data;
  } catch (e) {
    return null;
  }
}

function parseSearchQuery(queryRaw = "") {
  let query = queryRaw;
  const filters = { artist: null, album: null, genre: null, year: null, lyrics: false, download: false, general: query };
  const patterns = {
    artist: /-artist\s+([^-]+)/i,
    album: /-album\s+([^-]+)/i,
    genre: /-genre\s+([^-]+)/i,
    year: /-year\s+(\d{4})/i,
    lyrics: /-lyrics/i,
    download: /-download/i,
  };
  for (const key of Object.keys(patterns)) {
    const m = query.match(patterns[key]);
    if (m) {
      if (key === "lyrics" || key === "download") filters[key] = true; else filters[key] = m[1].trim();
      query = query.replace(m[0], "").trim();
    }
  }
  filters.general = query || filters.artist || filters.album || "";
  return filters;
}

async function ensureYoutubeSrLoaded() {
  if (youtubeSr) return youtubeSr;
  try {
    youtubeSr = await import("youtube-sr");
  } catch {}
  return youtubeSr;
}

async function ytSearchRaw(query, { limit = 10 } = {}) {
  await ensureYoutubeSrLoaded();
  if (!youtubeSr) throw new Error("youtube-sr not available");
  if (typeof youtubeSr.default?.search === "function") {
    return await youtubeSr.default.search(query, { limit, safeSearch: false });
  }
  if (typeof youtubeSr.YouTube?.search === "function") {
    return await youtubeSr.YouTube.search(query, { limit, safeSearch: false });
  }
  if (typeof youtubeSr.search === "function") {
    return await youtubeSr.search(query, { limit, safeSearch: false });
  }
  if (typeof youtubeSr.default === "function") {
    return await youtubeSr.default(query, { limit, safeSearch: false });
  }
  throw new Error("Unsupported youtube-sr version");
}

function parseYouTubeDurationToMs(d) {
  if (!d) return 0;
  const parts = String(d).split(":").map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
  if (parts.length === 3) return ((parts[0] * 3600) + (parts[1] * 60) + parts[2]) * 1000;
  if (parts.length === 2) return ((parts[0] * 60) + parts[1]) * 1000;
  if (parts.length === 1) return parts[0] * 1000;
  return 0;
}

async function searchYouTubeForSpecificTrack(trackInfo) {
  const queries = [
    `"${trackInfo.artist}" "${trackInfo.title}" official audio`,
    `"${trackInfo.artist}" "${trackInfo.title}" official`,
    `${trackInfo.artist} ${trackInfo.title} official audio`,
    `${trackInfo.artist} ${trackInfo.title} audio`,
    `${trackInfo.artist} ${trackInfo.title} topic`,
    `"${trackInfo.artist}" "${trackInfo.title}"`,
    `${trackInfo.artist} ${trackInfo.title}`,
  ];
  let allResults = [];
  for (const q of queries) {
    try {
      const res = await ytSearchRaw(q, { limit: 8 });
      const items = Array.isArray(res?.items) ? res.items : res;
      const videos = (items || []).filter((it) => {
        const type = it.type || it?.constructor?.name || "video";
        return type === "video" && it?.id && it?.url && it?.duration !== "LIVE" && !it?.isUpcoming;
      });
      allResults = allResults.concat(videos);
      if (allResults.length >= 15) break;
    } catch {}
  }
  const unique = [];
  const seen = new Set();
  for (const v of allResults) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    const titleSim = calculateSimilarity(v.title, `${trackInfo.artist} ${trackInfo.title}`);
    const authorName = v.author?.name || v.channel?.name || "";
    const authorSim = Math.max(
      calculateSimilarity(authorName, trackInfo.artist),
      calculateSimilarity(authorName, (trackInfo.allArtists || trackInfo.artist || ""))
    );
    const tLower = String(v.title || "").toLowerCase();
    const titleLower = String(trackInfo.title || "").toLowerCase();
    const artistLower = String(trackInfo.artist || "").toLowerCase();
    let bonus = 0;
    if (tLower.includes(titleLower)) bonus += 0.4;
    if (tLower.includes(artistLower)) bonus += 0.3;
    if (tLower.includes("official")) bonus += 0.3;
    if (tLower.includes("audio")) bonus += 0.2;
    if (tLower.includes("lyrics")) bonus += 0.1;
    if (tLower.includes("music video")) bonus += 0.1;
    const badWords = [
      "cover", "remix", "nightcore", "sped up", "slowed", "8d", "8d audio",
      "karaoke", "instrumental", "live", "concert", "extended", "loop",
    ];
    let isBad = false;
    for (const bw of badWords) {
      if (tLower.includes(bw)) { isBad = true; break; }
    }
    if (isBad) bonus -= 1.0;

    const aLower = authorName.toLowerCase();
    if (aLower.endsWith(" - topic") || aLower.includes("vevo") || aLower.includes("official")) bonus += 0.4;

    const ytMs = parseYouTubeDurationToMs(v.duration);
    const spMs = Number(trackInfo.duration || 0);
    let durationScore = 0;
    if (spMs > 0 && ytMs > 0) {
      const diff = Math.abs(ytMs - spMs);
      const tolerance = spMs < 5 * 60 * 1000 ? 15 * 1000 : 30 * 1000; 
      const rel = Math.min(1, Math.max(0, 1 - diff / (tolerance * 2)));
      durationScore = rel;
    }
    unique.push({
      id: v.id,
      title: v.title,
      url: v.url,
      duration: v.duration,
      thumbnail: v.bestThumbnail?.url || v.thumbnails?.[0]?.url,
      author: authorName || "Unknown",
      similarity: (titleSim * 0.4) + (authorSim * 0.25) + (durationScore * 0.25) + bonus,
      scores: { titleSim, authorSim, durationMs: ytMs, durationScore, bonus },
    });
  }
  let filtered = unique;
  if (Number(trackInfo.duration || 0) > 0) {
    filtered = unique.filter(v => {
      if (!v.scores) return true;
      const spMs = Number(trackInfo.duration || 0);
      const d = Math.abs((v.scores.durationMs || 0) - spMs);
      const tol = spMs < 5 * 60 * 1000 ? 20 * 1000 : 40 * 1000; // a bit stricter than rank
      return d <= tol && (v.scores.titleSim > 0.2 || v.scores.authorSim > 0.2);
    });
    if (filtered.length === 0) filtered = unique;
  }
  filtered.sort((a, b) => b.similarity - a.similarity);
  return filtered.slice(0, 5);
}

async function searchYouTubeAlternative(query) {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const res = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 15000 });
    const matches = String(res.data).match(/\/watch\?v=([a-zA-Z0-9_-]{11})/g);
    if (!matches) return [];
    const ids = [...new Set(matches.map((m) => m.replace("/watch?v=", "")))].slice(0, 5);
    return ids.map((id) => ({ id, title: query, url: `https://www.youtube.com/watch?v=${id}`, author: "Unknown" }));
  } catch {
    return [];
  }
}

async function getLastFmInfo(artist, track) {
  try {
    const res = await axios.get(API_ENDPOINTS.lastfm, { params: { method: "track.getInfo", api_key: API_KEYS.lastfm, artist, track, format: "json" }, timeout: 15000 });
    return res.data?.track || null;
  } catch {
    return null;
  }
}

async function getTrackLyrics(artist, title) {
  const apis = [
    `${API_ENDPOINTS.lyrics}/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
    `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`,
    `https://api.textyl.co/api/lyrics?q=${encodeURIComponent(`${artist} ${title}`)}`,
  ];
  for (const api of apis) {
    try {
      const res = await axios.get(api, { timeout: 15000 });
      const data = res.data || {};
      const lyrics = data.lyrics || data.plainLyrics || data.syncedLyrics;
      if (lyrics) {
        const source = api.includes("lyrics.ovh") ? "Lyrics.ovh" : api.includes("lrclib") ? "LRCLIB" : "Textyl";
        return { lyrics, source };
      }
    } catch {}
  }
  return null;
}

async function getArtistInfo(artistName) {
  try {
    const res = await axios.get(API_ENDPOINTS.lastfm, { params: { method: "artist.getInfo", api_key: API_KEYS.lastfm, artist: artistName, format: "json" }, timeout: 15000 });
    return res.data?.artist || null;
  } catch {
    return null;
  }
}

async function getTopTracks(artistName) {
  try {
    const res = await axios.get(API_ENDPOINTS.lastfm, { params: { method: "artist.getTopTracks", api_key: API_KEYS.lastfm, artist: artistName, limit: 5, format: "json" }, timeout: 15000 });
    return res.data?.toptracks?.track || [];
  } catch {
    return [];
  }
}

async function getSimilarArtists(artistName) {
  try {
    const res = await axios.get(API_ENDPOINTS.lastfm, { params: { method: "artist.getSimilar", api_key: API_KEYS.lastfm, artist: artistName, limit: 5, format: "json" }, timeout: 15000 });
    return res.data?.similarartists?.artist || [];
  } catch {
    return [];
  }
}

async function getTrackTags(artist, track) {
  try {
    const res = await axios.get(API_ENDPOINTS.lastfm, { params: { method: "track.getTags", api_key: API_KEYS.lastfm, artist, track, format: "json" }, timeout: 15000 });
    return res.data?.tags?.tag || [];
  } catch {
    return [];
  }
}

async function ensureCacheDir() {
  await fsp.mkdir(CACHE_DIR, { recursive: true }).catch(() => {});
}

async function downloadTempFileFromUrl(url, prefix = "spt", ext = ".jpg") {
  try {
    await ensureCacheDir();
    const file = path.join(CACHE_DIR, `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    const res = await axios.get(url, { responseType: "stream", timeout: 20000 });
    await new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(file);
      res.data.pipe(ws);
      ws.on("finish", resolve);
      ws.on("error", reject);
    });
    return file;
  } catch {
    return null;
  }
}

async function enhanceTrackData(track) {
  const enhanced = { ...track };
  try {
    const info = await getLastFmInfo(track.artist, track.title);
    if (info) {
      enhanced.playcount = info.playcount;
      enhanced.listeners = info.listeners;
      enhanced.summary = (info.wiki?.summary || "").replace(/<[^>]*>/g, "").slice(0, 200);
    }
    const tags = await getTrackTags(track.artist, track.title);
    if (tags?.length) enhanced.genres = tags.map((t) => t.name).slice(0, 3);
  } catch {}
  return enhanced;
}

async function verifyAudioStream(stream, source) {
  if (!stream || typeof stream.pipe !== "function") throw new Error(`Stream từ ${source} không hợp lệ`);
  return stream;
}

async function downloadFromSpotifyAPI(trackId, trackInfo, destPath) {
  const spotifyUrl = `https://open.spotify.com/track/${trackId}`;
  const apiUrl = `https://api.zeidteam.xyz/media-downloader/atd2?url=${encodeURIComponent(spotifyUrl)}`;
  let res = null;
  try {
    res = await axios.get(apiUrl, { timeout: 45000 });
  } catch (e) {}
  if (!res || !res.data) {
    try {
      const token = await getSpotifyToken();
      const meta = await axios.get(`${API_ENDPOINTS.spotify.track}/${trackId}`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      const name = encodeURIComponent(meta.data?.name || trackInfo.title || "");
      const artistName = encodeURIComponent((meta.data?.artists?.map(a=>a.name).join(" - ") || trackInfo.allArtists || trackInfo.artist || ""));
      const isrc = encodeURIComponent(meta.data?.external_ids?.isrc || "");
      const cdnUrl = `https://cdn-spotify.zm.io.vn/download/${trackId}/${isrc}?name=${name}&artist=${artistName}`;
      await downloadFile(cdnUrl, destPath);
      return destPath;
    } catch (e2) {
      throw new Error("Không thể lấy audio từ Spotify");
    }
  }
  const data = res.data || {};
  const audio = Array.isArray(data.medias) ? data.medias.find(m => m.type === "audio" && m.url) : null;
  if (!audio?.url) throw new Error("AutoDown không trả về audio Spotify");
  await downloadFile(audio.url, destPath);
  return destPath;
}

async function downloadWithNiio(youtubeUrl) {
  const res = await axios.get(`${API_ENDPOINTS.niio_download}?url=${encodeURIComponent(youtubeUrl)}`, { timeout: 30000, headers: { "User-Agent": "Mozilla/5.0" } });
  if (res.data?.success && res.data?.download_url) {
    const audioRes = await axios.get(res.data.download_url, { responseType: "stream", timeout: 60000 });
    return verifyAudioStream(audioRes.data, "Niio API");
  }
  throw new Error("Niio API không trả về link hợp lệ");
}

async function downloadWithCobalt(youtubeUrl) {
  async function cobaltOnce(vFormat) {
    const r = await axios.post("https://api.cobalt.tools/api/json", { url: youtubeUrl, vFormat, vQuality: "128" }, { timeout: 20000, headers: { "Content-Type": "application/json", Accept: "application/json" } });
    if (r.data?.status === "success" && r.data?.url) {
      const a = await axios.get(r.data.url, { responseType: "stream", timeout: 60000 });
      return verifyAudioStream(a.data, `Cobalt API (${vFormat})`);
    }
    return null;
  }
  return (await cobaltOnce("mp3")) || (await cobaltOnce("m4a")) || null;
}

async function searchYouTubeForTrackOrFallback(trackInfo) {
  const results = await searchYouTubeForSpecificTrack(trackInfo).catch(() => []);
  if (results?.length) return results;
  return await searchYouTubeAlternative(`${trackInfo.artist} ${trackInfo.title}`);
}

async function downloadAudioToTempFile(trackInfo) {
  await ensureCacheDir();
  const tmpFile = path.join(CACHE_DIR, `${trackInfo.artist.replace(/[^\w\s-]/g, "").trim()} - ${trackInfo.title.replace(/[^\w\s-]/g, "").trim()}_${Date.now()}.mp3`);

  if (trackInfo.id) {
    try {
      await downloadFromSpotifyAPI(trackInfo.id, trackInfo, tmpFile);
      return tmpFile;
    } catch {}
  }

  const yt = await searchYouTubeForTrackOrFallback(trackInfo);
  if (!yt?.length) throw new Error(`Không tìm thấy "${trackInfo.artist} - ${trackInfo.title}" trên YouTube`);
  for (const video of yt.slice(0, 3)) {
    try {
      try {
        const s = await downloadWithNiio(video.url);
        await new Promise((resolve, reject) => { const ws = fs.createWriteStream(tmpFile); s.pipe(ws); ws.on("finish", resolve); ws.on("error", reject); });
        return tmpFile;
      } catch {}
      const s2 = await downloadWithCobalt(video.url);
      if (s2) {
        await new Promise((resolve, reject) => { const ws = fs.createWriteStream(tmpFile); s2.pipe(ws); ws.on("finish", resolve); ws.on("error", reject); });
        return tmpFile;
      }
    } catch {}
  }
  throw new Error(`Tất cả phương pháp tải đều thất bại cho "${trackInfo.artist} - ${trackInfo.title}"`);
}

async function sendAudioAsVoice(api, threadId, threadType, audioPath) {
  try {
    const aacPath = path.join(CACHE_DIR, `spt_${Date.now()}_${Math.random().toString(36).slice(2)}.aac`);
    await convertToAac(audioPath, aacPath);
    const uploaded = await api.uploadAttachment([aacPath], threadId, threadType);
    const voiceData = uploaded?.[0];
    if (voiceData?.fileUrl && voiceData?.fileName) {
      const voiceUrl = `${voiceData.fileUrl}/${voiceData.fileName}`;
      await api.sendVoice({ voiceUrl, ttl: 12*60*60_000 }, threadId, threadType);
      setTimeout(async () => { try { await fsp.unlink(aacPath); } catch {} }, 30_000);
      return true;
    }
  } catch (e) {}
  return false;
}

async function sendAsVideoPreviewIfNeeded(api, threadId, threadType, audioPath, coverUrl) {
  try {
    const base = audioPath.replace(/\.[a-z0-9]+$/i, "");
    const imagePath = coverUrl ? (await downloadTempFileFromUrl(coverUrl, "spt_cover", ".jpg")) : null;
    const videoPath = `${base}.mp4`;
    await muxImageAndAudioToVideo(imagePath || null, audioPath, videoPath);
    await api.sendMessage({ msg: "🎬 Video preview (audio+cover)", attachments: [videoPath], ttl: 5*60_000 }, threadId, threadType);
    setTimeout(async () => { try { if (imagePath) await fsp.unlink(imagePath); await fsp.unlink(videoPath); } catch {} }, 30_000);
    return true;
  } catch (e) {}
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
  name: "spt",
  description: "Tìm kiếm nhạc đa nền tảng + Download MP3",
  role: 0,
  cooldown: 3,
  group: "music",
  aliases: [],
  noPrefix: false,

  async run({ message, api, args }) {
    const threadId = message.threadId;
    const threadType = message.type ?? ThreadType.User;

    const rawQuery = (args || []).join(" ");
    if (!rawQuery) {
      const help =
        "🎵 [ HƯỚNG DẪN SỬ DỤNG ]\n" +
        "────────────────────\n" +
        "📝 Tìm kiếm cơ bản:\n• spt [từ khóa]\n\n" +
        "🎯 Tìm kiếm nâng cao:\n• spt -artist Sơn Tùng MTP\n• spt -album Vietnam Top Hits\n• spt -genre pop\n• spt -year 2023\n• spt -lyrics Lạc Trôi\n• spt -download Shape of You\n\n" +
        "🔧 Kết hợp nhiều bộ lọc:\n• spt -artist \"Ed Sheeran\" -year 2023\n• spt Shape of You -lyrics\n• spt -artist \"Taylor Swift\" -download\n\n" +
        "💡 Tính năng:\n• Thông tin nghệ sĩ & bài hát\n• Lời bài hát đa nguồn\n• Download MP3/M4A\n• Top tracks & similar artists\n• Genres & tags\n\n" +
        "📥 Lưu ý: Cần mạng ổn định khi tải";
      await api.sendMessage({ msg: help, ttl: 120_000 }, threadId, threadType);
      return;
    }

    const filters = parseSearchQuery(rawQuery);

    if (filters.lyrics && filters.general) {
      const sent = await api.sendMessage({ msg: "🔍 Đang tìm lời bài hát...", ttl: 60_000 }, threadId, threadType);
      const lyrics = await getTrackLyrics(filters.artist || "", filters.general).catch(() => null);
      const { msgId, cliMsgId } = extractIds(sent);
      if (msgId || cliMsgId) {
      }
      if (lyrics) {
        const preview = lyrics.lyrics.length > 1500 ? lyrics.lyrics.slice(0, 1500) + "..." : lyrics.lyrics;
        await api.sendMessage({ msg: `🎵 [ LỜI BÀI HÁT ]\n────────────────────\n📝 Bài hát: ${filters.general}\n👤 Nghệ sĩ: ${filters.artist || "Không xác định"}\n📊 Nguồn: ${lyrics.source}\n\n${preview}\n\n⏰ ${vnNowString()}` }, threadId, threadType);
      } else {
        await api.sendMessage({ msg: `❌ Không tìm thấy lời bài hát cho: \"${filters.general}\"` }, threadId, threadType);
      }
      return;
    }

    if (filters.download && filters.general) {
      const waitMsg = await api.sendMessage({ msg: "🔍 Đang tìm kiếm để tải xuống...", ttl: 60_000 }, threadId, threadType);
    const sp = await searchSpotify(filters.general, filters, 5);
      const items = sp?.tracks?.items || [];
      
      const list = items.map((it) => ({
        id: it.id,
        title: it.name,
        artist: it.artists[0]?.name,
        allArtists: it.artists.map((a) => a.name).join(", "),
        duration: it.duration_ms,
        thumbnail: it.album.images?.[0]?.url || null,
        spotifyUrl: it.external_urls?.spotify,
        album: it.album?.name,
        popularity: it.popularity,
      }));
      if (!list.length) {
        await api.sendMessage({ msg: `❎ Không tìm thấy bài hát để tải: \"${filters.general}\"` }, threadId, threadType);
        return;
      }
      const lines = list.map((t, i) => `\n${i + 1}. 🎵 ${t.title}\n👤 ${t.allArtists}\n💿 ${t.album}\n⏳ ${formatDuration(t.duration)} | ⭐ ${t.popularity}%`).join("\n─────────────────");
      const sent = await api.sendMessage({ msg: `🎵 [ CHỌN BÀI DOWNLOAD ]\n────────────────────\n🔍 Tìm kiếm: \"${filters.general}\"\n📊 Tìm thấy: ${list.length} kết quả\n${lines}\n\n💡 Reply số để tải MP3/M4A\n⚠️ Quá trình tải có thể mất 1-2 phút`, ttl: 10*60_000 }, threadId, threadType);
      const ids = extractIds(sent);
      dangKyReply({
        msgId: ids.msgId,
        cliMsgId: ids.cliMsgId,
        threadId,
        command: "spt",
        data: { mode: "download_choose", tracks: list, filters },
      onReply: async ({ message: rep, api, content, data }) => {
          const tId = rep.threadId; const tType = rep.type;
          const textRaw = String(content || "").trim();
          const n = parseInt(textRaw, 10) - 1;
          if (isNaN(n) || n < 0 || n >= data.tracks.length) {
            await api.sendMessage({ msg: "❌ Số thứ tự không hợp lệ!", ttl: 60_000 }, tId, tType);
            return { clear: false };
          }
          const sel = data.tracks[n];
          const downloading = await api.sendMessage({ msg: `🔄 Đang tải \"${sel.title}\" - ${sel.allArtists}...\n⏳ Vui lòng chờ 1-2 phút`, ttl: 10*60_000 }, tId, tType);
          try {
            const file = await downloadAudioToTempFile(sel);
            const sentVoice = await sendAudioAsVoice(api, tId, tType, file);
            if (!sentVoice) {
              await api.sendMessage({ msg: `✅ [ DOWNLOAD THÀNH CÔNG ]\n────────────────────\n🎵 ${sel.title}\n👤 ${sel.allArtists}\n💿 ${sel.album}\n⏳ ${formatDuration(sel.duration)}\n⭐ Popularity: ${sel.popularity}%\n\n(Đính kèm MP3 để bạn kiểm tra nghe)`, attachments: [file], ttl: 5*60_000 }, tId, tType);
              await sendAsVideoPreviewIfNeeded(api, tId, tType, file, sel.thumbnail);
            }
            setTimeout(async () => { try { await fsp.unlink(file); } catch {} }, 30_000);
          } catch (e) {
            await api.sendMessage({ msg: `❌ ${e?.message || e}` }, tId, tType);
          }
          return { clear: true };
        },
      });
      return;
    }

    const waitMsg = await api.sendMessage({ msg: "🔍 Đang tìm kiếm đa nền tảng...", ttl: 60_000 }, threadId, threadType);
    const sp = await searchSpotify(filters.general, filters, 8);
    const items = sp?.tracks?.items || [];
    if (logger) {
      const artistList = items.map((it, i) => ({ i: i + 1, id: it.id, artist: it.artists.map(a => a.name).join(", "), title: it.name }));
      logger("spotify results", items.length);
      logger("spotify artists", artistList);
    }
    if (!items.length) {
      await api.sendMessage({ msg: `❎ Không tìm thấy kết quả cho: \"${filters.general}\"` }, threadId, threadType);
      return;
    }

    const tracks = [];
    for (const it of items) {
      const t = {
        id: it.id,
        title: it.name,
        artist: it.artists[0]?.name,
        allArtists: it.artists.map((a) => a.name).join(", "),
        duration: it.duration_ms,
        thumbnail: it.album.images?.[0]?.url || null,
        spotifyUrl: it.external_urls?.spotify,
        previewUrl: it.preview_url,
        album: it.album?.name,
        releaseDate: it.album?.release_date,
        popularity: it.popularity,
        explicit: it.explicit,
        trackNumber: it.track_number,
        albumType: it.album?.album_type,
        totalTracks: it.album?.total_tracks,
      };
      const enh = await enhanceTrackData(t);
      tracks.push(enh);
    }

    let resultsCanvas = null;
    try {
      const itemsForCanvas = tracks.slice(0, 8).map((t) => ({
        title: `${t.title} — ${t.allArtists}`,
        artist: t.album || t.albumType || "",
        thumb: t.thumbnail || "",
        timestamp: `${formatDuration(t.duration)}`,
      }));
      resultsCanvas = await createSoundCloudResultsCanvas(itemsForCanvas, `Kết quả: ${filters.general || filters.artist || "Spotify"}`);
    } catch (e) {
      if (logger) logger("create canvas error", e?.message || e);
    }

    const sent = await api.sendMessage({
      msg: `🎵 Kết quả “${filters.general}”\n\n• Reply số thứ tự để xem chi tiết`,
      attachments: resultsCanvas ? [resultsCanvas] : [],
      ttl: 10*60_000,
    }, threadId, threadType);

    const ids = extractIds(sent);
    dangKyReply({
      msgId: ids.msgId,
      cliMsgId: ids.cliMsgId,
      threadId,
      command: "spt",
      data: { mode: "list", tracks, filters },
      onReply: async ({ message: rep, api, content, data }) => {
        const tId = rep.threadId; const tType = rep.type;
        const text = String(content || "").trim();
        if (data.mode === "detail_action") {
          const tr = data.track;
          if (/^download$/i.test(text)) {
            const downloading = await api.sendMessage({ msg: ` Đang tải \"${tr.title}\" - ${tr.allArtists}...`, ttl: 10*60_000 }, tId, tType);
          try {
              const file = await downloadAudioToTempFile(tr);
              const sentVoice = await sendAudioAsVoice(api, tId, tType, file);
              if (!sentVoice) {
                await api.sendMessage({ msg: `[ DOWNLOAD THÀNH CÔNG ]\n────────────────────\n🎵 ${tr.title}\n👤 ${tr.allArtists}\n💿 ${tr.album}\n⏳ ${formatDuration(tr.duration)}\n⭐ Popularity: ${tr.popularity}%\n\n(Đính kèm MP3 để bạn kiểm tra nghe)`, attachments: [file], ttl: 5*60_000 }, tId, tType);
                await sendAsVideoPreviewIfNeeded(api, tId, tType, file, tr.thumbnail);
              }
              setTimeout(async () => { try { await fsp.unlink(file); } catch {} }, 30_000);
            } catch (e) {
              await api.sendMessage({ msg: ` ${e?.message || e}` }, tId, tType);
            }
            return { clear: true };
          }
          if (/^lyrics?$/i.test(text)) {
            const sentL = await api.sendMessage({ msg: "🔍 Đang tìm lời bài hát...", ttl: 60_000 }, tId, tType);
            const ly = await getTrackLyrics(tr.artist, tr.title).catch(() => null);
            if (logger) logger("detail lyrics result", ly ? (ly.lyrics?.length || 0) : 0);
            const preview = ly?.lyrics ? (ly.lyrics.length > 1500 ? ly.lyrics.slice(0, 1500) + "..." : ly.lyrics) : null;
            if (preview) {
              await api.sendMessage({ msg: `🎵 [ LỜI BÀI HÁT ]\n────────────────────\n📝 ${tr.title}\n👤 ${tr.allArtists}\n📊 Nguồn: ${ly.source}\n\n${preview}\n\n⏰ ${vnNowString()}` }, tId, tType);
            } else {
              await api.sendMessage({ msg: `❌ Không tìm thấy lời bài hát cho: \"${tr.title}\"` }, tId, tType);
            }
            return { clear: false };
          }
          return { clear: false };
        }
        if (/^d\d+$/i.test(text)) {
          const idx = parseInt(text.slice(1), 10) - 1;
          if (isNaN(idx) || idx < 0 || idx >= data.tracks.length) {
            await api.sendMessage({ msg: "❌ Số thứ tự không hợp lệ!", ttl: 60_000 }, tId, tType);
            return { clear: false };
          }
          const s = data.tracks[idx];
          if (logger) logger("list picked download", { index: idx, id: s.id, title: s.title, artist: s.artist });
          const downloading = await api.sendMessage({ msg: `🔄 Đang tải \"${s.title}\" - ${s.allArtists}...`, ttl: 10*60_000 }, tId, tType);
          try {
            const file = await downloadAudioToTempFile(s);
            const sentVoice = await sendAudioAsVoice(api, tId, tType, file);
            if (!sentVoice) {
              await api.sendMessage({ msg: `✅ [ DOWNLOAD THÀNH CÔNG ]\n────────────────────\n🎵 ${s.title}\n👤 ${s.allArtists}\n💿 ${s.album}\n⏳ ${formatDuration(s.duration)}\n⭐ Popularity: ${s.popularity}%\n\n(Đính kèm MP3 để bạn kiểm tra nghe)`, attachments: [file], ttl: 5*60_000 }, tId, tType);
              await sendAsVideoPreviewIfNeeded(api, tId, tType, file, s.thumbnail);
            }
            setTimeout(async () => { try { await fsp.unlink(file); } catch {} }, 30_000);
          } catch (e) {
            await api.sendMessage({ msg: `❌ ${e?.message || e}` }, tId, tType);
            if (logger) logger("list download error", e?.message || e);
          }
          return { clear: true };
        }

        const idx = parseInt(text, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= data.tracks.length) {
          await api.sendMessage({ msg: "❌ Số thứ tự không hợp lệ!", ttl: 60_000 }, tId, tType);
          return { clear: false };
        }
        const sel = data.tracks[idx];
        const duration = formatDuration(sel.duration);
        const year = sel.releaseDate ? new Date(sel.releaseDate).getFullYear() : "?";
        const explicit = sel.explicit ? "🔞 Explicit" : "✅ Clean";

        const artistInfo = await getArtistInfo(sel.artist);
        const topTracks = await getTopTracks(sel.artist);
        const similarArtists = await getSimilarArtists(sel.artist);
        if (logger) logger("artist detail", { artist: sel.artist, info: !!artistInfo, topTracks: topTracks?.length || 0, similar: similarArtists?.length || 0 });

        let detail = `🎵 [ CHI TIẾT BÀI HÁT ]\n────────────────────\n📝 Tên: ${sel.title}\n👤 Nghệ sĩ: ${sel.allArtists}\n💿 Album: ${sel.album} (${sel.albumType})\n📅 Năm phát hành: ${year}\n⏳ Thời lượng: ${duration}\n🎯 Track: ${sel.trackNumber}/${sel.totalTracks}\n⭐ Spotify Popularity: ${sel.popularity}%\n🔒 ${explicit}`;
        if (sel.playcount) detail += `\n▶️ Lượt phát: ${Number(sel.playcount).toLocaleString()}`;
        if (sel.listeners) detail += `\n👥 Người nghe: ${Number(sel.listeners).toLocaleString()}`;
        if (sel.genres?.length) detail += `\n🎼 Thể loại: ${sel.genres.join(", ")}`;
        if (sel.summary) detail += `\n\n📖 Mô tả: ${sel.summary}`;
        if (artistInfo?.stats) detail += `\n\n👤 [ THÔNG TIN NGHỆ SĨ ]\n────────────────────\n▶️ Lượt phát: ${Number(artistInfo.stats.playcount).toLocaleString()}\n👥 Người nghe: ${Number(artistInfo.stats.listeners).toLocaleString()}`;
        if (topTracks?.length) {
          detail += `\n\n🔥 [ TOP TRACKS ]\n────────────────────`;
          topTracks.slice(0, 3).forEach((t, i) => { detail += `\n${i + 1}. ${t.name}${t.playcount ? ` (${Number(t.playcount).toLocaleString()} plays)` : ""}`; });
        }
        if (similarArtists?.length) detail += `\n\n🎭 [ NGHỆ SĨ TƯƠNG TỰ ]\n────────────────────\n${similarArtists.slice(0, 3).map((a) => a.name).join(", ")}`;
        detail += `\n\n🔗 Spotify: ${sel.spotifyUrl}`;
        detail += `\n📥 Reply \"download\" để tải MP3\n🎤 Reply \"lyrics\" để xem lời bài hát`;

        const atts = [];
        if (sel.thumbnail) {
          const f = await downloadTempFileFromUrl(sel.thumbnail, "spt_thumb", ".jpg");
          if (f) atts.push(f);
        }
        if (logger) logger("detail message attachments", atts.length);
        const sent = await api.sendMessage({ msg: detail, attachments: atts, ttl: 10*60_000 }, tId, tType);
        const ids2 = extractIds(sent);
        if (logger) logger("detail message ids", ids2);
        return {
          clear: false,
          update: {
            data: { mode: "detail_action", track: sel, filters: data.filters },
            msgId: ids2.msgId,
            cliMsgId: ids2.cliMsgId,
          },
        };
      },
    });

    setTimeout(async () => { try { if (resultsCanvas) { await fsp.unlink(resultsCanvas); if (logger) logger("cleanup canvas", resultsCanvas); } } catch {} }, 60_000);
  },
};


