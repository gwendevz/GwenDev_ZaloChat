// author @GwenDev
export default {
  name: "search",
  description: "Tìm kiếm kết quả trên Google hoặc tìm bằng hình ảnh",
  role: 0,
  cooldown: 5,
  group: "other",
  aliases: ["google", "gg"],
  noPrefix: false,

  async run({ message, api, args }) {
    const threadId = message.threadId;
    const threadType = message.type;

    const imgRegex = /(https?:\/\/[^\s]+?\.(?:png|jpe?g|gif))(?:\?[^\s]*)?/i;
    const urlRegex = /(https?:\/\/[^\s]+)/i;

    const rawArg = (args || []).join(" ").trim();

    let imageUrl = null;
    let textQuery = null;

    if (rawArg) {
      const mImg = rawArg.match(imgRegex);
      if (mImg) imageUrl = mImg[1];
      else textQuery = rawArg;
    } else {
      const quote = message.quote || message.data?.quote;
      if (quote) {
        try {
          const qStr = JSON.stringify(quote);
          const mImgQ = qStr.match(imgRegex);
          if (mImgQ) imageUrl = mImgQ[1];
          else {
            const mUrl = qStr.match(urlRegex);
            if (mUrl) {
              const possible = mUrl[1];
              const mImg2 = possible.match(imgRegex);
              if (mImg2) imageUrl = mImg2[1];
            }
          }
        } catch {}
      }
    }

    if (!imageUrl && !textQuery) {
      return api.sendMessage({
        msg: "Dùng: .search [từ khóa] hoặc reply một tin có ảnh/URL ảnh để tìm bằng hình.",
        ttl: 60_000
      }, threadId, threadType);
    }

    try {
      if (imageUrl) {
        const link = `https://www.google.com/searchbyimage?&image_url=${encodeURIComponent(imageUrl)}`;
        return api.sendMessage({ msg: link, ttl: 30 * 60_000 }, threadId, threadType);
      }
      const link = `https://www.google.com.vn/search?q=${encodeURIComponent(textQuery)}`;
      return api.sendMessage({ msg: link, ttl: 30 * 60_000 }, threadId, threadType);
    } catch (err) {
      return api.sendMessage({ msg: "Không thể tạo link tìm kiếm.", ttl: 60_000 }, threadId, threadType);
    }
  },
};


