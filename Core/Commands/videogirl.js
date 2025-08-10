// author @GwenDev
import fs from "fs/promises";
import path from "path";
import { Logger, log } from "../../Utils/Logger.js";
export default {
  name: "vdgirl",
  description: "Gửi một video gái",
  role: 0,
  cooldown: 10,
  group: "video",
    aliases: [
  "tôi muốn xem video gái xinh",
  "gửi video gái",
  "cho xem gái xinh",
  "cho video gái",
  "gửi gái xinh đi",
  "coi gái đi",
  "cho xin gái xinh",
  "gái xinh đâu",
  "video gái xinh đâu",
  "gửi gái",
  "gửi clip gái xinh",
  "t muốn xem gái",
  "gái đâu",
  "xem gái xinh",
  "gái xinh đi",
  "gửi gái đẹp đi",
  "cho xem clip gái",
  "video gái xinh",
  "cho gái xinh coi",
  "gái xinh đi bạn ơi"
],
  noPrefix: true,
  async run({ message, api }) {
    const threadId = message.threadId;
    const threadType = message.type;

    try {
      const filePath = path.resolve("Api", "Data", "VideoGirl.json");
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
        msg: "Gái xink ne",
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
