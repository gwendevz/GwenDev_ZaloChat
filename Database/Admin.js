// author @GwenDev
import { query } from "../App/Database.js";


export async function role(uid) {
  if (!uid) return 0;

  try {
    const result = await query(`SELECT admin FROM users WHERE uid = ? LIMIT 1`, [uid]);
    if (result.length === 0) return 0;
    return result[0].admin || 0;
  } catch (error) {
    console.error(`[ERROR] role:`, error);
    return 0;
  }
}
