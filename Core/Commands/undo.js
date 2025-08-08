export default {
  name: "undo",
  description: "Gỡ tin nhắn của bot khi reply.",
  role: 0,
  group: "admin",
  cooldown: 10,
  aliases: [
    "gỡ tin nhắn",
    "thu hồi",
    "xóa tin nhắn",
    "undo"
  ],
  noPrefix: true,
  async run({ message, api }) {
    try {
      const quote = message.data?.quote;

      // Phải reply vào tin nhắn để gỡ
      if (!quote || !quote.msgId) {
        return api.sendMessage({
          msg: "Vui lòng reply vào tin nhắn của bot cần gỡ.",
          quoteId: message.data?.msgId
        }, message.threadId, message.type);
      }

      // Gọi API undo tin nhắn
      await api.undo({
        msgId: quote.msgId,
        cliMsgId: quote.cliMsgId // nếu bạn không có cliMsgId thì có thể bỏ phần này
      }, message.threadId, message.type);

      return api.sendMessage({
        msg: "Đã gỡ tin nhắn thành công!",
        quoteId: message.data?.msgId
      }, message.threadId, message.type);

    } catch (err) {
      console.error("[UNDO_COMMAND] Lỗi:", err);
      return api.sendMessage("Đã xảy ra lỗi khi gỡ tin nhắn.", message.threadId, message.type);
    }
  }
};
