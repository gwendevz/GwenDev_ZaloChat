import fs from "fs";
import path from "path";

export default {
  name: "file",
  description: "Hiển thị danh sách file/thư mục hoặc gửi file lệnh cụ thể.",
  version: "1.0.0",
  author: "GwenDev",
  group: "system",
  role: 2, // admin
  cooldown: 10,
  aliases: ["liệt kê file", "danh sách file", "xem thư mục", "files", "danh sách thư mục"],
  noPrefix: true,

  async run({ message, api, args }) {
    try {
      // Nếu người dùng gọi .file [tên]
      if (args.length > 0) {
        const fileName = args[0].toLowerCase();
        const commandPath = path.resolve(`./Core/Commands/${fileName}.js`);

        if (!fs.existsSync(commandPath)) {
          return api.sendMessage(`❌ Không tìm thấy lệnh: ${fileName}`, message.threadId, message.type);
        }

        return api.sendMessage({
          msg: `📦 Tệp lệnh: ${fileName}.js`,
          attachments: [commandPath],
          quote: message
        }, message.threadId, message.type);
      }

      // Nếu không có args → liệt kê toàn bộ thư mục hiện tại
      const dirPath = "./";
      const items = fs.readdirSync(dirPath);
      if (!items.length) {
        return api.sendMessage("Thư mục trống.", message.threadId, message.type);
      }

      let totalSize = 0;
      const lines = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const fullPath = path.join(dirPath, item);
        const stats = fs.statSync(fullPath);

        let size = 0;
        if (stats.isDirectory()) {
          size = getFolderSize(fullPath);
        } else {
          size = stats.size;
        }

        totalSize += size;
        lines.push(`${i + 1}. ${stats.isDirectory() ? "🗂️" : "📄"} - ${item} (${formatSize(size)})`);
      }

      lines.push(`\n📊 Tổng dung lượng: ${formatSize(totalSize)}`);

      return api.sendMessage({
        msg: lines.join("\n"),
        quote: message.data?.msgId
      }, message.threadId, message.type);

    } catch (err) {
      console.error("[FILE_COMMAND] Lỗi:", err);
      return api.sendMessage("❌ Đã xảy ra lỗi khi xử lý yêu cầu.", message.threadId, message.type);
    }

    // --- Helper ---
    function getFolderSize(folderPath) {
      let size = 0;
      const files = fs.readdirSync(folderPath);
      for (const file of files) {
        const fullPath = path.join(folderPath, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          size += getFolderSize(fullPath);
        } else {
          size += stat.size;
        }
      }
      return size;
    }

    function formatSize(bytes) {
      if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
      if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
      return `${bytes} Bytes`;
    }
  }
};

