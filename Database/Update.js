// TODO auto update sql
import { query } from "../App/Database.js";
import { log } from "../Utils/Logger.js";

export async function updatesql() {
  try {
    const columns = await query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'users' AND COLUMN_NAME IN ('mute', 'mute_expire','tongnap');
    `);

    const existingCols = columns.map(col => col.COLUMN_NAME);

    if (!existingCols.includes('mute')) {
      await query(`ALTER TABLE users ADD COLUMN mute TINYINT(1) DEFAULT 0`);
      log("[DB] add 'mute' vào bảng users.", "db");
    }

    if (!existingCols.includes('mute_expire')) {
      await query(`ALTER TABLE users ADD COLUMN mute_expire BIGINT DEFAULT NULL`);
      log("[DB]  add 'mute_expire' vào bảng users.", "db");
    }

    if (!existingCols.includes('tongnap')) {
      await query(`ALTER TABLE users ADD COLUMN tongnap INT DEFAULT 0`);
      log("[DB] add 'tongnap' vào bảng users.", "db");
    }

  } catch (e) {
    log(`[DB] lỗi bảng users: ${e.message}`, "error");
  }
}