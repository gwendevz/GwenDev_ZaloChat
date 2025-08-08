export default {
  name: "ping",
  description: "Trả về pong kèm thời gian phản hồi!",
  role: 2,
  cooldown: 0,
  group: "admin",
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

   
    await api.sendMessage(
      {
        msg: "Đang đo ping...",
        ttl: 2000
      },
      threadId,
      threadType
    );

    const ping = Date.now() - start;

    
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
