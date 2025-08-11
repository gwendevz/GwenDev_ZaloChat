// author @GwenDev
import { query } from "../../App/Database.js";

export default {
  name: "money",
  description: "Xem số dư và chuyển tiền cho người khác",
  cooldown: 5,
  group: "system",
  role: 0,
  async run({ message, api, args }) {
    const mentions = message.data?.mentions || [];
    const threadId = message.threadId;
    const type = message.type;
    const senderUid = message.data?.uidFrom;

    const [userExists] = await query("SELECT uid FROM users WHERE uid = ?", [senderUid]);
    if (!userExists) {
      return api.sendMessage("Bạn chưa có tài khoản trong hệ thống. Vui lòng tương tác với bot trước.", threadId, type);
    }

    const sub = args[0]?.toLowerCase();

    if (sub === "pay") {
   
      if (mentions.length === 0 || args.length < 2) {
        return api.sendMessage("Cú pháp: .money pay @tag <số tiền>", threadId, type);
      }

      const targetUser = mentions[0];
     
      const amount = parseInt(args[args.length - 1]);
      
  
      const fullName = args.slice(1, -1).join(' ').replace(/^@/, '');
     
      if (isNaN(amount) || amount <= 0) {
        return api.sendMessage("Số tiền không hợp lệ.", threadId, type);
      }
      
      const [receiver] = await query("SELECT uid, name FROM users WHERE uid = ?", [targetUser.uid]);
      if (!receiver) {
        return api.sendMessage("Người nhận chưa có tài khoản trong hệ thống. Không thể chuyển tiền.", threadId, type);
      }
     const [sender] = await query("SELECT coins FROM users WHERE uid = ?", [senderUid]);
      
      if (!sender || sender.coins < amount) {
        return api.sendMessage("Bạn không đủ coins để chuyển.", threadId, type);
      }

      await query("UPDATE users SET coins = coins - ? WHERE uid = ?", [amount, senderUid]);
     
      await query(
        "UPDATE users SET coins = coins + ? WHERE uid = ?",
        [amount, targetUser.uid]
      );
    return api.sendMessage(
        `💸 Chuyển Thành Công: ${amount.toLocaleString()} Coins\n Gửi Tới: ${receiver.name}.`,
        threadId,
        type
      );
    }

    if (mentions.length > 0) {
      const targetUser = mentions[0];
      

      const [user] = await query("SELECT vnd, coins FROM users WHERE uid = ?", [targetUser.uid]);
      if (!user) {
        return api.sendMessage("Người dùng này chưa có tài khoản trong hệ thống.", threadId, type);
      }

      const vndBalance = user.vnd || 0;
      const coinsBalance = user.coins || 0;
      
      return api.sendMessage(
        `User: ${targetUser.dName || "người dùng"}:\n💵 VND: ${vndBalance.toLocaleString()}đ\n💎 Coins Bot: ${coinsBalance.toLocaleString()}$`,
        threadId,
        type
      );
    }

    const [self] = await query("SELECT vnd, coins FROM users WHERE uid = ?", [senderUid]);
    const vndBalance = self?.vnd || 0;
    const coinsBalance = self?.coins || 0;

    return api.sendMessage(
      `💵 VND: ${vndBalance.toLocaleString()}đ\n💎 Coins Bot: ${coinsBalance.toLocaleString()}$`,
      threadId,
      type
    );
  }
};
