// author @GwenDev
import { query } from "../../App/Database.js";

export default {
  name: "thuebot",
  description: "lượt dùng bot",
  cooldown: 5,
  group: "system",
  role: 0,

  async run({ message, api, args }) {
    const threadId = message.threadId;
    const uid = message.data?.uidFrom;
    const name = message.data?.senderName || "Không rõ";
    const type = message.type;
    const now = new Date();

    const gois = {
      1: { name: "Gwen_01", luot: 100, price: 10000 },
      2: { name: "Gwen_02", luot: 500, price: 20000 },
      3: { name: "Gwen_03", luot: 1000, price: 30000 },
      4: { name: "Gwen_04", luot: 1500, price: 50000 },
      5: { name: "Gwen_05", luot: 5000, price: 100000 },
    };

    if (args[0] === "status") {
      const [group] = await query("SELECT luotdung FROM groups WHERE thread_id = ?", [threadId]);

      const luot = group?.luotdung ?? 0;
      return api.sendMessage(
        `📊 Trạng Thái Nhóm\n• Lượt dùng còn lại: ${luot.toLocaleString()} lượt`,
        threadId,
        type
      );
    }
    if (!args[0]) {
      return api.sendMessage(
        `⚙️ 𝐇𝐚̃𝐲 𝐋𝐮̛̣𝐚 𝐂𝐡𝐨̣𝐧 𝐆𝐨́𝐢 𝐃𝐢̣𝐜𝐡 𝐕𝐮̣ 𝐏𝐡𝐮̀ 𝐇𝐨̛̣𝐩\n` +
        `1. Gwen_01: 10.000 VND\n• 100 Lượt Dùng Bot\n\n` +
        `2. Gwen_02: 20.000 VND\n• 500 Lượt Dùng Bot\n\n` +
        `3. Gwen_03: 30.000 VND\n• 1000 Lượt Dùng Bot\n\n` +
        `4. Gwen_04: 50.000 VND\n• 1500 Lượt Dùng Bot\n\n` +
        `5. Gwen_05: 100.000 VND\n• 5000 Lượt Dùng Bot\n` +
        `⋆──────────────────⋆\n` +
        `.thuebot <số_gói>: mua lượt dùng cho nhóm\n` +
        `.thuebot status: kiểm tra lượt dùng của nhóm`,
        threadId,
        type
      );
    }

    const goi = parseInt(args[0]);
    const selected = gois[goi];

    if (!selected) {
      return api.sendMessage(
        "lựa chọn không hợp lệ",
        threadId,
        type
      );
    }

    const [user] = await query("SELECT vnd FROM users WHERE uid = ?", [uid]);
    if (!user || user.vnd < selected.price) {
      return api.sendMessage(
        `Số dư hiện tại không đủ. vui lòng nhắn tin riêng với bot để nạp tiền`,
        threadId,
        type
      );
    }

    await query("UPDATE users SET vnd = vnd - ? WHERE uid = ?", [selected.price, uid]);

    const [group] = await query("SELECT thread_id FROM groups WHERE thread_id = ?", [threadId]);

    if (!group) {
      await query(
        "INSERT INTO groups (thread_id, name, luotdung, time) VALUES (?, ?, ?, ?)",
        [threadId, name, selected.luot, now]
      );
    } else {
      await query(
        "UPDATE groups SET luotdung = luotdung + ?, time = ? WHERE thread_id = ?",
        [selected.luot, now, threadId]
      );
    }

    return api.sendMessage(
      ` ⚙️ 𝐓𝐡𝐮𝐞̂ 𝐁𝐨𝐭 𝐓𝐡𝐚̀𝐧𝐡 𝐂𝐨̂𝐧𝐠\n` +
      `• 𝐆𝐨́𝐢: ${selected.name} (${selected.luot.toLocaleString()} Lượt)\n` +
      `• 𝐒𝐨̂́ 𝐓𝐢𝐞̂̀𝐧: ${selected.price.toLocaleString()}đ\n` +
      `• 𝐒𝐭𝐚𝐭𝐮𝐬: Mua Lượt Dùng Thành Công.`,
      threadId,
      type
    );
  },
};
