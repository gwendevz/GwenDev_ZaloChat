// author @GwenDev
import { query } from "../../App/Database.js";

function safeParseJsonArray(json) {
  try {
    const parsed = JSON.parse(json || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default {
  name: "checktt",
  description: "Xem tương tác cá nhân hoặc top tương tác (chuẩn theo nhóm & toàn hệ thống).",
  role: 0,
  cooldown: 5,
  group: "group",
  async run({ message, api, args }) {
    try {
      const threadId = message.threadId;
      const threadIdStr = String(threadId);
      let threadName = "Không rõ";

      try {
        const groupInfo = await api.getGroupInfo(threadId);
        const info = groupInfo.gridInfoMap?.[threadIdStr];
        threadName = info?.name || "Không rõ";
      } catch {}

      const mentions = Array.isArray(message.data?.mentions) ? message.data.mentions : [];
      const senderId = message.data?.uidFrom;
      const senderName = message.data?.dName || "Không rõ";
      const subCommand = (args[0] || "").toLowerCase();

      if (!subCommand || mentions.length > 0) {
        const targetId = mentions.length > 0 ? (mentions[0].uid || senderId) : senderId;
        const targetName = mentions.length > 0 ? (mentions[0].tag || senderName) : senderName;

        const [row] = await query(`SELECT name, uid, tuongtac, tuongtactuan, tuongtacthang FROM users WHERE uid = ? LIMIT 1`, [targetId]);
        if (!row) {
          return api.sendMessage(`Không có dữ liệu tương tác cho "${targetName}"`, threadId, message.type);
        }

        const data = safeParseJsonArray(row.tuongtac);
        const item = data.find(i => String(i.threadId) === threadIdStr);
        const inThread = item?.tuongtac || 0;
        const globalTotal = data.reduce((s, i) => s + (i.tuongtac || 0), 0);
        const week = Number(row.tuongtactuan || 0);
        const month = Number(row.tuongtacthang || 0);

        const allUsers = await query(`SELECT uid, name, tuongtac FROM users`);
        const inThreadList = [];
        for (const u of allUsers) {
          const arr = safeParseJsonArray(u.tuongtac);
          const m = arr.find(x => String(x.threadId) === threadIdStr);
          if (m && m.tuongtac > 0) inThreadList.push({ uid: u.uid, name: u.name || "Không rõ", count: m.tuongtac });
        }
        const sortedInThread = inThreadList.sort((a, b) => b.count - a.count);
        const rankInThread = sortedInThread.findIndex(u => u.uid === targetId) + 1 || 0;

        const globalList = [];
        for (const u of allUsers) {
          const arr = safeParseJsonArray(u.tuongtac);
          const total = arr.reduce((s, i) => s + (i.tuongtac || 0), 0);
          if (total > 0) globalList.push({ uid: u.uid, total });
        }
        const sortedGlobal = globalList.sort((a, b) => b.total - a.total);
        const rankGlobal = sortedGlobal.findIndex(u => u.uid === targetId) + 1 || 0;

        const lines = [
          "╭─────「 TƯƠNG TÁC NGƯỜI DÙNG 」─────⭓",
          `│ 👤 Tên: ${targetName}`,
          `│ 🧵 Nhóm: ${threadName}`,
          `│ 💬 Trong nhóm: ${inThread}`,
          `│ 🌐 Toàn hệ thống: ${globalTotal}`,
          `│ 📈 Tuần: ${week} • 📅 Tháng: ${month}`,
          `│ 🏆 Hạng nhóm: ${rankInThread || "-"} • 🏆 Hạng hệ thống: ${rankGlobal || "-"}`,
          "╰────────────────────────────────⭓"
        ];

        return api.sendMessage({ msg: lines.join("\n"), quoteId: message.msgId }, threadId, message.type);
      }

      if (subCommand === "box") {
        const rows = await query(`SELECT name, uid, tuongtac FROM users`);
        const list = [];
        for (const row of rows) {
          const arr = safeParseJsonArray(row.tuongtac);
          const m = arr.find(i => String(i.threadId) === threadIdStr);
          if (m && m.tuongtac > 0) list.push({ name: row.name || "Không rõ", count: m.tuongtac });
        }
        const top = list.sort((a, b) => b.count - a.count).slice(0, 10);
        if (top.length === 0) return api.sendMessage("Không có dữ liệu tương tác trong nhóm này.", threadId, message.type);
        const lines = ["╭─────「 TOP 10 TƯƠNG TÁC NHÓM 」─────⭓", ...top.map((u, i) => `│ ${i + 1}. ${u.name} – ${u.count} Tin Nhắn`), "╰────────────────────────────────⭓"];
        return api.sendMessage({ msg: lines.join("\n"), quoteId: message.msgId }, threadId, message.type);
      }

      if (subCommand === "server") {
        const rows = await query(`SELECT name, uid, tuongtac FROM users`);
        const list = [];
        for (const row of rows) {
          const arr = safeParseJsonArray(row.tuongtac);
          const total = arr.reduce((s, i) => s + (i.tuongtac || 0), 0);
          if (total > 0) list.push({ name: row.name || "Không rõ", count: total });
        }
        const top = list.sort((a, b) => b.count - a.count).slice(0, 10);
        if (top.length === 0) return api.sendMessage("Không có dữ liệu tương tác hệ thống.", threadId, message.type);
        const lines = ["╭─────「 TOP 10 TOÀN HỆ THỐNG 」─────⭓", ...top.map((u, i) => `│ ${i + 1}. ${u.name} – ${u.count} Tin Nhắn`), "╰────────────────────────────────⭓"];
        return api.sendMessage({ msg: lines.join("\n"), quoteId: message.msgId }, threadId, message.type);
      }

      return api.sendMessage(
        "Cú pháp: checktt | checktt @tag | checktt box | checktt server",
        threadId,
        message.type
      );
    } catch (err) {
      console.error("[CHECKTT] Lỗi:", err);
      return api.sendMessage("Đã xảy ra lỗi khi xử lý lệnh checktt.", message.threadId, message.type);
    }
  }
};
