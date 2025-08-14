// author @GwenDev
import { ThreadType } from "zca-js";
import { dangKyReply } from "../../Handlers/HandleReply.js";

export default {
  name: "test",
  description: "ỷtytr",
  role: 0,
  cooldown: 0,
  group: "dev",
  aliases: [],
  noPrefix: false,

  async run({ message, api }) {
    const threadId = message.threadId;
    const threadType = message.type ?? ThreadType.User;
    const uid = message.data?.uidFrom;

    const res = await api.sendMessage("1", threadId, threadType);
    const msgId = res?.message?.msgId ?? res?.msgId ?? null;
    const cliMsgId = res?.message?.cliMsgId ?? res?.cliMsgId ?? null;

    dangKyReply({
      msgId,
      cliMsgId,
      threadId,
      authorId: uid,
      command: "test",
      onReply: async ({ message, api, content }) => {
          const text = String(content || "").trim().toLowerCase();
       
        if (text === "ok") {
           await api.sendMessage("done", message.threadId, message.type ?? ThreadType.User);
          return { clear: true };
        }
        
         await api.sendMessage("@taglooxi", message.threadId, message.type ?? ThreadType.User);
        return { clear: false };
      }
    });
  }
};
