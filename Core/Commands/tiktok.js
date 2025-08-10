// author @GwenDev
import axios from "axios";
import path from "path";
import fs from "fs";
import { ThreadType } from "zca-js";
import { downloadFile, getVideoMetadata, convertToAac } from "../../Utils/GwenDev.js";
import { setPendingReply } from "../../Handlers/HandleReply.js";

function toNum(n) { return Number(n || 0) || 0; }

function vnTime() {
  try {
    return new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  } catch {
    return new Date().toLocaleString("vi-VN");
  }
}

function fmt(n) {
  try { return toNum(n).toLocaleString("vi-VN"); } catch { return String(n); }
}

async function sendWithThumbList({ api, items, title, page, perPage, threadId, threadType, uid }) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const p = Math.min(totalPages, Math.max(1, page));
  const start = (p - 1) * perPage;
  const pageItems = items.slice(start, start + perPage);

  const lines = [title, "─────────────────"]; 
  pageItems.forEach((it, idx) => {
    const stt = start + idx + 1;
    const name = it.title || it.music_info?.title || "Không có tiêu đề";
    const duration = it.duration || it.music_info?.duration || "?";
    const likes = it.digg_count ? ` | ❤️ ${fmt(it.digg_count)}` : "";
    lines.push(`${stt}. ${name}${likes} | ⏳ ${duration}s`);
  });

  lines.push("─────────────────");
  lines.push(`Trang [ ${p} / ${totalPages} ]`);
  lines.push("📌 Reply số để tải. Gõ: trang <số> để chuyển trang.");

  console.log(`[tiktok] Sending list: title="${title}" page=${p}/${totalPages} items=${items.length}`);
  const res = await api.sendMessage(lines.join("\n"), threadId, threadType);
  const listMsgId = res?.message?.msgId ?? res?.msgId ?? null;
  const listCliMsgId = res?.message?.cliMsgId ?? res?.cliMsgId ?? 0;


  const pending = {
    authorId: uid,
    listMsgId,
    listCliMsgId,
    items,
    page: p,
    perPage,
    handler: async ({ message, api, pending, content }) => {
      const raw = String(content || "").trim();
      const threadId = message.threadId;
      const threadType = message.type ?? ThreadType.User;

      const pageMatch = raw.match(/trang\s*(\d{1,3})/i);
      if (pageMatch) {
        const newPage = Number(pageMatch[1] || 1) || 1;
        console.log(`[tiktok] page change request -> ${newPage}`);
        const listRes = await sendWithThumbList({ api, items: pending.items, title, page: newPage, perPage: pending.perPage, threadId, threadType, uid: pending.authorId });
        const newListMsgId = listRes?.message?.msgId ?? listRes?.msgId ?? null;
        const newCli = listRes?.message?.cliMsgId ?? listRes?.cliMsgId ?? 0;
        return { clear: false, update: { listMsgId: newListMsgId, listCliMsgId: newCli, page: newPage } };
      }

      const numMatch = raw.match(/\b(\d{1,3})\b/);
      const choice = numMatch ? Number(numMatch[1]) : NaN;
      if (!choice || choice < 1 || choice > pending.items.length) {
        await api.sendMessage("⚠️ STT không hợp lệ.", threadId, threadType);
        return { clear: false };
      }

      const item = pending.items[choice - 1];
      const isAudio = !!item.music || !!item.music_info;
      console.log(`[tiktok] user selected index=${choice} isAudio=${isAudio}`);
      try {
        if (isAudio) {
          const audioUrl = item.music || item.music_info?.url;
          if (!audioUrl) {
            await api.sendMessage("Không tìm thấy URL âm thanh.", threadId, threadType);
          } else {
            const cacheDir = path.join("Data", "Cache");
            fs.mkdirSync(cacheDir, { recursive: true });
            const base = path.join(cacheDir, `tt_aud_${Date.now()}`);
            const rawPath = base;
            const aacPath = `${base}.aac`;
            console.log(`[tiktok] downloading audio: ${audioUrl}`);
            await downloadFile(audioUrl, rawPath);
            await convertToAac(rawPath, aacPath);
            const uploaded = await api.uploadAttachment([aacPath], threadId, threadType);
            const voiceData = uploaded?.[0];
            if (voiceData?.fileUrl && voiceData?.fileName) {
              const voiceUrl = `${voiceData.fileUrl}/${voiceData.fileName}`;
              await api.sendVoice({ voiceUrl, ttl: 900_000 }, threadId, threadType);
              const info = `【 TIKTOK MUSIC 】\n🎵 ${item.music_info?.title || "?"}\n👤 ${item.music_info?.author || "?"}\n⏰ ${item.music_info?.duration || "?"}s`;
              await api.sendMessage(info, threadId, threadType);
            } else {
              await api.sendMessage("Upload voice thất bại.", threadId, threadType);
            }
            try { if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath); if (fs.existsSync(aacPath)) fs.unlinkSync(aacPath); } catch {}
          }
        } else if (item.play || item.nowatermark) {
          const videoUrl = item.play || item.nowatermark;
          const thumb = item.origin_cover || item.cover || videoUrl;
          let width = 720, height = 1280, durationMs = 0;
          const cacheDir = path.join("Data", "Cache");
          fs.mkdirSync(cacheDir, { recursive: true });
          const tmp = path.join(cacheDir, `tt_vid_${Date.now()}.mov`);
          try {
            console.log(`[tiktok] probing video: ${videoUrl}`);
            await downloadFile(videoUrl, tmp);
            const meta = await getVideoMetadata(tmp);
            width = meta.width || width;
            height = meta.height || height;
            durationMs = (meta.duration || 0) * 1000;
          } catch (e) {
            console.log(`[tiktok] probe failed: ${e?.message || e}`);
          } finally {
            try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
          }
          if (!durationMs || durationMs <= 0) {
            const fallbackSec = Number(item.duration || 15) || 15;
            durationMs = fallbackSec * 1000;
          }
          const caption = `【 TIKTOK VIDEO 】\n📝 ${item.title || "?"}\n👤 ${item.author?.nickname || item.nickname || "?"}\n❤️ ${fmt(item.digg_count)}\n⏳ ${item.duration || Math.round(durationMs/1000) || "?"}s`;
          await api.sendVideo({
            videoUrl,
            thumbnailUrl: thumb,
            msg: caption,
            width,
            height,
            duration: durationMs,
            ttl: 500_000
          }, threadId, threadType);
        } else {
          await api.sendMessage("Không có nguồn tải hợp lệ.", threadId, threadType);
        }
      } catch (err) {
        console.error("[tiktok] send item error:", err?.message || err);
        await api.sendMessage("❌ Lỗi khi tải gửi file.", threadId, threadType);
      }

      try { if (pending.listMsgId) await api.undo({ msgId: pending.listMsgId, cliMsgId: pending.listCliMsgId || 0 }, threadId, threadType); } catch {}
      return { clear: true };
    }
  };

  setPendingReply(threadId, pending);
  return res;
}

