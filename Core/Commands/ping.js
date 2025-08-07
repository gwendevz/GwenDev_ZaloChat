export default {
  name: "ping",
  description: "Trả về pong kèm thời gian phản hồi!",
  role: 2,
  cooldown: 0,
  aliases: [
    "ping của bot đây",
    "bot ơi ping đi",
    "ping đâu",
    "test ping"
  ],
  noPrefix: true,

  async run({ message, api }) {
    const threadId = message.threadId;
    const threadType = message.type;

    const start = Date.now();

    // Gửi tin đầu tiên, biến mất sau 3 giây
    await api.sendMessage(
      {
        msg: "Đang đo ping...",
        ttl: 2000
      },
      threadId,
      threadType
    );

    const ping = Date.now() - start;

    // Gửi tin kết quả, biến mất sau 30 giây
    await api.sendMessage(
      {
        msg: `🏓 Pong!\n⏱️ Ping: ${ping}ms`,
        ttl: 30000
      },
      threadId,
      threadType
    );
  }
};
