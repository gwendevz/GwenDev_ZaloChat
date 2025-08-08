export default {
  name: "info",
  description: "Hiển thị thông tin người dùng hoặc người được tag.",
  role: 0,
  cooldown: 10,
  group: "group",
  
  aliases: [
    "hãy lấy info người này giúp tôi",
    "hãy lấy info của người này",
    "lấy thông tin người dùng",
    "gwen ơi cho tui info của",
    "thông tin người dùng"
  ],
  noPrefix: true,
  async run({ message, api }) {
    try {
      const mentions = message.data?.mentions || [];
      const targetId = mentions.length > 0
        ? mentions[0].uid
        : message.data?.uidFrom;

      if (!targetId) {
        return api.sendMessage({
          msg: "Không thể xác định người dùng.",
          quoteId: message.data?.msgId
        }, message.threadId, message.type);
      }

      const infoRes = await api.getUserInfo(targetId);
      const info = infoRes?.changed_profiles?.[targetId];

      if (!info) {
        return api.sendMessage({
          msg: "Không tìm thấy thông tin người dùng.",
          quoteId: message.data?.msgId
        }, message.threadId, message.type);
      }

      const lines = [
        "╭─────「 THÔNG TIN NGƯỜI DÙNG 」─────⭓",
        `│ Tên: ${info.displayName || info.zaloName || "Không rõ"}`,
        `│ ID: ${info.userId}`,
        `│ Sinh nhật: ${info.sdob || "Không rõ"}`,
        `│ Số điện thoại: ${info.phoneNumber || "Không có"}`,
        `│ Trực tuyến: ${info.isActive ? "Có" : "Không"}`,
        `│ Active Web: ${info.isActiveWeb ? "Có" : "Không"}`,
        `│ Active PC: ${info.isActivePC ? "Có" : "Không"}`,
        `│ Tạo tài khoản: ${info.createdTs ? new Date(info.createdTs * 1000).toLocaleString() : "Không rõ"}`,
        "╰──────────────────────────────────⭓"
      ];

      return api.sendMessage({
        msg: lines.join("\n"),
        quoteId: message.data?.msgId
      }, message.threadId, message.type);

    } catch (err) {
      console.error("[INFO_COMMAND] Lỗi:", err);
      return api.sendMessage("Đã xảy ra lỗi khi lấy thông tin người dùng.", message.threadId, message.type);
    }
  }
};
