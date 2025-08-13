// author @GwenDev
import cron from "node-cron";
import { query } from "../../App/Database.js";
import { ThreadType } from "zca-js";

async function sendTopTuan(api) {
  const users = await query(`SELECT uid, name, tuongtac, tuongtactuan FROM users`);
  const groups = await query(`SELECT thread_id, name FROM groups`);

  if (!users.length || !groups.length) return;

  for (const group of groups) {
    const list = [];

    for (const user of users) {
      let parsed;
      try {
        parsed = JSON.parse(user.tuongtac || "[]");
      } catch {
        continue;
      }

      const match = parsed.find(i => i.threadId === group.thread_id);
      if (match && user.tuongtactuan > 0) {
        list.push({ name: user.name || "Không rõ", count: user.tuongtactuan });
      }
    }

    if (!list.length) continue;

    const sorted = list.sort((a, b) => b.count - a.count).slice(0, 10);
    const lines = [
      `╭─────「 TOP TUẦN – ${group.name} 」─────⭓`
    ];
    sorted.forEach((u, i) => {
      lines.push(`│ ${i + 1}. ${u.name} – ${u.count} Tin Nhắn`);
    });
    lines.push("╰────────────────────────────────────⭓");

    try {
      await api.sendMessage({ msg: lines.join("\n"), ttl: 18_000_000 }, group.thread_id, ThreadType.Group);
    } catch (err) {
    }
  }
}

export function startTopTuan(api) {
  cron.schedule("00 00 * * *", () => sendTopTuan(api)); 
  cron.schedule("00 00 * * 1", async () => {
    await query(`UPDATE users SET tuongtactuan = 0`);
  });
}
