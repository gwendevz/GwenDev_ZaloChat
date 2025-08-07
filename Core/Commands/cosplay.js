import fs from "fs/promises";
import path from "path";
import { Logger, log } from "../../Utils/Logger.js";
export default {
  name: "cosplay",
  description: "Gửi một video cosplay",
  role: 0,
  cooldown: 10,
  group: "video",
  aliases: [
    "tôi muốn xem video cosplay", "cho xem cosplay", "cosplay đâu", "gửi video cosplay",
    "cho xin video cosplay", "cho tao video cosplay", "coi cosplay đi", "cosplay đi",
    "gửi clip cosplay", "có video cosplay không", "bật video cosplay lên", "chiếu cosplay đi",
    "xem cosplay", "cosplay đâu rồi", "cho video cosplay", "cho xem gái cosplay",
    "t muốn xem cosplay", "clip cosplay đâu", "cho xin cosplay đi", "cosplay đâu bạn ơi"
  ],
  noPrefix: true,

  async run({ message, api }) {
    const threadId = message.threadId;
    const threadType = message.type;

    try {
      const filePath = path.resolve("Api", "Data", "VideoCosplay.json");
      const rawData = await fs.readFile(filePath, "utf-8");
      const videoList = JSON.parse(rawData);

      if (!Array.isArray(videoList) || videoList.length === 0) {
        return api.sendMessage("g.", threadId, threadType);
      }

      const video = videoList[Math.floor(Math.random() * videoList.length)];

      if (!video?.url || !video?.thumbnail) {
        return api.sendMessage("g.", threadId, threadType);
      }
      const thumbDir = path.resolve("Temp", "Thumbs");
      const thumbPath = path.join(thumbDir, video.thumbnail);

      try {
        await fs.access(thumbPath);
      } catch {
        return api.sendMessage("g", threadId, threadType);
      }
   log(`[URL] Upload Thumb: ${video.thumbnail}`, "url");
      
      const uploaded = await api.uploadAttachment([thumbPath], threadId, threadType);
      const file = uploaded?.[0];

      if (!file?.fileUrl || !file?.fileName) {
        return api.sendMessage("hg", threadId, threadType);
      }
      const thumbnailZaloUrl = `${file.fileUrl}/${file.fileName}`;

      log(`[URL] Send Video Url ${video.url}`, "url");
      await api.sendVideo({
        videoUrl: video.url,             
        thumbnailUrl: thumbnailZaloUrl,  
        msg: "Cosplay UwU",
        width: video.width,
        height: video.height,
        duration: video.duration * 1000,  
        ttl: 1_200_000                    
      }, threadId, threadType);

    } catch (err) {
      if (err.code === 'ENOENT') {
        await api.sendMessage("json", threadId, threadType);
      } else {
        await api.sendMessage("log", threadId, threadType);
      }
    }
  }
};
