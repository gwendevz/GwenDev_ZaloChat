// author @GwenDev
import cron from "node-cron";
import fs from "fs";
import path from "path";
import { query } from "../../App/Database.js";
import { ThreadType } from "zca-js";
import { log } from "../../Utils/Logger.js";
const CONFIG_PATH = path.join("App", "AutoSend.json");
const ATTACH_DIR = path.join("Data", "AutoSend");
function readAutoSendConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return [];
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

async function getEnabledAutoSendThreads() {
  const rows = await query("SELECT status, thread FROM settings WHERE cmd = 'autosend' LIMIT 1");
  const result = [];

  if (!rows.length) return result;

  const { status, thread } = rows[0];
  let list = [];
  try {
    list = thread ? JSON.parse(thread) : [];
  } catch (err) {
  }

  const custom = new Map(list.map(([id, , state]) => [id, state]));
  const allThreads = await query("SELECT thread_id FROM groups");

  for (const { thread_id } of allThreads) {
    const state = custom.has(thread_id) ? custom.get(thread_id) : (status === 1 ? "on" : "off");
    if (state === "on") result.push(thread_id);
  }

  return result;
}

export function startAutoSend(api) {
  cron.schedule("* * * * *", async () => {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); 
    const configs = readAutoSendConfig();
    const matching = configs.filter(cfg => cfg.time === currentTime);
    if (!matching.length) return;

    const threads = await getEnabledAutoSendThreads();
    if (!threads.length) return;

    for (const cfg of matching) {
      const { content, attachments = [] } = cfg;

      const files = [];
      for (const name of attachments) {
        const filePath = path.join(ATTACH_DIR, name);
        if (fs.existsSync(filePath)) files.push(filePath);
      }

      for (const threadId of threads) {
        try {
          await api.sendMessage({
            msg: content,
            ttl: 600_000
          }, threadId, ThreadType.Group);

        } catch (err) {
        }
      }
    }
  });
}
