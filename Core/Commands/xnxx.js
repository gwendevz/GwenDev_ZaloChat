// author @GwenDev
import axios from "axios";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import * as cheerio from "cheerio";
import https from "https";
import { ThreadType } from "zca-js";
import { dangKyReply } from "../../Handlers/HandleReply.js";

const CACHE_DIR = path.resolve("Data", "Cache", "XNXX");
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024;

async function ensureCacheDir() {
  try { await fsp.mkdir(CACHE_DIR, { recursive: true }); } catch {}
}

function getLogger(enabled) {
  if (!enabled) return () => {};
  return (...args) => {
 };
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

function isCertError(e) {
  const msg = String(e?.message || "").toLowerCase();
  return msg.includes("certificate") || msg.includes("ssl") || msg.includes("self signed") || msg.includes("unable to verify");
}

function agentIf(insecure) {
  return insecure ? new https.Agent({ rejectUnauthorized: false }) : undefined;
}

async function searchVideos(query, logger, { insecure = false } = {}) {
  const searchQuery = query.toLowerCase().includes("viet") ? query : `${query} vietnam`;
  const url = `https://www.xnxx.com/search/${encodeURIComponent(searchQuery)}`;
  logger && logger("search", { query, searchQuery, url });
  const res = await axios.get(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "vi-VN,vi;q=0.9" },
    timeout: 20000,
    httpsAgent: agentIf(insecure),
  });
  const list = parseVideos(res.data, logger);
  logger && logger("search results", { count: list.length });
  return list;
}

function parseVideos(html, logger) {
  const $ = cheerio.load(html);
  const results = [];
  $(".mozaique .thumb-block").each((i, el) => {
    if (i >= 10) return;
    const element = $(el);
    const titleEl = element.find(".thumb-under a");
    const title = titleEl.attr("title") || titleEl.text().trim();
    const href = titleEl.attr("href");
    const url = href ? `https://www.xnxx.com${href}` : null;
    if (!url) return;
    const metadata = element.find(".metadata").text().trim();
    const duration = metadata.match(/[0-9]+min[0-9]*sec?|[0-9]+min|[0-9]+sec/gi)?.[0] || "";
    const quality = metadata.match(/[0-9]+p/gi)?.[0] || "";
    const views = element.find(".views").text().trim();
    const uploader = element.find(".uploader").text().trim();
    const item = { title, url, duration, quality, views, uploader };
    results.push(item);
  });
  logger && logger("parsed videos", results.map((r, i) => ({ i: i + 1, title: r.title, url: r.url })));
  return results;
}

async function fetchVideoUrl(pageUrl, logger, { insecure = false } = {}) {
  logger && logger("fetchVideoUrl: get page", pageUrl);
  const res = await axios.get(pageUrl, { headers: { "User-Agent": USER_AGENT }, timeout: 20000, httpsAgent: agentIf(insecure) });
  const $ = cheerio.load(res.data);
  const scripts = Array.from($("script").toArray()).map(el => $(el).html() || "");
  let videoUrl = null;
  for (const s of scripts) {
    if (!s) continue;
    const mHigh = s.match(/html5player\.setVideoUrlHigh\('(.+?)'\)/);
    const mLow = s.match(/html5player\.setVideoUrlLow\('(.+?)'\)/);
    if (mHigh && mHigh[1]) { videoUrl = mHigh[1]; logger && logger("videoUrl HIGH found"); break; }
    if (!videoUrl && mLow && mLow[1]) { videoUrl = mLow[1]; logger && logger("videoUrl LOW candidate found"); }
  }
  if (!videoUrl) throw new Error("Không lấy được link tải");
  logger && logger("final videoUrl", videoUrl);
  return videoUrl;
}

async function headContentLength(url, logger, { insecure = false } = {}) {
  try {
    const r = await axios.head(url, { headers: { "User-Agent": USER_AGENT }, timeout: 15000, maxRedirects: 5, validateStatus: () => true, httpsAgent: agentIf(insecure) });
    const len = Number(r.headers?.["content-length"] || 0);
    logger && logger("HEAD", { status: r.status, length: len });
    return Number.isFinite(len) ? len : 0;
  } catch {
    return 0;
  }
}

