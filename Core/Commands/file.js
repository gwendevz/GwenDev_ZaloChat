// author @GwenDev
import fs from "fs";
import path from "path";
import { dangKyReply } from "../../Handlers/HandleReply.js";

export default {
  name: "file",
  description: "Trình duyệt file/folder tương tác bằng reply (open <stt>, back, root).",
  role: 2,
  cooldown: 5,
  group: "system",
  aliases: ["files", "list files", "danh sách file", "thư mục"],
  noPrefix: false,

  async run({ message, api, args }) {
    const threadId = message.threadId;
    const threadType = message.type;
    const startDir = args[0] ? path.resolve(args.join(" ")) : process.cwd();

    if (!fs.existsSync(startDir) || !fs.statSync(startDir).isDirectory()) {
      return api.sendMessage("Đường dẫn không hợp lệ hoặc không phải thư mục.", threadId, threadType);
    }

    function shouldHide(name) {
      return name === ".git" || name.startsWith(".git");
    }

    function formatSize(bytes) {
      if (!Number.isFinite(bytes)) return "-";
      if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
      if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
      return `${bytes} B`;
    }

    function getFolderSize(dirPath) {
      let size = 0;
      try {
        const entries = fs.readdirSync(dirPath);
        for (const entry of entries) {
          if (shouldHide(entry)) continue; 
          const full = path.join(dirPath, entry);
          try {
            const st = fs.statSync(full);
            if (st.isDirectory()) size += getFolderSize(full);
            else size += st.size;
          } catch {}
        }
      } catch {}
      return size;
    }

    await sendListing(startDir, message);

    async function sendListing(dir, srcMessage) {
      try {
        const itemsAll = fs.readdirSync(dir);
        const items = itemsAll.filter(name => !shouldHide(name));
        if (items.length === 0) {
          await api.sendMessage("(Thư mục trống hoặc tất cả mục bị ẩn)", threadId, threadType);
          return;
        }
        let totalSize = 0;
        const lines = items.map((item, idx) => {
          const full = path.join(dir, item);
          const st = fs.statSync(full);
          const isDir = st.isDirectory();
          const sz = isDir ? getFolderSize(full) : st.size;
          totalSize += sz;
          return `${idx + 1}. ${isDir ? "📁" : "📄"} ${item} (${formatSize(sz)})`;
        });
        lines.push(`\nTổng dung lượng: ${formatSize(totalSize)}`);
        lines.push(`Đường dẫn: ${dir}`);
        lines.push("\nHướng dẫn: reply 'open <số>' để mở file/folder, 'del <số>' để xóa, 'back' để về thư mục trước, 'root' trở về gốc.");
        const sent = await api.sendMessage(lines.join("\n"), threadId, threadType);
        const msgId = sent?.message?.msgId ?? sent?.msgId ?? null;
        const cliMsgId = sent?.message?.cliMsgId ?? sent?.cliMsgId ?? null;
        if (msgId || cliMsgId) {
          dangKyReply({
            msgId,
            cliMsgId,
            threadId,
            command: "file_navigator",
            ttlMs: 10 * 60 * 1000,
            data: { currentDir: dir },
            onReply: async ({ message: repMsg, api, content, data }) => {
              const input = String(content).trim().toLowerCase();
              if (input === "back" || input === "..") {
                const parent = path.dirname(data.currentDir);
                return await sendListing(parent, repMsg);
              }
              if (input === "root") {
                return await sendListing(startDir, repMsg);
              }

              const delMatch = input.match(/^del(?:ete)?\s+(\d+)/);
              if (delMatch) {
                const idx = parseInt(delMatch[1], 10) - 1;
                const list = fs.readdirSync(data.currentDir).filter(name => !shouldHide(name));
                if (idx < 0 || idx >= list.length) {
                  await api.sendMessage("Số thứ tự không tồn tại.", threadId, threadType);
                  return { clear: false };
                }
                const name = list[idx];
                if (shouldHide(name)) {
                  await api.sendMessage("Mục này bị ẩn và không thể xóa.", threadId, threadType);
                  return { clear: false };
                }
                const targetPath = path.join(data.currentDir, name);
                try {
                  const st = fs.statSync(targetPath);
                  if (st.isDirectory()) {
                    fs.rmSync(targetPath, { recursive: true, force: true });
                  } else {
                    fs.unlinkSync(targetPath);
                  }
                  await api.sendMessage(`Đã xóa: ${name}`, threadId, threadType);
                } catch (e) {
                  await api.sendMessage(`Không thể xóa: ${name}`, threadId, threadType);
                }
                return await sendListing(data.currentDir, repMsg);
              }

              const match = input.match(/^(open\s+)?(\d+)/);
              if (!match) {
                await api.sendMessage("Cú pháp không hợp lệ. Dùng 'open <số>' hoặc 'del <số>'.", threadId, threadType);
                return { clear: false };
              }
              const idx = parseInt(match[2], 10) - 1;
              const list = fs.readdirSync(data.currentDir).filter(name => !shouldHide(name));
              if (idx < 0 || idx >= list.length) {
                await api.sendMessage("Số thứ tự không tồn tại.", threadId, threadType);
                return { clear: false };
              }
              const targetName = list[idx];
              const targetPath = path.join(data.currentDir, targetName);
              const stat = fs.statSync(targetPath);
              if (stat.isDirectory()) {
                return await sendListing(targetPath, repMsg);
              }
              try {
                await api.sendMessage({ msg: `📄 ${targetName}`, attachments: [targetPath] }, threadId, threadType);
              } catch (e) {
                await api.sendMessage("Không thể gửi file (có thể quá lớn hoặc lỗi).", threadId, threadType);
              }
              return { clear: false };
            },
          });
        }
      } catch (err) {
        console.error("[file cmd] error:", err);
        await api.sendMessage("Đã xảy ra lỗi.", threadId, threadType);
      }
    }
  },
};

