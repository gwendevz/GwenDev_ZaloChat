// author @GwenDev
import axios from "axios";
import path from "path";
import fs from "fs";
import { ThreadType } from "zca-js";
import { downloadFile, convertToAac } from "../../Utils/GwenDev.js";

function toVNTimeString() {
  try {
    return new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  } catch {
    return new Date().toLocaleString("vi-VN");
  }
}

export default {
  name: "say",
  description: "Chuyển văn bản thành giọng nói thông qua Google TTS và gửi voice",
  role: 0,
  cooldown: 0,
  group: "group",
  aliases: ["tts"],
  noPrefix: false,

  async run({ message, api, args }) {
    const threadId = message.threadId;
    const threadType = message.type ?? ThreadType.User;

    if (!args || args.length === 0) {
      const helpLines = [
        "【 SAY - HƯỚNG DẪN 】",
        "Cú pháp: .say [lang] <văn bản>",
        "Ví dụ: .say hello",
        "        .say en hello world",
        "",
        "【 MỘT SỐ MÃ NGÔN NGỮ PHỔ BIẾN 】",
        "vi      – Tiếng Việt",
        "en      – English (US)",
        "en-uk   – English (UK)",
        "ja      – 日本語 (Japanese)",
        "ko      – 한국어 (Korean)",
        "zh-CN   – 中文普通话 (Chinese)",
        "th      – ภาษาไทย (Thai)",
        "fr      – Français (French)",
        "es      – Español (Spanish)",
        "ru      – Русский (Russian)",
        "pt-BR   – Português (Brazil)",
        "",
        "Hoặc gõ: .say list để xem lại danh sách.",
      ].join("\n");
      return api.sendMessage({ msg: helpLines, ttl: 12*60*60_000 }, threadId, threadType);
    }

    if (args.length === 1 && /^(langs?|languages?|list)$/i.test(args[0])) {
      const langsHelp = [
        "【 DANH SÁCH NGÔN NGỮ MẪU 】",
        "vi  – Tiếng Việt",
        "en  – English (US)",
        "en-uk – English (UK)",
        "ja  – 日本語 (Japanese)",
        "ko  – 한국어 (Korean)",
        "zh-CN – 中文普通话 (Chinese)",
        "th  – ภาษาไทย (Thai)",
        "fr  – Français (French)",
        "es  – Español (Spanish)",
        "ru  – Русский (Russian)",
        "pt-BR – Português (Brazil)",
        "➜ Dùng: .say <lang> <text> (vd: .say ja ohayo)",
      ].join("\n");
      return api.sendMessage({ msg: langsHelp, ttl: 12*60*60_000 }, threadId, threadType);
    }

    let lang = "vi";
    let textArgs = args;
    if (args[0] && /^[a-z]{2}(?:-[a-z]{2})?$/i.test(args[0])) {
      lang = args[0].toLowerCase();
      textArgs = args.slice(1);
    }

    const text = textArgs.join(" ").trim();
    if (!text) {
      return api.sendMessage({ msg: " Văn bản không được để trống.", ttl: 12*60*60_000 }, threadId, threadType);
    }

    try {
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;


      const cacheDir = path.join("Data", "Cache");
      fs.mkdirSync(cacheDir, { recursive: true });
      const base = path.join(cacheDir, `tts_${Date.now()}`);
      const mp3Path = base;
      const aacPath = `${base}.aac`;

      await downloadFile(ttsUrl, mp3Path);
      
      await convertToAac(mp3Path, aacPath);

      const uploaded = await api.uploadAttachment([aacPath], threadId, threadType);
      const voiceData = uploaded?.[0];
      if (!voiceData?.fileUrl || !voiceData?.fileName) {
        throw new Error("Upload voice thất bại.");
      }
      const voiceUrl = `${voiceData.fileUrl}/${voiceData.fileName}`;
      await api.sendVoice({ voiceUrl, ttl: 12*60*60_000 }, threadId, threadType);

      try {
        if (processingMsg?.msgId) {
          await api.undo({ msgId: processingMsg.msgId, cliMsgId: message.data?.cliMsgId ?? 0 }, threadId, threadType);
        }
      } catch {}

      setTimeout(() => {
        try {
          if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
          if (fs.existsSync(aacPath)) fs.unlinkSync(aacPath);
        } catch {}
      }, 5000);
    } catch (err) {
      console.error("[say] error:", err?.message || err);
      return api.sendMessage({ msg: " Đã xảy ra lỗi khi tạo hoặc gửi voice.", ttl: 12*60*60_000 }, threadId, threadType);
    }
  },
};
