// author @GwenDev
import axios from "axios";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { ThreadType } from "zca-js";

let CanvasMod = null;
try {
  CanvasMod = await import("canvas");
} catch {}

const ACCU_API_KEY = "d7e795ae6a0d44aaa8abb1a0a7ac19e4";
const BG_URL = "https://i.imgur.com/1Rx88Te.jpg";
const FONT_URL = "https://drive.google.com/u/0/uc?id=1uni8AiYk7prdrC7hgAmezaGTMH5R8gW8&export=download";

const ASSET_DIR = path.resolve("Data", "Cache", "Weather");
const ICON_DIR = path.join(ASSET_DIR, "icons");
const BG_PATH = path.join(ASSET_DIR, "bgweather.jpg");
const FONT_PATH = path.join(ASSET_DIR, "Play-Bold.ttf");

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true }).catch(() => {});
}

async function ensureFile(url, outPath) {
  try {
    await fsp.access(outPath);
    return outPath;
  } catch {}
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
  await ensureDir(path.dirname(outPath));
  await fsp.writeFile(outPath, Buffer.from(res.data));
  return outPath;
}

function pad2(n) { return String(n).padStart(2, "0"); }

function accuIconPngUrl(iconNum) {
  const nn = pad2(iconNum);
  return `https://developer.accuweather.com/sites/default/files/${nn}-s.png`;
}

function convertFtoC(F) {
  return Math.floor((Number(F) - 32) / 1.8);
}

function formatHours(str) {
  try {
    const d = new Date(str);
    return d.toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });
  } catch {
    return String(str || "");
  }
}

