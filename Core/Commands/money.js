import { query } from "../../App/Database.js";

export default {
  name: "money",
  description: "Xem số dư và chuyển tiền cho người khác",
  cooldown: 5,
role: 0,
  async run({ message, api, args }) {
    const mentions = message.data?.mentions || [];
    const threadId = message.threadId;
    const type = message.type;
    const senderUid = message.data?.uidFrom;

    const sub = args[0]?.toLowerCase();

    if (sub === "pay") {
      if (mentions.length === 0 || args.length < 3) {
        return api.sendMessage("Cú pháp: .money pay @tag <số tiền>", threadId, type);
      }

      const targetUser = mentions[0];
      const amount = parseInt(args[2]);

      if (isNaN(amount) || amount <= 0) {
        return api.sendMessage("Số tiền không hợp lệ.", threadId, type);
      }
      const [sender] = await query("SELECT vnd FROM users WHERE uid = ?", [senderUid]);
      if (!sender || sender.vnd < amount) {
        return api.sendMessage("Bạn không đủ số dư để chuyển.", threadId, type);
      }

      await query("UPDATE users SET vnd = vnd - ? WHERE uid = ?", [amount, senderUid]);
      await query(
        "INSERT INTO users (uid, name, vnd) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE vnd = vnd + ?",
        [targetUser.uid, targetUser.dName || "Không rõ", amount, amount]
      );

      return api.sendMessage(
        ` Bạn đã chuyển ${amount.toLocaleString()}đ cho ${targetUser.dName || "người nhận"}.`,
        threadId,
        type
      );
    }

    if (mentions.length > 0) {
      const targetUser = mentions[0];
      const [user] = await query("SELECT vnd FROM users WHERE uid = ?", [targetUser.uid]);

      const balance = user?.vnd || 0;
      return api.sendMessage(
        `💰 Số dư của ${targetUser.dName || "người dùng"}: ${balance.toLocaleString()}đ`,
        threadId,
        type
      );
    }

    const [self] = await query("SELECT vnd FROM users WHERE uid = ?", [senderUid]);
    const balance = self?.vnd || 0;

    return api.sendMessage(
      `💰 Số dư của bạn: ${balance.toLocaleString()}đ`,
      threadId,
      type
    );
  }
};
