// author @GwenDev
import cron from "node-cron";
import { query } from "../../App/Database.js";
import { ThreadType } from "zca-js";

async function sendTopNgay(api) {

  const users = await query(`SELECT uid, name, tuongtac FROM users`);
  const groups = await query(`SELECT thread_id, name FROM groups`);

  if (!users.length || !groups.length) {
    return;
  }

  for (const group of groups) {
    const list = [];

    for (const user of users) {
      let parsed;
      try {
        parsed = JSON.parse(user.tuongtac || "[]");
      } catch (err) {
        continue;
      }

      const match = parsed.find(i => i.threadId === group.thread_id);
      if (match && match.tuongtac > 0) {
        list.push({ name: user.name || "Không rõ", count: match.tuongtac });
      }
    }

    if (!list.length) {
      continue;
    }

    const sorted = list.sort((a, b) => b.count - a.count).slice(0, 10);
    const lines = [
      `╭─────「 TOP NGÀY – ${group.name} 」─────⭓`
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

export function startTopNgay(api) {
  cron.schedule("00 00 * * *", () => sendTopNgay(api));
}
