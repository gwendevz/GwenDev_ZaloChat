// author @GwenDev
import { dangKyReply } from "../../Handlers/HandleReply.js";

const dare = [
  "Chụp 1 tấm ảnh gửi vào đây",
  "Để avt người hỏi 1 tuần",
  "Vào FaceBook Của người hỏi Bão Like",
  "Nhắn Tỏ Tình Với crush",
  "Ghi Âm Hát Một Bài Nhạc Bất Kì",
  "Ghi Âm Với Nội Dung Là Yêu người hỏi nhất Nhất",
  "Để hình người hỏi làm avt 1 day",
  "Quay video và nói yêu người hỏi rất nhiều",
  "Ăn một thìa cà phê gia vị bất kì trong bếp",
  "Gửi một tấm ảnh lúc bé của bạn",
  "Gửi một tấm ảnh dìm của bạn",
  "Quay video và nói một câu bất kì với cái lưỡi lè ra trong lúc nói",
  "Đăng một trạng thái dài dòng, vô nghĩa trên Facebook.",
  "Bắt chước một ngôi sao YouTube cho đến khi một người chơi khác đoán được bạn đang thể hiện vai diễn của ai.",
  "Gọi cho một người bạn, giả vờ đó là sinh nhật của họ và hát cho họ nghe Chúc mừng sinh nhật",
  "Chụp một tấm hình với gương mặt gợi cảm",
  "Nhắn tin cho nyc bảo quay lại",
  "Tự vả vào mặt 3 cái",
  "Ghi âm một câu em nhớ anh gửi cho admin",
  "Nhắn tin cho bạn thân và bảo là tao đang nứng",
  "Đặt ngôn ngữ điện thoại di động của bạn thành tiếng Trung",
  "Hôn người bạn cùng giới ngồi cạnh, bất kể vị trí nào đều được.",
  "Gởi tin nhắn cho người bạn bất kỳ: Đi ỉa chung hong? Tui đem giấy rồi nè.",
  "Gửi cho người bạn cùng giới thân thiết nhất một tin nhắn: Tôi thật sự thích cậu lâu lắm rồi",
  "Lấy quần đội lên đầu và chụp hình lại gửi vào đây",
  "Hãy tự dơ cánh tay lên và ngửi nách của bạn",
  "Hãy nhắn tin cho 5 người lạ bất kì"
];

const truth = [
  "Có coi phim người lớn bao giờ chưa?",
  "Hôm nay mặc quần màu gì?",
  "Có thẩm du bao giờ chưa ?",
  "Có quan hệ người lớn bao giờ chưa?",
  "Bị ăn sừng bao nhiêu lần rồi?",
  "Bạn đã bao giờ đi tiểu trong bể bơi chưa?",
  "Bạn đã bao giờ trốn học chưa?",
  "Hôm nay mặc áo ngực màu gì?",
  "Bạn đã ngửi quần lót của mình để kiểm tra xem chúng có bị bẩn không?",
  "Nếu bạn có thể hôn ai đó ngay bây giờ bạn sẽ hôn ai?",
  "Điều kinh tởm nhất mà bạn từng say là gì?",
  "Có cởi đồ khi đi ngủ không?",
  "Có chụp ảnh nude hoặc quay video không",
  "Vị trí yêu thích của bạn trên giường là gì?",
  "Đã đi đá phò bao giờ chưa",
  "Một tháng làm việc đó mấy lần",
  "Khi thẩm du trong đầu nghĩ đến ai?",
  "Có từng có suy nghĩ quan hệ 18+ với ny không?",
  "Lông nách có nhiều không",
  "Thích mặt quần lọt khe hay ren?",
  "Có hay bị nốn lừng đêm khuya không?",
  "Bạn muốn có bao nhiêu đứa trẻ?",
  "Một sự thật đáng xấu hổ mà tôi nên biết về bạn là gì?",
  "Nụ hôn đầu tiên của bạn như thế nào?",
  "Số đo 3 vòng của bạn bao nhiêu",
  "Thích kích thước hay kinh nghiệm trong chuyện xxx",
  "Ăn cứt mũi bao giờ chưa",
  "Có ý định quan hệ với người yêu bao giờ chưa?",
  "Cháo lưỡi bao giờ chưa",
  "Nơi yêu thích của bạn để được hôn?",
  "Bạn còn nhớ nyc không",
  "Bạn có ý định quay lại với nyc không",
  "Bạn có bị hôi nách không",
  "Chia sẽ trải nghiệm lần đầu khi cháo lưỡi với người yêu"
];

