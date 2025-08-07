import { query } from "../App/Database.js";

/**
 * Lấy vai trò (admin = 1, không phải admin = 0) của người dùng
 * @param {string} uid
 * @returns {Promise<number>}
 */
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
