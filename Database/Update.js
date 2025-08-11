// author @GwenDev
import { query } from "../App/Database.js";
import { log } from "../Utils/Logger.js";

export async function updatesql() {
  try {
   
    const userColumns = await query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'users' AND COLUMN_NAME IN ('mute', 'mute_expire','tongnap','caro','coins','work_cooldown','altp_max');
    `);

    const userCols = userColumns.map(col => col.COLUMN_NAME);

    if (!userCols.includes('mute')) {
      await query(`ALTER TABLE users ADD COLUMN mute TINYINT(1) DEFAULT 0`);
      log("[DB] add 'mute' vào bảng users.", "db");
    }

    if (!userCols.includes('mute_expire')) {
      await query(`ALTER TABLE users ADD COLUMN mute_expire BIGINT DEFAULT NULL`);
      log("[DB] add 'mute_expire' vào bảng users.", "db");
    }

    if (!userCols.includes('tongnap')) {
      await query(`ALTER TABLE users ADD COLUMN tongnap INT DEFAULT 0`);
      log("[DB] add 'tongnap' vào bảng users.", "db");
    }

    if (!userCols.includes('caro')) {
      await query(`ALTER TABLE users ADD COLUMN caro INT DEFAULT 0`);
      log("[DB] add 'caro' vào bảng users.", "db");
    }

    if (!userCols.includes('coins')) {
      await query(`ALTER TABLE users ADD COLUMN coins BIGINT DEFAULT 0`);
      log("[DB] add 'coins' vào bảng users.", "db");
    }

    if (!userCols.includes('work_cooldown')) {
      await query(`ALTER TABLE users ADD COLUMN work_cooldown BIGINT DEFAULT NULL`);
      log("[DB] add 'work_cooldown' vào bảng users.", "db");
    }

    if (!userCols.includes('altp_max')) {
      await query(`ALTER TABLE users ADD COLUMN altp_max INT DEFAULT 0`);
      log("[DB] add 'altp_max' vào bảng users.", "db");
    }

    
   const groupCols = await query(`
  SELECT COLUMN_NAME 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'groups' AND COLUMN_NAME IN ('luotdung', 'time');
`);

const existingGroupCols = groupCols.map(col => col.COLUMN_NAME);

if (!existingGroupCols.includes('luotdung')) {
  await query(`ALTER TABLE groups ADD COLUMN luotdung INT DEFAULT 100`);
  log("[DB] add 'luotdung' vào bảng groups.", "db");
}

if (!existingGroupCols.includes('time')) {
  await query(`ALTER TABLE groups ADD COLUMN time TEXT`);
  log("[DB] add 'time' vào bảng groups.", "db");
}
  } catch (e) {
    log(`[DB] lỗi cập nhật SQL: ${e.message}`, "error");
  }
}
