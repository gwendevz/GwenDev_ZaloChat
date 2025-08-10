// author @GwenDev
import express from "express";
import { query } from "../App/Database.js";
import { getApiInstance } from "../App/BotInstance.js";
import { TextStyle, Urgency } from "zca-js";
import { Logger, log } from "../Utils/Logger.js";
const router = express.Router();

router.post("/sepay_webhook", async (req, res) => {
  try {
    const data = req.body;

    if (!data || typeof data !== "object") {
      return res.json({ success: false, message: "No data found!" });
    }

    const {
      gateway,
      transactionDate,
      accountNumber,
      subAccount,
      transferType,
      transferAmount,
      accumulated,
      code,
      content: transactionContent,
      referenceCode,
      description: body,
    } = data;

    const amountIn = transferType === "in" ? transferAmount : 0;
    const amountOut = transferType === "out" ? transferAmount : 0;

    log("[SEPAY] GiaoDich New:", "url");

    await query(`
      INSERT INTO tb_transactions 
      (gateway, transaction_date, account_number, sub_account, amount_in, amount_out, accumulated, code, transaction_content, reference_number, body)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      gateway, transactionDate, accountNumber, subAccount,
      amountIn, amountOut, accumulated, code,
      transactionContent, referenceCode, body
    ]);

    const match = transactionContent.match(/DH(\d+)/i);
    if (!match) {
      return res.json({ success: false, message: "Không tìm thấy mã đơn hàng trong nội dung." });
    }

    const pay_order_id = match[1];

    const orders = await query(
      "SELECT * FROM tb_orders WHERE id = ? AND total = ? AND payment_status = 'Unpaid'",
      [pay_order_id, amountIn]
    );

    if (orders.length === 0) {
      return res.json({ success: false, message: "Không tìm thấy đơn hàng khớp." });
    }

    const order = orders[0];
 await query("UPDATE tb_orders SET payment_status = 'Paid' WHERE id = ?", [pay_order_id]);
log(`[SEPAY]  Đơn Hàng: DH${pay_order_id} | Chuyển Khoản Thành Công`);

await query(
  "UPDATE users SET vnd = vnd + ? WHERE uid = ?",
  [amountIn, order.uid]
);
log(`[SEPAY]  Đã Cộng: ${amountIn} VND | UID ${order.uid}.`);

    const api = getApiInstance();
    if (api && order.uid) {
      const notifyText = `THANH TOÁN THÀNH CÔNG`;

      await api.sendMessage(
        {
          msg: `${notifyText}\nSố Tiền Nhận: ${amountIn.toLocaleString()} VND\nCảm Ơn Vì Sự Ủng Hộ Của Qúy Khách/n Hãy Chat 'xem số dư' Để Kiểm Tra Số Dư Hiện Tại     `,
          urgency: Urgency.Important,
          styles: [
            { start: 0, len: notifyText.length, st: TextStyle.Bold },
            { start: 0, len: notifyText.length, st: TextStyle.Green },
            { start: 0, len: notifyText.length, st: TextStyle.Big },
          ],
        },
        order.uid
      );
    }

    return res.json({ success: true, message: "Cập nhật và thông báo thành công!" });

  } catch (err) {
    console.error("[WEBHOOK] Lỗi xử lý:", err);
    return res.status(500).json({ success: false, message: "Lỗi xử lý webhook." });
  }
});

export default router;
