import fs from "fs";
import axios from "axios";
import path from "path";
import { load as cheerioLoad } from "cheerio";
import { fileURLToPath } from "url";
import { settings } from "../../App/Settings.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commandsDir = __dirname; 

/**
 * Upload a local file to dpaste and return both the normal & raw link
 * @param {string} filePath full path to file
 */
async function uploadToDpaste(filePath) {
  const content = await fs.promises.readFile(filePath, "utf8");
  const payload = new URLSearchParams({
    content,
    syntax: "js",
    title: path.basename(filePath),
    expiry_days: "365",
  });
  const { data } = await axios.post(settings.dpasteApi, payload, {
    headers: {
      Authorization: `Bearer ${settings.dpasteToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    responseType: "text",
  });
  const link = String(data || "").trim();
  const rawLink = link.replace(/\/$/, "") + ".txt";
  return { link, rawLink };
}

/**
 * Download raw code from mbox, buildtool or google drive link
 * @param {string} url
 * @returns {Promise<string>} code content
 */
async function fetchCodeFromUrl(url) {
  // Google drive special handling
  if (url.includes("drive.google")) {
    const idMatch = url.match(/[-\w]{25,}/);
    if (!idMatch) throw new Error("Không lấy được ID tệp Google Drive");
    const id = idMatch[0];
    const res = await axios.get(`https://drive.google.com/u/0/uc?id=${id}&export=download`, { responseType: "arraybuffer" });
    return res.data.toString();
  }

  // buildtool or tinyurl (code html)
  if (url.includes("buildtool") || url.includes("tinyurl.com")) {
    const { data: html } = await axios.get(url, { responseType: "text" });
    const $ = cheerioLoad(html);
    const codeBlock = $(".language-js").first();
    if (!codeBlock?.text()) throw new Error("Không tìm thấy code trong trang");
    return codeBlock.text();
  }

  // Default: treat as raw link
  const { data } = await axios.get(url, { responseType: "text" });
  return data;
}

export default {
  name: "adc",
  description: "Áp dụng code từ link raw vào lệnh mới hoặc upload code local lên dpaste",
  role: 2,
  group: "admin",
  cooldown: 0,
  aliases: [],
  noPrefix: false,

  async run({ message, api, args }) {
    const threadId = message.threadId;
    const type = message.type;

    const fileName = (args[0] || "").trim();
    if (!fileName) {
      return api.sendMessage("⚠️ Vui lòng nhập tên file. Dùng: .adc <tên-file> (reply link/raw hoặc không reply để upload lên dpaste)", threadId, type);
    }

    const linkText = String(
      message.data?.quote?.content ||
      message.data?.quote?.body ||
      message.data?.quote?.msg ||
      ""
    ).trim();

    // -------------------- Upload local file to dpaste --------------------
    if (!linkText) {
      try {
        const filePath = path.join(commandsDir, `${fileName}.js`);
        if (!fs.existsSync(filePath)) {
          return api.sendMessage(`❎ Không tìm thấy file: ${fileName}.js`, threadId, type);
        }
        const { link, rawLink } = await uploadToDpaste(filePath);
        return api.sendMessage(`✅ Tạo paste thành công!\nLink: ${link}\nRaw: ${rawLink}`, threadId, type);
      } catch (err) {
        console.error("[ADC] Upload lỗi:", err?.message || err);
        return api.sendMessage(`❎ Lỗi khi upload: ${err?.response?.status || ""} ${err?.response?.data || err.message}`, threadId, type);
      }
    }

    // -------------------- Fetch code from link and save --------------------
    const urlMatch = linkText.match(/https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/i);
    if (!urlMatch) {
      return api.sendMessage("❎ Không tìm thấy link hợp lệ trong tin nhắn reply.", threadId, type);
    }

    const url = urlMatch[0];
    try {
      const code = await fetchCodeFromUrl(url);
      const targetPath = path.join(commandsDir, `${fileName}.js`);
      await fs.promises.writeFile(targetPath, code, "utf8");
      return api.sendMessage(`☑️ Đã áp dụng code vào ${fileName}.js. Sử dụng .cmd load ${fileName} để tải lại lệnh!`, threadId, type);
    } catch (err) {
      console.error("[ADC] Tải code lỗi:", err?.message || err);
      return api.sendMessage(`❎ Lỗi tải code: ${err?.message || err}`, threadId, type);
    }
  },
};
