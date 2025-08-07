import { query } from "../App/Database.js";
import { Logger, log } from "../Utils/Logger.js";

/**
 * Lưu hoặc cập nhật tên nhóm nếu thay đổi
 * @param {string} threadId
 * @param {string} name
 */
export async function group(threadId, name) {
    if (!threadId || !name) return;

    const result = await query(`SELECT name FROM groups WHERE thread_id = ? LIMIT 1`, [threadId]);

    if (result.length === 0) {
        await query(`INSERT INTO groups (thread_id, name) VALUES (?, ?)`, [threadId, name]);
        log(`[ZALO] New Group: ${name} (${threadId})`, "new");
    } else if (result[0].name !== name) {
        await query(`UPDATE groups SET name = ? WHERE thread_id = ?`, [name, threadId]);
        log(`[ZALO] New Name Group: ${name} (${threadId})`, "new");
    }
}