export default {
  name: "tiktok",
  description: "Tải video, nhạc hoặc xem thông tin từ TikTok",
  role: 0,
  cooldown: 5,
  group: "group",
  aliases: [],
  noPrefix: false,

  async run({ message, api, args }) {
    const threadId = message.threadId;
    const threadType = message.type ?? ThreadType.User;
    const sub = (args?.[0] || "").toLowerCase();
    const keyword = (args || []).slice(1).join(" ").trim();
    const uid = message.data?.uidFrom;

    if (!sub) {
      const help = [
        "[ TIKTOK - Hướng Dẫn ]",
        "─────────────────",
        "1. .tiktok info <@id>",
        "2. .tiktok search <từ khóa> (reply số để nhận video)",
        "3. .tiktok post <@id> (reply số để nhận video)",
        "4. .tiktok trending (gửi ngay video thịnh hành đầu tiên)",
        `⏰ ${vnTime()}`
      ].join("\n");
      return api.sendMessage(help, threadId, threadType);
    }

    try {
      if (sub === "info") {
        if (!keyword) return api.sendMessage("Vui lòng nhập ID người dùng (VD: @theanh28entertainment)", threadId, threadType);
        const res = await axios.get(`https://www.tikwm.com/api/user/info?unique_id=${encodeURIComponent(keyword)}`);
        const ok = res.data?.code === 0 && res.data?.data?.user;
        if (!ok) return api.sendMessage("Không tìm thấy người dùng hoặc API lỗi.", threadId, threadType);
        const { user, stats } = res.data.data;
        const lines = [
          "【 THÔNG TIN NGƯỜI DÙNG TIKTOK 】",
          "─────────────────",
          `👤 Tên: ${user.nickname}`,
          `🆔 ID: ${user.uniqueId}`,
          `📝 Tiểu sử: ${user.signature || "Không có"}`,
          `❤️ Theo dõi: ${fmt(stats.followerCount)} | Đang theo: ${fmt(stats.followingCount)}`,
          `🎬 Video: ${fmt(stats.videoCount)} | 💖 Tim: ${fmt(stats.heartCount)}`,
          `🔗 https://www.tiktok.com/@${user.uniqueId}`,
          `⏰ ${vnTime()}`
        ];
        return api.sendMessage(lines.join("\n"), threadId, threadType);
      }


      if (sub === "search") {
        if (!keyword) return api.sendMessage("Vui lòng nhập từ khóa để tìm kiếm.", threadId, threadType);
        console.log(`[tiktok] search: ${keyword}`);
        const res = await axios.get(`https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(keyword)}`);
        const vids = res.data?.data?.videos || [];
        if (vids.length === 0) return api.sendMessage(`Không tìm thấy kết quả cho "${keyword}".`, threadId, threadType);
        const list = vids.slice(0, 10).map(v => ({
          title: v.title,
          nowatermark: v.play,
          nickname: v.author?.nickname,
          unique_id: v.author?.unique_id,
          digg_count: v.digg_count,
          duration: v.duration
        }));
        return await sendWithThumbList({ api, items: list, title: "【 VIDEO TÌM KIẾM 】", page: 1, perPage: 6, threadId, threadType, uid });
      }

      if (sub === "post") {
        if (!keyword) return api.sendMessage("Vui lòng nhập ID người dùng.", threadId, threadType);
        console.log(`[tiktok] posts of: ${keyword}`);
        const res = await axios.get(`https://www.tikwm.com/api/user/posts?unique_id=${encodeURIComponent(keyword)}`);
        const list = res.data?.data?.videos || [];
        if (list.length === 0) return api.sendMessage("Không có bài đăng nào hoặc ID không hợp lệ.", threadId, threadType);
        return await sendWithThumbList({ api, items: list, title: "【 BÀI ĐĂNG NGƯỜI DÙNG 】", page: 1, perPage: 6, threadId, threadType, uid });
      }

      if (sub === "trending") {
        console.log(`[tiktok] trending VN`);
        const res = await axios.get("https://www.tikwm.com/api/feed/list?region=VN");
        const list = res.data?.data || [];
        if (list.length === 0) return api.sendMessage("Không thể lấy danh sách thịnh hành.", threadId, threadType);

        const it = list[0];
        const videoUrl = it?.play || it?.nowatermark;
        if (!videoUrl) return api.sendMessage("Không tìm thấy video hợp lệ trong thịnh hành.", threadId, threadType);

        const thumb = it.origin_cover || it.cover || videoUrl;
        let width = 720, height = 1280, durationMs = (Number(it.duration || 0) || 0) * 1000;
        const cacheDir = path.join("Data", "Cache");
        fs.mkdirSync(cacheDir, { recursive: true });
        const tmp = path.join(cacheDir, `tt_trend_${Date.now()}.mov`);
        try {
          console.log(`[tiktok] probe trending video: ${videoUrl}`);
          await downloadFile(videoUrl, tmp);
          const meta = await getVideoMetadata(tmp);
          width = meta.width || width;
          height = meta.height || height;
          durationMs = (meta.duration || it.duration || 0) * 1000;
        } catch (e) {
          console.log(`[tiktok] probe failed (trending): ${e?.message || e}`);
        } finally {
          try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
        }
        if (!durationMs || durationMs <= 0) durationMs = ((Number(it.duration || 0) || 15) * 1000);

        const caption = `【 TIKTOK TRENDING 】\n📝 ${it.title || "?"}\n👤 ${it.author?.nickname || "?"}\n❤️ ${fmt(it.digg_count)}\n⏳ ${Math.round((durationMs||0)/1000) || it.duration || "?"}s`;
        return api.sendVideo({
          videoUrl,
          thumbnailUrl: thumb,
          msg: caption,
          width,
          height,
          duration: durationMs,
          ttl: 500_000
        }, threadId, threadType);
      }

      return api.sendMessage("Lệnh không hợp lệ. Nhập .tiktok để xem hướng dẫn.", threadId, threadType);
    } catch (err) {
      console.error("[tiktok] error:", err?.message || err);
      return api.sendMessage("❌ Đã có lỗi xảy ra hoặc API đang bảo trì.", threadId, threadType);
    }
  }
};


