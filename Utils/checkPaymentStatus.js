// author @GwenDev
import { query } from "../App/Database.js";

export async function checkPaymentStatus(orderId) {
  if (!orderId || isNaN(orderId)) throw new Error("order_id không hợp lệ");

  const rows = await query("SELECT payment_status FROM tb_orders WHERE id = ?", [orderId]);
  if (rows.length === 0) return "order_not_found";
  return rows[0].payment_status || "Unpaid";
}
