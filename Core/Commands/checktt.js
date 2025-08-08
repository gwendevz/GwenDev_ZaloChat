import { query } from "../../App/Database.js";

export default {
  name: "checktt",
  description: "Xem tương tác cá nhân hoặc top tương tác.",
  role: 0,
  cooldown: 10,
group: "group",
  async run({ message, api, args }) {
    try {
      const threadId = message.threadId;
      let threadName = "Không rõ";

      try {
        const groupInfo = await api.getGroupInfo(threadId);
        const info = groupInfo.gridInfoMap?.[threadId];
        threadName = info?.name || "Không rõ";
      } catch (e) {
        console.warn("[checktt] Không thể lấy tên nhóm:", e.message);
      }

      const mentions = message.data.mentions || [];
      const senderId = message.data.uidFrom;
      const senderName = message.data.dName || "Không rõ";
      const subCommand = args[0]?.toLowerCase();

      if (!subCommand || mentions.length > 0) {
        const targetId = mentions.length > 0 ? mentions[0].uid : senderId;
        const targetName = mentions.length > 0
          ? Object.values(mentions)[0].tag || "Không rõ"
          : senderName;

        const [target] = await query(`SELECT tuongtac FROM users WHERE uid = ? LIMIT 1`, [targetId]);
        if (!target) {
          return api.sendMessage(`Không có dữ liệu tương tác cho "${targetName}"`, threadId, message.type);
        }

        let data;
        try {
          const parsed = JSON.parse(target.tuongtac || "[]");
          data = Array.isArray(parsed) ? parsed : [];
        } catch {
          data = [];
        }

        const item = data.find(i => i.threadId === threadId);
        const total = item?.tuongtac || 0;

        const lines = [
          "╭─────「 TƯƠNG TÁC NGƯỜI DÙNG 」─────⭓",
          `│ 👤 Tên: ${targetName}`,
          `│ 🧵 Nhóm: ${threadName}`,
          `│ 💬 Tin nhắn: ${total}`,
          "╰────────────────────────────────⭓"
        ];

        return api.sendMessage({
          msg: lines.join("\n"),
          quoteId: message.msgId,
          mentions: mentions.length > 0
            ? [{ uid: targetId, pos: lines[1].indexOf(":") + 2, len: targetName.length }]
            : []
        }, threadId, message.type);
      }

     
      if (subCommand === "box") {
        const rows = await query(`SELECT name, uid, tuongtac FROM users`);
        const boxList = [];

        for (const row of rows) {
          let threads;
          try {
            threads = JSON.parse(row.tuongtac || "[]");
            const item = threads.find(i => i.threadId === threadId);
            if (item) {
              boxList.push({
                name: row.name || "Không rõ",
                uid: row.uid,
                count: item.tuongtac || 0
              });
            }
          } catch {}
        }

        const sorted = boxList.sort((a, b) => b.count - a.count).slice(0, 10);
        if (sorted.length === 0) {
          return api.sendMessage("Không có dữ liệu tương tác trong nhóm này.", threadId, message.type);
        }

        const lines = ["╭─────「 TOP 10 TƯƠNG TÁC NHÓM 」─────⭓"];
        sorted.forEach((u, i) => {
          lines.push(`│ ${i + 1}. ${u.name} – ${u.count} Tin Nhắn`);
        });
        lines.push("╰────────────────────────────────⭓");

        return api.sendMessage({ msg: lines.join("\n"), quoteId: message.msgId }, threadId, message.type);
      }

     
      if (subCommand === "server") {
        const rows = await query(`SELECT name, uid, tuongtac FROM users`);
        const globalList = [];

        for (const row of rows) {
          let threads;
          try {
            threads = JSON.parse(row.tuongtac || "[]");
            const total = threads.reduce((sum, i) => sum + (i.tuongtac || 0), 0);
            if (total > 0) {
              globalList.push({
                name: row.name || "Không rõ",
                uid: row.uid,
                count: total
              });
            }
          } catch {}
        }

        const sorted = globalList.sort((a, b) => b.count - a.count).slice(0, 10);
        if (sorted.length === 0) {
          return api.sendMessage("Không có dữ liệu tương tác hệ thống.", threadId, message.type);
        }

        const lines = ["╭─────「 TOP 10 TOÀN HỆ THỐNG 」─────⭓"];
        sorted.forEach((u, i) => {
          lines.push(`│ ${i + 1}. ${u.name} – ${u.count} Tin Nhắn`);
        });
        lines.push("╰────────────────────────────────⭓");

        return api.sendMessage({ msg: lines.join("\n"), quoteId: message.msgId }, threadId, message.type);
      }

      return api.sendMessage(
        "Cú pháp không hợp lệ. Dùng: `checktt`, `checktt @tag`, `checktt box`, hoặc `checktt server`.",
        threadId,
        message.type
      );

    } catch (err) {
      console.error("[CHECKTT_COMMAND] Lỗi:", err);
      return api.sendMessage("Đã xảy ra lỗi khi xử lý lệnh checktt.", message.threadId, message.type);
    }
  }
};
