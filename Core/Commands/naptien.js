import { query } from "../../App/Database.js";
import fs from "fs/promises";
import path from "path";
import fetch from "node-fetch";
import { ThreadType } from "zca-js";
import { Logger, log } from "../../Utils/Logger.js";
export default {
  name: "naptien",
  aliases: ["nap"],
  group: "system",
  noPrefix: false, 
  async run({ message, api }) {
    if (message.type !== ThreadType.User) {
      return api.sendMessage("vui lòng nhắn tin với bot để dùng lệnh nahh", message.threadId, message.type);
    }

    const text = message.data?.content?.trim();
    const match = text?.match(/^\.naptien\s+(\d{4,10})$/i);
    if (!match) {
      return api.sendMessage("Sai cú pháp. Dùng: `.naptien <số tiền>` (ví dụ: `.naptien 20000`)", message.threadId, message.type);
    }
const amount = parseInt(match[1]);
if (amount < 10000 || amount > 1000000) {
  return api.sendMessage(
    "Số tiền phải từ 10.000đ đến 1.000.000đ.",
    message.threadId,
    message.type
  );
}
  const uid = message.data?.uidFrom
    log(`[SEPAY] Callback to UID: ${uid}, | Money: ${amount}`,"url");
    const users = await query("SELECT * FROM users WHERE uid = ?", [uid]);
    if (users.length === 0) {
      return api.sendMessage("Không tìm thấy tài khoản của bạn.", message.threadId, message.type);
    }

    const result = await query("INSERT INTO tb_orders (total, uid) VALUES (?, ?)", [amount, uid]);
    const orderId = result.insertId;
 log(`[SEPAY] New Order to UID: DH${orderId}, | Money: ${amount}`,"url");

    const qrUrl = `https://qr.sepay.vn/img?bank=MBBank&acc=888310106&template=compact&amount=${amount}&des=DH${orderId}`;
    const qrImage = await fetch(qrUrl);
    const buffer = await qrImage.arrayBuffer();

    const qrDir = path.resolve("./Data/Cache/NapTien");
    await fs.mkdir(qrDir, { recursive: true });
    const filePath = path.join(qrDir, `qr_${orderId}.png`);
    await fs.writeFile(filePath, Buffer.from(buffer));

    const lines = [
  "𝐓𝐡𝐨̂𝐧𝐠 𝐓𝐢𝐧 𝐍𝐚̣𝐩 𝐓𝐢𝐞̂̀𝐧 𝐆𝐰𝐞𝐧𝐃𝐞𝐯",
  `💵 𝐒𝐨̂́ 𝐓𝐢𝐞̂̀𝐧: ${amount.toLocaleString()}đ`,
  `🏦 𝐍𝐠𝐚̂𝐧 𝐇𝐚̀𝐧𝐠: MBBank`,
  `👤 𝐂𝐡𝐮̉ 𝐓𝐚̀𝐢 𝐊𝐡𝐨𝐚̉𝐧: Trần Anh Đức`,
  `💳 𝐒𝐨̂́ 𝐓𝐡𝐞̉: 888310106`,
  `📄 𝐍𝐨̣̂𝐢 𝐃𝐮𝐧𝐠: DH${orderId}`,
  `⚠️ 𝐋𝐮̛𝐮 𝐘́: Chuyển Đúng Nội Dung Và Số Tiền`,
  `🕓 𝐇𝐢𝐞̣̂𝐮 𝐋𝐮̛̣𝐜: 10P`
];
    await api.sendMessage(
      {
        msg: lines.join("\n"),
        attachments: [filePath],
        ttl: 600_000
      },
      message.threadId,
      message.type
    );
  }
};
