// author @GwenDev
import { Logger, log } from "./Utils/Logger.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import {
    downloadFile,
    getVideoMetadata,
    createThumbnail
} from "./Utils/GwenDev.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputJsonPath = path.join(__dirname, "Api", "Data", "RawVideoUrls.json");
const outputJsonPath = path.join(__dirname, "Api", "Data", "VideoCosplay.json");
const cacheDir = path.join(__dirname, "Temp", "Videos");
const thumbDir = path.join(__dirname, "Temp", "Thumbs");

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));


async function processVideo(url, index, total) {
    const percent = Math.round(((index + 1) / total) * 100);
    const label = `[${index + 1}/${total}] (${percent}%)`;
    const videoFileName = `video_${index}_${Date.now()}.mp4`;
    const tmpPath = path.join(cacheDir, videoFileName);

    try {
        log(`[GET] - ${label} Download: ${url}`),"url";
        const videoBuffer = await downloadFile(url, tmpPath);

        const sizeMB = (videoBuffer.length / 1024 / 1024).toFixed(2);
        log(`[GET] - ${label} Size File: ${sizeMB} MB`,"url");

        const start = Date.now();
        const meta = await getVideoMetadata(tmpPath);

        const thumbBaseName = path.parse(videoFileName).name;
        const thumbNameWithBinExt = `${thumbBaseName}.bin`;
        await createThumbnail(tmpPath, thumbNameWithBinExt, thumbDir);

        const elapsed = ((Date.now() - start) / 1000).toFixed(2);
        log(`⋆──────────────────⋆/n${label} Metadata: ${meta.width}x${meta.height}, Duration: ${meta.duration}s, Thumbnail: ${thumbNameWithBinExt}, Time Ex: ${elapsed}s`,"url");

        return {
            url,
            width: meta.width,
            height: meta.height,
            duration: meta.duration,
            thumbnail: thumbNameWithBinExt,
        };
    } catch (err) {
        console.warn(`${label} Lỗi: ${err.message}`);
        return null;
    } finally {
        try {
            await fs.unlink(tmpPath);
        } catch {}
    }
}

async function main() {
    try {
        await fs.mkdir(cacheDir, { recursive: true });
        await fs.mkdir(thumbDir, { recursive: true });

        const raw = await fs.readFile(inputJsonPath, "utf8");
        const urlList = JSON.parse(raw);

        let existingData = [];
        try {
            const oldData = await fs.readFile(outputJsonPath, "utf8");
            existingData = JSON.parse(oldData);
            log(`[GET] - Có ${existingData.length} Link Đã Qua Covert Từ File Cũ. Bỏ Qua`,"url");
        } catch {
            log("[GET] - Không Có Link Ex Sẵn. Để Gwen Tạo Mới Nè.","url");
        }

        const doneUrls = new Set(existingData.map(v => v.url));
        const pendingUrls = urlList.filter(url => !doneUrls.has(url));

        if (pendingUrls.length === 0) {
            log("[GET] - Có Link Nào Mới Đâu ><","url");
            return;
        }

        log(`[GET] - Chuẩn Bị Xử Lý: ${pendingUrls.length} Link New\n`,"url");

        for (let i = 0; i < pendingUrls.length; i++) {
            const url = pendingUrls[i];
            const videoData = await processVideo(url, i, pendingUrls.length);
            if (videoData) {
                existingData.push(videoData);
                await fs.writeFile(outputJsonPath, JSON.stringify(existingData, null, 2));
            }

            if (i < pendingUrls.length - 1) {
                console.log(`[GET] - Tạm Ngưng 5P Tránh Block 429`);
                await sleep(300000); 
            }
        }

        console.log(`\n[SAVE] File: ${existingData.length} | Save to: ${outputJsonPath}`);
    } catch (err) {
        console.error("Lỗi nè báo gwen đi chời ơi", err);
    }
}

main();
