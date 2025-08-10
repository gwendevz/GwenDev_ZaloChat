// author @GwenDev
import { ThreadType } from "zca-js";

export default {
  name: "card",
  description: "Gửi danh thiếp",
  role: 0,
  cooldown: 10,
  group: "group",
  aliases: [
    "hãy làm card với số",
    "hãy làm card",
    "gửi tôi card của"
  ],
  noPrefix: true,
  async run({ message, api }) {
    const { mentions = [], content, uidFrom } = message.data;

    let userId = uidFrom;
    let phoneNumber = null;

    if (mentions.length > 0) {
      userId = mentions[0].uid;
    }
    
    const parts = content.trim().split(/\s+/);
    for (const part of parts) {
      const cleaned = part.replace(/[^\d]/g, ""); 
      if (/^0\d{8,10}$/.test(cleaned)) {
        phoneNumber = cleaned;
        break;
      }
    }

    try {
      const response = await api.sendCard(
        {
          userId,
          phoneNumber,
        },
        message.threadId,
        message.type ?? ThreadType.User
      );

   
    } catch (err) {
      console.error("Lỗi gửi danh thiếp:", err);
      return api.sendMessage("Không thể gửi danh thiếp.", message.threadId, message.type);
    }
  }
};
