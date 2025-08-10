// author @GwenDev
import express from "express";
import { checkPaymentStatus } from "../Utils/checkPaymentStatus.js";

const router = express.Router();

router.post("/check_payment_status", async (req, res) => {
  try {
    const { order_id } = req.body;
    const status = await checkPaymentStatus(order_id);
    res.json({ payment_status: status });
  } catch (err) {
    console.error("[CHECK_PAYMENT] Lỗi:", err.message);
    res.status(400).json({ error: err.message });
  }
});

export default router;
