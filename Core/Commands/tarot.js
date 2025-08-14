// author @GwenDev
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  name: "tarot",
  description: "Bói bài tarot - Xem vận mệnh qua các lá bài",
  version: "1.0.0",
  author: "GwenDev mod by Raiku",
  group: "game",
  role: 0,
  cooldown: 5,
  aliases: ["bói bài", "tarot", "xem bói", "bài tarot"],
  noPrefix: false,

  async run({ api, message, args }) {
    const { threadId, type: threadType } = message;
    
    try {
      const response = await axios.get('https://raw.githubusercontent.com/ThanhAli-Official/tarot/main/data.json');
      const tarotData = response.data;
      
      if (!tarotData || !Array.isArray(tarotData)) {
        return api.sendMessage({ msg: "❌ Không thể lấy dữ liệu tarot từ hệ thống!", ttl: 12*60*60_000 }, threadId, threadType);
      }
      
      let selectedIndex;
      
      if (args.length > 0) {
        const inputIndex = parseInt(args[0]);
        
        if (isNaN(inputIndex)) {
          return api.sendMessage({ msg: "❌ Vui lòng nhập số thứ tự lá bài hợp lệ!", ttl: 12*60*60_000 }, threadId, threadType);
        }
        
        if (inputIndex < 1 || inputIndex > tarotData.length) {
          return api.sendMessage({ msg: `⚠️ Không thể vượt quá số bài đang có trong hệ thống dữ liệu (1-${tarotData.length})`, ttl: 12*60*60_000 }, threadId, threadType);
        }
        
        selectedIndex = inputIndex - 1; // Chuyển về index 0-based
      } else {
        selectedIndex = Math.floor(Math.random() * tarotData.length);
      }
      
      const selectedCard = tarotData[selectedIndex];
      
      if (!selectedCard) {
        return api.sendMessage({ msg: "❌ Không thể lấy thông tin lá bài!", ttl: 12*60*60_000 }, threadId, threadType);
      }
      
      const cardInfo = `🎴 BÓI BÀI TAROT 🎴\n\n📝 Tên lá bài: ${selectedCard.name}\n✏️ Thuộc bộ: ${selectedCard.suite}\n✴️ Mô tả: ${selectedCard.vi?.description || "Không có mô tả"}\n🏷️ Diễn dịch: ${selectedCard.vi?.interpretation || "Không có diễn dịch"}\n📜 Bài ngược: ${selectedCard.vi?.reversed || "Không có thông tin bài ngược"}`;
      
      try {
        const imageResponse = await axios.get(selectedCard.image, {
          responseType: "stream"
        });
        
        const tempDir = path.join(__dirname, "../../Temp");
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const tempFileName = `tarot_${Date.now()}.jpg`;
        const tempFilePath = path.join(tempDir, tempFileName);
        
        const writer = fs.createWriteStream(tempFilePath);
        imageResponse.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });
        
        const result = await api.sendMessage({
          msg: cardInfo,
          attachments: [tempFilePath],
          ttl: 12*60*60_000
        }, threadId, threadType);
        
        setTimeout(() => {
          try {
            if (fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
            }
          } catch (err) {
            console.error("Lỗi khi xóa file tạm tarot:", err);
          }
        }, 5000);
        
        return result;
        
      } catch (imageError) {
        console.error("Lỗi khi lấy hình ảnh tarot:", imageError);
        
        return api.sendMessage({ msg: cardInfo, ttl: 12*60*60_000 }, threadId, threadType);
      }
      
    } catch (error) {
      console.error("Lỗi trong lệnh tarot:", error);
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return api.sendMessage({ msg: "❌ Không thể kết nối đến hệ thống tarot. Vui lòng thử lại sau!", ttl: 12*60*60_000 }, threadId, threadType);
      }
      
      if (error.response?.status === 404) {
        return api.sendMessage({ msg: "❌ Không tìm thấy dữ liệu tarot. Hệ thống có thể đang bảo trì!", ttl: 12*60*60_000 }, threadId, threadType);
      }
      
      return api.sendMessage({ msg: "❌ Có lỗi xảy ra khi bói bài tarot. Vui lòng thử lại sau!", ttl: 12*60*60_000 }, threadId, threadType);
    }
  }
};