export default {
  name: "tod",
  description: "Chơi trò chơi Truth or Dare (Thật hay Thách)",
  version: "1.0.0",
  author: "GwenDev mod by Niiozic",
  group: "game",
  role: 0,
  cooldown: 5,
  aliases: ["truthordare", "thathaythach", "thật hay thách"],
  noPrefix: false,

  async run({ api, message, args }) {
    const { threadId, senderId, type: threadType } = message;
    
    if (args.length > 0) {
      return api.sendMessage("Lệnh này không cần tham số. Hãy sử dụng lệnh không có tham số để bắt đầu chơi.", threadId, threadType);
    }

    try {
      const sentMsg = await api.sendMessage(`🎮 TRUTH OR DARE 🎮\n\nReply tin nhắn này và chọn:\n\n1️⃣ Thách 🐥\n2️⃣ Thật 🐰\n\n⚠️ Có chơi có chịu - Cấm bùm kèo!`, threadId, threadType);
      
     
      const msgId = sentMsg?.message?.msgId ?? sentMsg?.msgId ?? null;
      const cliMsgId = sentMsg?.message?.cliMsgId ?? sentMsg?.cliMsgId ?? null;
      
      if (!msgId) {
       return api.sendMessage(" Có lỗi xảy ra khi khởi tạo trò chơi!", threadId, threadType);
      }
      
      dangKyReply({
        msgId: msgId,
        cliMsgId: cliMsgId,
        threadId: threadId,
        authorId: senderId,
        command: "tod",
        ttlMs: 5 * 60 * 1000, 
        onReply: async ({ message, api, content }) => {
          const choice = String(content || "").trim();
          
          try {
            await api.undo({
              msgId: msgId,
              cliMsgId: cliMsgId || 0
            }, message.threadId, message.type);
            
            switch (choice) {
              case "1":
              case "1️⃣":
              case "thách":
              case "dare":
                const randomDare = dare[Math.floor(Math.random() * dare.length)];
                await api.sendMessage(`🎯 DARE 🐥\n\n${randomDare}`, message.threadId, message.type);
                return { clear: true };
                
              case "2":
              case "2️⃣":
              case "thật":
              case "truth":
                const randomTruth = truth[Math.floor(Math.random() * truth.length)];
                await api.sendMessage(`💭 TRUTH 🐰\n\n${randomTruth}`, message.threadId, message.type);
                return { clear: true };
                
              default:
                const numChoice = parseInt(choice);
                if (isNaN(numChoice)) {
                  await api.sendMessage(" Vui lòng nhập 1 hoặc 2 để chọn!", message.threadId, message.type);
                  return { clear: false };
                }
                if (numChoice < 1 || numChoice > 2) {
                  await api.sendMessage(" Lựa chọn không hợp lệ! Chỉ có thể chọn 1 hoặc 2.", message.threadId, message.type);
                  return { clear: false };
                }
                
                if (numChoice === 1) {
                  const randomDare = dare[Math.floor(Math.random() * dare.length)];
                  await api.sendMessage(`🎯 DARE 🐥\n\n${randomDare}`, message.threadId, message.type);
                  return { clear: true };
                } else {
                  const randomTruth = truth[Math.floor(Math.random() * truth.length)];
                  await api.sendMessage(`💭 TRUTH 🐰\n\n${randomTruth}`, message.threadId, message.type);
                  return { clear: true };
                }
            }
          } catch (error) {
            await api.sendMessage(" Có lỗi xảy ra khi xử lý lựa chọn của bạn!", message.threadId, message.type);
            return { clear: true };
          }
        }
      });
   
    } catch (error) {
       return api.sendMessage(" Có lỗi xảy ra khi khởi tạo trò chơi!", threadId, threadType);
    }
  }
};