async function downloadToTempFile(fileUrl, prefix = "xnxx", logger, { insecure = false } = {}) {
  await ensureCacheDir();
  const safeName = path.basename(String(fileUrl).split("?")[0]) || `${prefix}_${Date.now()}.mp4`;
  const out = path.join(CACHE_DIR, `${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`);
  logger && logger("download start", { url: fileUrl, out });
  const res = await axios.get(fileUrl, { responseType: "stream", headers: { "User-Agent": USER_AGENT }, timeout: 60000, httpsAgent: agentIf(insecure) });
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(out);
    res.data.pipe(ws);
    ws.on("finish", resolve);
    ws.on("error", reject);
  });
  logger && logger("download done", out);
  return out;
}

export default {
  name: "xnxx",
  description: "Tìm và tải video học tập (xnxx)",
  role: 2,
  cooldown: 5,
  group: "group",
  aliases: [],
  noPrefix: false,

  async run({ message, api, args }) {
    const threadId = message.threadId;
    const threadType = message.type ?? ThreadType.User;
    const rawArgs = (args || []);
    const debug = rawArgs.some(a => /^(-d|--debug|-debug)$/i.test(a));
    const insecureFlag = rawArgs.some(a => /^(-k|--insecure)$/i.test(a));
    const input = rawArgs.filter(a => !/^(-d|--debug|-debug|-k|--insecure)$/i.test(a)).join(" ").trim();
    const logger = getLogger(debug);
    logger("run", { threadId, input, debug, insecure: insecureFlag });

    if (!input) {
      await api.sendMessage({ msg: "Nhập từ khóa hoặc dán link video xnxx!", ttl: 60_000 }, threadId, threadType);
      return;
    }

    if (/^https?:\/\/.+xnxx\.com\//i.test(input)) {
      const waiting = await api.sendMessage({ msg: `Đang xử lý link..`, ttl: 60_000 }, threadId, threadType);
      try {
        let videoUrl;
        try {
          videoUrl = await fetchVideoUrl(input, logger, { insecure: insecureFlag });
        } catch (e) {
          if (!insecureFlag && isCertError(e)) {
            logger("cert error on page fetch, retry insecure");
            videoUrl = await fetchVideoUrl(input, logger, { insecure: true });
          } else { throw e; }
        }

        let size;
        try {
          size = await headContentLength(videoUrl, logger, { insecure: insecureFlag });
        } catch (e) {
          if (!insecureFlag && isCertError(e)) {
            logger("cert error on HEAD, retry insecure");
            size = await headContentLength(videoUrl, logger, { insecure: true });
          } else { throw e; }
        }
        if (size > 0 && size > MAX_DOWNLOAD_BYTES) {
          await api.sendMessage({ msg: ` File quá lớn (${(size / (1024*1024)).toFixed(1)}MB). Link tải trực tiếp:\n${videoUrl}`, ttl: 10*60_000 }, threadId, threadType);
          return;
        }
        let file;
        try {
          file = await downloadToTempFile(videoUrl, "xnxx", logger, { insecure: insecureFlag });
        } catch (e) {
          if (!insecureFlag && isCertError(e)) {
           file = await downloadToTempFile(videoUrl, "xnxx", logger, { insecure: true });
          } else { throw e; }
        }
        try {
          const uploaded = await api.uploadAttachment([file], threadId, threadType);
          await api.sendMessage({ msg: `🎬 ${path.basename(file)}`, attachments: uploaded, ttl: 10*60_000 }, threadId, threadType);
        } catch {}
        setTimeout(async () => { try { await fsp.unlink(file); } catch {} }, 30_000);
      } catch (e) {
         }
      return;
    }

    try {
      let videos;
      try {
        videos = await searchVideos(input, logger, { insecure: insecureFlag });
      } catch (e) {
        if (!insecureFlag && isCertError(e)) {
            videos = await searchVideos(input, logger, { insecure: true });
        } else { throw e; }
      }
      if (!videos || videos.length === 0) {
        await api.sendMessage({ msg: `Không tìm thấy kết quả cho "${input}"!`, ttl: 60_000 }, threadId, threadType);
        return;
      }

      const lines = videos.map((v, i) => {
        const meta = [v.duration && `⏱️ ${v.duration}`, v.quality && `📺 ${v.quality}`, v.views && `👁️ ${v.views}`].filter(Boolean).join(" | ");
        const up = v.uploader ? `\n👤 ${v.uploader}` : "";
        return `\n${i + 1}. ${v.title}${meta ? `\n${meta}` : ""}${up}`;
      }).join("\n─────────────────");

      const sent = await api.sendMessage({ msg: `🔍 Kết quả cho "${input}":\n${lines}\n\n👉 Reply số thứ tự để tải video.${debug ? "\n🪵 Debug: Bật" : ""}${insecureFlag ? "\n⚠️ Insecure TLS: Bật" : ""}`, ttl: 10*60_000 }, threadId, threadType);
      const { msgId, cliMsgId } = extractIds(sent);

      dangKyReply({
        msgId,
        cliMsgId,
        threadId,
        command: "xnxx",
        data: { mode: "list", videos },
        onReply: async ({ message: rep, api, content, data }) => {
          const tId = rep.threadId; const tType = rep.type ?? ThreadType.User;
          const text = String(content || "").trim();
          const idx = parseInt(text, 10) - 1;
          if (Number.isNaN(idx) || idx < 0 || idx >= (data.videos?.length || 0)) {
            await api.sendMessage({ msg: ` Vui lòng nhập số từ 1 đến ${data.videos.length}`, ttl: 60_000 }, tId, tType);
            return { clear: false };
          }
          const pick = data.videos[idx];
          logger("pick", { index: idx + 1, title: pick.title, url: pick.url });
          const waiting = await api.sendMessage({ msg: ` Đang tải: ${pick.title}`, ttl: 5*60_000 }, tId, tType);
          try {
            let fileUrl;
            try {
              fileUrl = await fetchVideoUrl(pick.url, logger, { insecure: insecureFlag });
            } catch (e) {
              if (!insecureFlag && isCertError(e)) {
               fileUrl = await fetchVideoUrl(pick.url, logger, { insecure: true });
              } else { throw e; }
            }

            let size;
            try {
              size = await headContentLength(fileUrl, logger, { insecure: insecureFlag });
            } catch (e) {
              if (!insecureFlag && isCertError(e)) {
                size = await headContentLength(fileUrl, logger, { insecure: true });
              } else { throw e; }
            }
            if (size > 0 && size > MAX_DOWNLOAD_BYTES) {
              await api.sendMessage({ msg: ` File quá lớn (${(size / (1024*1024)).toFixed(1)}MB). Link tải trực tiếp:\n${fileUrl}`, ttl: 10*60_000 }, tId, tType);
              return { clear: true };
            }
            let file;
            try {
              file = await downloadToTempFile(fileUrl, "xnxx", logger, { insecure: insecureFlag });
            } catch (e) {
              if (!insecureFlag && isCertError(e)) {
                file = await downloadToTempFile(fileUrl, "xnxx", logger, { insecure: true });
              } else { throw e; }
            }
            try {
              const uploaded = await api.uploadAttachment([file], tId, tType);
              await api.sendMessage({ msg: `🎬 ${pick.title}`, attachments: uploaded, ttl: 10*60_000 }, tId, tType);
            } catch {}
            setTimeout(async () => { try { await fsp.unlink(file); } catch {} }, 30_000);
          } catch (e) {
            logger("download error", e?.message || e);
             }
          return { clear: true };
        },
      });
    } catch (e) {
      logger("search error", e?.message || e);
      }
  },
};


