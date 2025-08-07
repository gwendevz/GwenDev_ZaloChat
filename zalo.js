import express from "express";
import bodyParser from "body-parser";
import checkPaymentRouter from "./Routes/checkPaymentRouter.js";
import sepayWebhook from "./Routes/sepayWebhook.js";
import { Zalo } from "zca-js";
import { settings } from "./App/Settings.js";
import { init } from "./Handlers/Core.js";
import { startAutoDown } from "./Auto/AutoDown.js";
import { startAutoSend } from "./Auto/AutoSend.js";
import { startAntiSpam } from "./Anti/AntiSpam.js"; 
import { startAntiLink } from "./Anti/AntiLink.js";
import { Logger, log } from "./Utils/Logger.js";
import { startTopNgay } from "./Auto/TuongTacNgay.js";
import { startTopTuan } from "./Auto/TuongTacTuan.js";
import { startTopThang } from "./Auto/TuongTacThang.js";
import { setApiInstance } from "./App/BotInstance.js";
import { query } from "./App/Database.js"; // <-- Thêm dòng này
import { updatesql } from "./Database/Update.js";

await Logger();
await updatesql();
try {
  const columns = await query(`
    SELECT COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'users' AND COLUMN_NAME IN ('mute', 'mute_expire');
  `);

  const existingCols = columns.map(col => col.COLUMN_NAME);

  if (!existingCols.includes('mute')) {
    await query(`ALTER TABLE users ADD COLUMN mute TINYINT(1) DEFAULT 0`);
    log("[DB] Đã thêm cột 'mute' vào bảng users.", "db");
  }

  if (!existingCols.includes('mute_expire')) {
    await query(`ALTER TABLE users ADD COLUMN mute_expire BIGINT DEFAULT NULL`);
    log("[DB] Đã thêm cột 'mute_expire' vào bảng users.", "db");
  }
} catch (e) {
  log(`[DB] Lỗi khi kiểm tra hoặc thêm cột: ${e.message}`, "error");
}

const zalo = new Zalo({
  selfListen: false,
  checkUpdate: false,
  logging: false
});

try {
  const api = await zalo.login({
    cookie: settings.cookie,
    imei: settings.imei,
    userAgent: settings.userAgent
  });

  init(api);
  startAutoDown(api);
  startAutoSend(api);
  startAntiSpam(api); 
  startAntiLink(api);
  startTopNgay(api);
  startTopTuan(api);
  startTopThang(api);
  setApiInstance(api);

  log("[AUTO] - Settings AutoDown.", "auto");
  log("[AUTO] - Start Top Message.", "auto");
  log("[AUTO] - Settings AutoSend.", "auto");
  log("[ANTI] - Settings AntiSpam.", "auto");
  log("[ANTI] - Settings AntiLink.", "auto");
  log("[CORE] - Settings Core.", "auto");
  log("[SEPAY] - Settings Banking.", "auto");
  log("[API] - Settings Api.", "auto");
  log("[LOGIN] - Settings Login.", "auto");

  const app = express();
  const PORT = process.env.PORT || 80;

  app.use(bodyParser.json());
  app.use("/", checkPaymentRouter);
  app.use("/", sepayWebhook);

  app.listen(PORT, () => {
    log(`[PORT] Client Zalo On Port: ${PORT}`, "new");
  });

} catch (err) {
  log("[LOGIN] - Bot Login Err." + err.message, "error");
}
