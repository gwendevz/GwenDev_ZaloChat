// author @GwenDev
import { query } from "../App/Database.js";
import { Logger, log } from "../Utils/Logger.js";

export async function user(uid, name, threadId, threadName) {
  const [current] = await query(`SELECT * FROM users WHERE uid = ? LIMIT 1`, [uid]);

  if (!current) {
    const data = [{ tuongtac: 1, threadId, name: threadName }];
    await query(
      `INSERT INTO users (uid, name, tuongtac, thread_id, thread_name, tuongtactuan, tuongtacthang)
       VALUES (?, ?, ?, ?, ?, 1, 1)`,
      [uid, name, JSON.stringify(data), threadId, threadName]
    );

    log(`[ZALO] New User: ${name} (${uid})`, "new");
    return true;
  }

  if (current.ban === 1) return false;

  let data;
  try {
    const parsed = JSON.parse(current.tuongtac || "[]");
    data = Array.isArray(parsed) ? parsed : [];
  } catch {
    data = [];
  }

  const index = data.findIndex(d => d.threadId === threadId);
  if (index === -1) {
    data.push({ tuongtac: 1, threadId, name: threadName });
  } else {
    data[index].tuongtac += 1;
   
  }

  await query(
    `UPDATE users SET tuongtac = ?, tuongtactuan = tuongtactuan + 1, tuongtacthang = tuongtacthang + 1
     WHERE uid = ?`,
    [JSON.stringify(data), uid]
  );

  return true;
}

export async function userBatch(users, threadId, threadName) {
  const [rows] = await query(`SELECT uid, tuongtac FROM users`);
  const existingMap = new Map();

  if (Array.isArray(rows)) {
    for (const row of rows) {
      existingMap.set(row.uid, row.tuongtac);
    }
  }

  for (const { uid, name } of users) {
    const tuongtac = existingMap.get(uid);
    if (!tuongtac) {
      await user(uid, name, threadId, threadName);
      continue;
    }

    let threads;
    try {
      const parsed = JSON.parse(tuongtac || "[]");
      threads = Array.isArray(parsed) ? parsed : [];
    } catch {
      threads = [];
    }

    const already = threads.some(t => t.threadId === threadId);
    if (!already) {
      await user(uid, name, threadId, threadName);
    }
  }
}

export async function findUserByNameInThread(threadId, keyword) {
  const rows = await query(`SELECT uid, name, tuongtac FROM users`);

  const removeVietnamese = str =>
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const keywordNorm = removeVietnamese(keyword);
  if (!Array.isArray(rows)) return null;

  for (const row of rows) {
    const nameNorm = removeVietnamese(row.name || "");
    if (!nameNorm.includes(keywordNorm)) continue;

    try {
      const threads = JSON.parse(row.tuongtac || "[]");
      const hasInteracted = threads.some(t => t.threadId === threadId);
      if (hasInteracted) return row;
    } catch {}
  }

  return null;
}
