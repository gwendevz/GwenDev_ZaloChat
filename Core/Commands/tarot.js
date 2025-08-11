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
      // Lấy dữ liệu tarot từ API
      const response = await axios.get('https://raw.githubusercontent.com/ThanhAli-Official/tarot/main/data.json');
      const tarotData = response.data;
      
      if (!tarotData || !Array.isArray(tarotData)) {
        return api.sendMessage("❌ Không thể lấy dữ liệu tarot từ hệ thống!", threadId, threadType);
      }
      
      let selectedIndex;
      
      // Xử lý tham số
      if (args.length > 0) {
        const inputIndex = parseInt(args[0]);
        
        if (isNaN(inputIndex)) {
          return api.sendMessage("❌ Vui lòng nhập số thứ tự lá bài hợp lệ!", threadId, threadType);
        }
        
        if (inputIndex < 1 || inputIndex > tarotData.length) {
          return api.sendMessage(`⚠️ Không thể vượt quá số bài đang có trong hệ thống dữ liệu (1-${tarotData.length})`, threadId, threadType);
        }
        
        selectedIndex = inputIndex - 1; // Chuyển về index 0-based
      } else {
        // Chọn ngẫu nhiên nếu không có tham số
        selectedIndex = Math.floor(Math.random() * tarotData.length);
      }
      
      const selectedCard = tarotData[selectedIndex];
      
      if (!selectedCard) {
        return api.sendMessage("❌ Không thể lấy thông tin lá bài!", threadId, threadType);
      }
      
      const cardInfo = `🎴 BÓI BÀI TAROT 🎴\n\n📝 Tên lá bài: ${selectedCard.name}\n✏️ Thuộc bộ: ${selectedCard.suite}\n✴️ Mô tả: ${selectedCard.vi?.description || "Không có mô tả"}\n🏷️ Diễn dịch: ${selectedCard.vi?.interpretation || "Không có diễn dịch"}\n📜 Bài ngược: ${selectedCard.vi?.reversed || "Không có thông tin bài ngược"}`;
      
      try {
        const imageResponse = await axios.get(selectedCard.image, {
          responseType: "stream"
        });
        
        // Tạo file tạm thời
        const tempDir = path.join(__dirname, "../../Temp");
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const tempFileName = `tarot_${Date.now()}.jpg`;
        const tempFilePath = path.join(tempDir, tempFileName);
        
        // Lưu stream vào file
        const writer = fs.createWriteStream(tempFilePath);
        imageResponse.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });
        
        // Gửi message với hình ảnh
        const result = await api.sendMessage({
          msg: cardInfo,
          attachments: [tempFilePath]
        }, threadId, threadType);
        
        // Xóa file tạm sau 5 giây
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
        
        // Nếu không lấy được hình, chỉ gửi text
        return api.sendMessage(cardInfo, threadId, threadType);
      }
      
    } catch (error) {
      console.error("Lỗi trong lệnh tarot:", error);
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return api.sendMessage("❌ Không thể kết nối đến hệ thống tarot. Vui lòng thử lại sau!", threadId, threadType);
      }
      
      if (error.response?.status === 404) {
        return api.sendMessage("❌ Không tìm thấy dữ liệu tarot. Hệ thống có thể đang bảo trì!", threadId, threadType);
      }
      
      return api.sendMessage("❌ Có lỗi xảy ra khi bói bài tarot. Vui lòng thử lại sau!", threadId, threadType);
    }
  }
};