export default {
  name: "thoitiet",
  description: "Xem thời tiết (AccuWeather) và ảnh dự báo 7 ngày",
  role: 0,
  cooldown: 5,
  group: "other",
  aliases: ["weather"],
  noPrefix: false,

  async run({ message, api, args }) {
    const threadId = message.threadId;
    const threadType = message.type ?? ThreadType.User;

    const area = (args || []).join(" ").trim();
    if (!area) {
      return api.sendMessage({ msg: "Vui lòng nhập địa điểm!", ttl: 60_000 }, threadId, threadType);
    }

    try {
      await ensureDir(ASSET_DIR);
      await ensureDir(ICON_DIR);
      try { await ensureFile(BG_URL, BG_PATH); } catch {}
      try { await ensureFile(FONT_URL, FONT_PATH); } catch {}

      const searchUrl = `https://api.accuweather.com/locations/v1/cities/search.json?q=${encodeURIComponent(area)}&apikey=${ACCU_API_KEY}&language=vi-vn`;
      const resp = await axios.get(searchUrl, { timeout: 20000 });
      const list = Array.isArray(resp.data) ? resp.data : [];
      if (list.length === 0) {
        return api.sendMessage({ msg: "Không tìm thấy địa điểm này!", ttl: 60_000 }, threadId, threadType);
      }
      const item = list[0];
      const areaKey = item?.Key;
      if (!areaKey) {
        return api.sendMessage({ msg: "Không xác định được khu vực.", ttl: 60_000 }, threadId, threadType);
      }

      const forecastUrl = `https://api.accuweather.com/forecasts/v1/daily/10day/${areaKey}?apikey=${ACCU_API_KEY}&details=true&language=vi`;
      const fRes = await axios.get(forecastUrl, { timeout: 20000 });
      const dataWeather = fRes.data || {};
      const daily = Array.isArray(dataWeather?.DailyForecasts) ? dataWeather.DailyForecasts : [];
      if (daily.length === 0) {
        return api.sendMessage({ msg: "Không có dữ liệu dự báo.", ttl: 60_000 }, threadId, threadType);
      }

      const today = daily[0];
      const msgLines = [
        `Thời tiết hôm nay:`,
        `${dataWeather?.Headline?.Text || ""}`,
        `🌡 Thấp - Cao: ${convertFtoC(today?.Temperature?.Minimum?.Value)}°C - ${convertFtoC(today?.Temperature?.Maximum?.Value)}°C`,
        `🌡 Cảm nhận: ${convertFtoC(today?.RealFeelTemperature?.Minimum?.Value)}°C - ${convertFtoC(today?.RealFeelTemperature?.Maximum?.Value)}°C`,
        `🌅 Mặt trời mọc: ${formatHours(today?.Sun?.Rise)}`,
        `🌄 Mặt trời lặn: ${formatHours(today?.Sun?.Set)}`,
        `🌃 Trăng mọc: ${formatHours(today?.Moon?.Rise)}`,
        `🏙️ Trăng lặn: ${formatHours(today?.Moon?.Set)}`,
        `🌞 Ban ngày: ${today?.Day?.LongPhrase || ""}`,
        `🌙 Ban đêm: ${today?.Night?.LongPhrase || ""}`,
      ];

      if (!CanvasMod) {
        const payload = { msg: msgLines.join("\n"), ttl: 5*60_000 };
        try { if (fs.existsSync(BG_PATH)) payload.attachments = [BG_PATH]; } catch {}
        return api.sendMessage(payload, threadId, threadType);
      }

      const { createCanvas, loadImage, registerFont } = CanvasMod;
      try { registerFont(FONT_PATH, { family: "Play-Bold" }); } catch {}

      let bgImg = null;
      try { bgImg = await loadImage(BG_PATH); } catch {}
      if (!bgImg) {
        const payload = { msg: msgLines.join("\n"), ttl: 5*60_000 };
        try { if (fs.existsSync(BG_PATH)) payload.attachments = [BG_PATH]; } catch {}
        return api.sendMessage(payload, threadId, threadType);
      }

      const width = bgImg.width;
      const height = bgImg.height;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bgImg, 0, 0, width, height);

      ctx.fillStyle = "#ffffff";
      ctx.font = "24px Play-Bold, Arial";
      let textY = 40;
      for (const line of msgLines) {
        try { ctx.fillText(line, 48, textY); } catch {}
        textY += 34;
      }

      const next = daily.slice(0, 7);
      let X = 100;
      for (const d of next) {
        const iconNum = Number(d?.Day?.Icon || 1);
        const iconUrl = accuIconPngUrl(iconNum);
        const iconPath = path.join(ICON_DIR, `${pad2(iconNum)}-s.png`);
        try { await ensureFile(iconUrl, iconPath); } catch {}
        try {
          const ic = await loadImage(iconPath);
          ctx.drawImage(ic, X, 210, 80, 80);
        } catch {}
        ctx.font = "22px Play-Bold, Arial";
        const maxC = `${convertFtoC(d?.Temperature?.Maximum?.Value)}°C`;
        const minC = `${convertFtoC(d?.Temperature?.Minimum?.Value)}°C`;
        const dayStr = (() => { try { return new Date(d?.Date).toLocaleDateString("vi-VN", { day: "2-digit" }); } catch { return ""; } })();
        try { ctx.fillText(maxC, X, 366); } catch {}
        try { ctx.fillText(minC, X, 445); } catch {}
        try { ctx.fillText(dayStr, X + 20, 140); } catch {}
        X += 135;
      }

      const outPath = path.join(ASSET_DIR, `weather_${Date.now()}.jpg`);
      await fsp.writeFile(outPath, canvas.toBuffer("image/jpeg", { quality: 0.92 }));

      try {
        await api.sendMessage({ msg: msgLines.join("\n"), attachments: [outPath], ttl: 5*60_000 }, threadId, threadType);
      } finally {
        try { await fsp.unlink(outPath); } catch {}
      }
    } catch (err) {
      return api.sendMessage({ msg: "Đã có lỗi xảy ra!!", ttl: 60_000 }, threadId, threadType);
    }
  },
};


