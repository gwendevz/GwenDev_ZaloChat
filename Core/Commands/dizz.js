// author @GwenDev
export default {
  name: "dizz",
  description: "Dizz người bạn tag (chỉ dùng trong nhóm, nội dung nhạy cảm)",
  role: 1,
  cooldown: 100,
  group: "group",
  aliases: [],
  noPrefix: false,

  async run({ message, api }) {
    const threadId = message.threadId;
    const threadType = message.type;
    const mentions = message.data?.mentions || [];

    if (!Array.isArray(mentions) || mentions.length === 0) {
      return api.sendMessage("Cần phải tag 1 người bạn muốn dizz.", threadId, threadType);
    }

    const target = mentions[0];
    const uid = String(target?.uid || "");
    const name = target?.dName || uid || "bạn";

    const tag = `@${name}`;
    const send = (text) => api.sendMessage({ msg: text, ttl: 30_000 }, threadId, threadType);
    const sendTag = (text) => {
      try {
        const msg = `${text} ${tag}`;
        const pos = msg.lastIndexOf(tag);
        if (uid) {
          return api.sendMessage({ msg, mentions: [{ pos, len: tag.length, uid }], ttl: 30_000 }, threadId, threadType);
        }
        return api.sendMessage({ msg, ttl: 30_000 }, threadId, threadType);
      } catch {
        return api.sendMessage({ msg: `${text} ${name}`, ttl: 30_000 }, threadId, threadType);
      }
    };

    try {
      sendTag("Ê con đĩ nghe cho rõ lời chuỵ nói nè !");
      setTimeout(() => sendTag("Đã là chim cú mà còn đòi ra vẻ phượng hoàng\nChỉ là thứ chó hoang mà cứ tưởng mình là bà hoàng thiên hạ."), 3000);
      setTimeout(() => sendTag("Đã là đĩ còn ra vẻ tiến sĩ\nĐã xấu lại còn bày kiêu sa, quyền quý\nBên ngoài thì giả nai, bên trong thì giả tạo. Vậy cưng có cái gì là hàng thật không hay toàn hàng fake."), 5000);
      setTimeout(() => sendTag("Thứ chó cỏ nhà quê mà đòi ngang hàng bẹc zê thành phố\nCỏ dại ven đường thì tuổi lồn sánh vai với mây"), 7000);
      setTimeout(() => sendTag("Nước rửa bồn cầu mà đòi so với nước hoa Chanel\nCứt hạng 3 mà cứ tưởng mình là socola loại 1"), 9000);
      setTimeout(() => sendTag("Sinh ra làm phận 2 chân thì đừng nên sống như lũ 4 cẳng."), 12000);
      setTimeout(() => sendTag("Ừ thì tao xấu nhưng kết cấu tao hài hòa còn đỡ hơn mày xấu từ xương chậu xấu ra\nĐến ma còn phải tránh xa khi gặp mày ăn ở bầy hầy mà cứ như sạch sẽ thân hình đầy ghẻ mà cứ tưởng hột xoàn\nĐéo đựơc đàng hoàng mà ra giọng thanh cao\nchơi xấu với tao thì tao cho phắn ra nghĩa địa"), 15000);
      setTimeout(() => sendTag("Mở mồm ra chửi tao là CHÓ văn vẻ méo mó thích gây sóng gió đòi làm khó tao sao ??!\nĐừng nghĩ trình độ cao mà khiến tao lao đao chưa đủ xôn xao đâu con cáo."), 17000);
      setTimeout(() => sendTag("Sống trên đời phải biết mình là ai\nLịch sự thì không có chỉ có cái máu chơi chó thì không ai sánh bằng"), 20000);
      setTimeout(() => sendTag("Nếu đã là Cáo thì đừng tập diễn thành Nai\nCòn nếu đã cố gắng diễn hơp vai thì về sau đừng lộ ra cái đuôi chồn giả tạo"), 23000);
      setTimeout(() => sendTag("Mày lâu lâu lại ngu một phát, hay mà đã ngu học thường niên\nKhoe mày đã tốt nghiệp đại học mà lại cần chị giáo dục thường xuyên"), 25000);
      setTimeout(() => sendTag("Mới có chút mà cứ tưởng mình 9 nút"), 28500);
      setTimeout(() => sendTag("Tuổi con cặc mà cứ tưởng mình con cọp"), 31000);
      setTimeout(() => sendTag("Dòng thứ lồn tơm lồn đậm, lồn đười ươi nó địt\nLồn con vịt nó phang, lồn giang mai lồn ỉa chảy"), 36000);
      setTimeout(() => sendTag("Lồn nhảy hiphop, lồn hàng triệu con súc vật"), 39000);
      setTimeout(() => sendTag("Đợi chị mày xíu, chị gắn cu giả để địt con đĩ mẹ mày"), 40000);
      setTimeout(() => sendTag("Ớ ớ yamate"), 65000);
      setTimeout(() => sendTag("Xong rồi nè"), 70000);
      setTimeout(() => sendTag("Địt mẹ mày lất phất như mưa rơi, địt tơi bời như bom đạn\nĐịt lãng mạn như romeo và juliet"), 75000);
      setTimeout(() => sendTag("Địt đứng tim phổi, địt cặp mắt nai\nĐịt chai lỗ đít, địt khít cái lỗ lồn con đĩ mẹ mày"), 80000);
      setTimeout(() => sendTag("Địt như mấy con điếm bên chợ đồng xuân, địt đằng chân mà lên đằng đầu"), 85000);
      setTimeout(() => sendTag("Địt sập cầu, sập cống"), 90000);
      setTimeout(() => sendTag("Địt rớt xuống sông rồi địt xuống âm phủ"), 95000);
      setTimeout(() => sendTag("Để cho mày đầu thai"), 100000);
      setTimeout(() => sendTag("Hoá kiếp con chó như mày từng mong ước"), 105000);
      setTimeout(() => sendTag("Chửi ít hiểu nhe nghe hum con ôn lồn"), 110000);
    } catch (err) {
      console.error("[dizz] error:", err?.message || err);
      return api.sendMessage("Đã xảy ra lỗi khi gửi tin nhắn.", threadId, threadType);
    }
  },
};


