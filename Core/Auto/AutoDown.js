// author @GwenDev
import axios from "axios";
import path from "path";
import fs from "fs";
import { query } from "../../App/Database.js";
import { ThreadType, Reactions } from "zca-js";
import { Logger, log } from "../../Utils/Logger.js";
import {
    downloadFile,
    getVideoMetadata,
    processYouTubeVideo,
    convertToAac,
    createSoundCloudCanvas
} from "../../Utils/GwenDev.js";


const SUPPORTED_LINKS = [
    /tiktok\.com/, /douyin\.com/, /capcut\.com/, /threads\.com/,/threads\.net/, /instagram\.com/, /facebook\.com/, /espn\.com/,
    /pinterest\.com/, /imdb\.com/, /imgur\.com/, /ifunny\.co/, /izlesene\.com/, /reddit\.com/, /youtube\.com/,
    /youtu\.be/, /twitter\.com/, /x\.com/, /vimeo\.com/, /snapchat\.com/, /bilibili\.com/, /dailymotion\.com/,
    /sharechat\.com/, /likee\.video/, /linkedin\.com/, /tumblr\.com/, /hipi\.co\.in/, /telegram\.org/,
    /getstickerpack\.com/, /bitchute\.com/, /febspot\.com/, /9gag\.com/, /ok\.ru/, /rumble\.com/, /streamable\.com/,
    /ted\.com/, /sohu\.com/, /xvideos\.com/, /xnxx\.com/, /xiaohongshu\.com/, /ixigua\.com/, /weibo\.com/,
    /miaopai\.com/, /meipai\.com/, /xiaoying\.tv/, /nationalvideo\.com/, /yingke\.com/, /sina\.com\.cn/,
    /vk\.com/, /vk\.ru/, /soundcloud\.com/, /mixcloud\.com/, /spotify\.com/, /zingmp3\.vn/, /bandcamp\.com/
];
async function isAutoDownEnabled(threadId) {
    const rows = await query("SELECT status, thread FROM settings WHERE cmd = 'autodown' LIMIT 1");
    if (!rows.length) return true;
    const { status, thread } = rows[0];
    let list = [];
    try { list = thread ? JSON.parse(thread) : []; } catch {}
    const entry = list.find(([id]) => id === threadId);
    return entry ? entry[2] === "on" : status === 1;
}
function cleanupFiles(files, delay = 8000) {
    setTimeout(() => {
        files.forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });
    }, delay);
}
export function startAutoDown(api) {
    api.listener.on("message", async (msg) => {
        const threadId = msg.threadId;
        const threadType = msg.type;

        const content = typeof msg.data?.content === "string" ? msg.data.content.trim() : "";
        const href = typeof msg.data?.content?.href === "string" ? msg.data.content.href.trim() : "";
        const title = typeof msg.data?.content?.title === "string" ? msg.data.content.title.trim() : "";
        const bodyText = typeof msg.message?.body === "string" ? msg.message.body.trim() : "";
        const body = content || bodyText || href || title;
        if (!body || !/^https?:\/\/\S+/.test(body  )) return;
        if (!SUPPORTED_LINKS.some(rx => rx.test(body))) return;

        const allow = await isAutoDownEnabled(threadId);
        if (!allow) return;
        log(`[URL] Get Link: ${body}`, "url");
        try {
            await api.addReaction(
                Reactions.OK,
                {
                    type: threadType,
                    threadId,
                    data: {
                        msgId: msg.data?.msgId,
                        cliMsgId: msg.data?.cliMsgId ?? 0,
                    },
                }
            );
        } catch {}
        try {
            let apiUrl;
            if (/instagram\.com|threads\.net|threads\.com/.test(body)) {
                apiUrl = `https://kemapis.eu.org/api/instagram/media?url=${encodeURIComponent(body )}`;
            } else {
                apiUrl = `https://api.zeidteam.xyz/media-downloader/atd2?url=${encodeURIComponent(body )}`;
            }
            const res = await axios.get(apiUrl);
            const data = res.data;

            if (!data || !Array.isArray(data.medias) || data.medias.length === 0) {
                log.warn(`[URL] Error: ${body}`);
                return;
            }

            const mediaTitle = data.title?.trim() || "🎬 Downloaded Content";
            const author = data.author || data.unique_id || "Unknown";
            const source = data.source || "unknown";
            const cacheDir = path.join("Data", "Cache");
            fs.mkdirSync(cacheDir, { recursive: true });

            if (["tiktok", "douyin"].includes(source) || /(?:vm\.)?tiktok\.com/.test(body)) {
                const hasVideo = data.medias.some(m => m.type === "video");
                const isImageOnly = !hasVideo;

                if (isImageOnly) {
                    const attachments = [];
                    for (const [index, media] of data.medias.entries()) {
                        if (media.type === "image" && media.url) {
                            try {
                                const ext = path.extname(media.url.split("?")[0]) || ".jpg";
                                const imagePath = path.join(cacheDir, `ttimg_${Date.now()}_${index}${ext}`);
                                await downloadFile(media.url, imagePath);
                                attachments.push(imagePath);
                            } catch (err) {
                                log.warn(`[URL] Error Image: ${err.message}`);
                            }
                        }
                    }

                    if (attachments.length > 0) {
                        await api.sendMessage({
                            msg: `/-li 𝐀𝐮𝐭𝐨𝐃𝐨𝐰𝐧: 𝐓𝐢𝐤𝐓𝐨𝐤 \n📄 𝐓𝐢𝐭𝐭𝐥𝐞: ${mediaTitle}\n👤 𝐀𝐮𝐭𝐡𝐨𝐫: ${author}`,
                            attachments,
                            ttl: 500_000 
                        }, threadId, threadType);
                        cleanupFiles(attachments);
                    }

                    const audio = data.medias.find(m => m.type === "audio" && m.url);
                    if (audio?.url) {
                        const tempPath = path.join(cacheDir, `ttaudio_${Date.now()}`);
                        const aacPath = `${tempPath}.aac`;
                        try {
                            await downloadFile(audio.url, tempPath);
                            await convertToAac(tempPath, aacPath);
                            const uploaded = await api.uploadAttachment([aacPath], threadId, threadType);
                            const voiceData = uploaded?.[0];
                            if (voiceData?.fileUrl && voiceData?.fileName) {
                                const voiceUrl = `${voiceData.fileUrl}/${voiceData.fileName}`;
                                await api.sendVoice({ voiceUrl, ttl: 900_000 }, threadId, threadType);
                            }
                        } catch (err) {
                            log.warn(`[URL] Error Audio: ${err.message}`);
                        } finally {
                            cleanupFiles([tempPath, aacPath]);
                        }
                    }
                    return;
                }

                const videoCandidates = data.medias.filter(m => m.type === "video" && m.url);
                const video =
                    videoCandidates.find(m => /(?:360|480|sd)/i.test(m.quality || "")) ||
                    videoCandidates.find(m => m.quality?.includes("no_watermark")) ||
                    videoCandidates[0];
                if (!video?.url) return;

                const tmpPath = path.join(cacheDir, `ttvid_${Date.now()}.mov`);
                let width = 720, height = 1280, duration = 0;
                try {
                    await downloadFile(video.url, tmpPath);
                    const metadata = await getVideoMetadata(tmpPath);
                    width = metadata.width;
                    height = metadata.height;
                    duration = metadata.duration;
                } catch (err) {
                    log.warn(`[URL] Error Video Metadata: ${err.message}`);
                } finally {
                    cleanupFiles([tmpPath], 0);
                }

                await api.sendVideo({
                    videoUrl: video.url,
                    thumbnailUrl: video.thumbnail || data.thumbnail || video.url,
                    msg: `/-li 𝐀𝐮𝐭𝐨𝐃𝐨𝐰𝐧: 𝐓𝐢𝐤𝐓𝐨𝐤 \n📄 𝐓𝐢𝐭𝐭𝐥𝐞: ${mediaTitle}\n👤 𝐀𝐮𝐭𝐡𝐨𝐫: ${author}`,
                    width,
                    height,
                    duration: duration * 1000,
                    ttl: 500_000
                }, threadId, threadType);
                return;
            }
            if (["douyin"].includes(source) || /(?:v\.)?douyin\.com/.test(body)) {
                const hasVideo = data.medias.some(m => m.type === "video");
                const isImageOnly = !hasVideo;

                if (isImageOnly) {
                    const attachments = [];
                    for (const [index, media] of data.medias.entries()) {
                        if (media.type === "image" && media.url) {
                            try {
                                const ext = path.extname(media.url.split("?")[0]) || ".jpg";
                                const imagePath = path.join(cacheDir, `ttimg_${Date.now()}_${index}${ext}`);
                                await downloadFile(media.url, imagePath);
                                attachments.push(imagePath);
                            } catch (err) {
                                log.warn(`[URL] Error Image: ${err.message}`);
                            }
                        }
                    }

                    if (attachments.length > 0) {
                        await api.sendMessage({
                            msg: `/-li 𝐀𝐮𝐭𝐨𝐃𝐨𝐰𝐧: 𝐃𝐨𝐮𝐲𝐢𝐧  \n📄 𝐓𝐢𝐭𝐭𝐥𝐞: ${mediaTitle}\n👤 𝐀𝐮𝐭𝐡𝐨𝐫: ${author}`,
                            attachments,
                            ttl: 500_000 
                        }, threadId, threadType);
                        cleanupFiles(attachments);
                    }

                    const audio = data.medias.find(m => m.type === "audio" && m.url);
                    if (audio?.url) {
                        const tempPath = path.join(cacheDir, `ttaudio_${Date.now()}`);
                        const aacPath = `${tempPath}.aac`;
                        try {
                            await downloadFile(audio.url, tempPath);
                            await convertToAac(tempPath, aacPath);
                            const uploaded = await api.uploadAttachment([aacPath], threadId, threadType);
                            const voiceData = uploaded?.[0];
                            if (voiceData?.fileUrl && voiceData?.fileName) {
                                const voiceUrl = `${voiceData.fileUrl}/${voiceData.fileName}`;
                                await api.sendVoice({ voiceUrl, ttl: 900_000 }, threadId, threadType);
                            }
                        } catch (err) {
                            log.warn(`[URL] Error Audio: ${err.message}`);
                        } finally {
                            cleanupFiles([tempPath, aacPath]);
                        }
                    }
                    return;
                }

                const video = data.medias.find(m => m.type === "video" && m.quality?.includes("no_watermark")) || data.medias.find(m => m.type === "video");
                if (!video?.url) return;

                const tmpPath = path.join(cacheDir, `ttvid_${Date.now()}.mov`);
                let width = 720, height = 1280, duration = 0;
                try {
                    await downloadFile(video.url, tmpPath);
                    const metadata = await getVideoMetadata(tmpPath);
                    width = metadata.width;
                    height = metadata.height;
                    duration = metadata.duration;
                } catch (err) {
                    log.warn(`[URL] Error Video Metadata: ${err.message}`);
                } finally {
                    cleanupFiles([tmpPath], 0);
                }

                await api.sendVideo({
                    videoUrl: video.url,
                    thumbnailUrl: video.thumbnail || data.thumbnail || video.url,
                    msg: `/-li 𝐀𝐮𝐭𝐨𝐃𝐨𝐰𝐧: 𝐃𝐨𝐮𝐲𝐢𝐧  \n📄 𝐓𝐢𝐭𝐭𝐥𝐞: ${mediaTitle}\n👤 𝐀𝐮𝐭𝐡𝐨𝐫: ${author}`,
                    width,
                    height,
                    duration: duration * 1000,
                    ttl: 500_000
                }, threadId, threadType);
                return;
            }
            if (["facebook"].includes(source) || /facebook\.com/.test(body)) {
                const hasVideo = data.medias.some(m => m.type === "video");
                const isImageOnly = !hasVideo;

                if (isImageOnly) {
                    const attachments = [];
                    for (const [index, media] of data.medias.entries()) {
                        if (media.type === "image" && media.url) {
                            try {
                                const ext = path.extname(media.url.split("?")[0]) || ".jpg";
                                const imagePath = path.join(cacheDir, `ttimg_${Date.now()}_${index}${ext}`);
                                await downloadFile(media.url, imagePath);
                                attachments.push(imagePath);
                            } catch (err) {
                                log.warn(`[URL] Error Image: ${err.message}`);
                            }
                        }
                    }

                    if (attachments.length > 0) {
                        await api.sendMessage({
                            msg: `/-li 𝐀𝐮𝐭𝐨𝐃𝐨𝐰𝐧: 𝐅𝐚𝐜𝐞𝐛𝐨𝐨𝐤   \n📄 𝐓𝐢𝐭𝐭𝐥𝐞: ${mediaTitle}\n👤 𝐀𝐮𝐭𝐡𝐨𝐫: ${author}`,
                            attachments,
                            ttl: 500_000 
                        }, threadId, threadType);
                        cleanupFiles(attachments);
                    }

                    const audio = data.medias.find(m => m.type === "audio" && m.url);
                    if (audio?.url) {
                        const tempPath = path.join(cacheDir, `ttaudio_${Date.now()}`);
                        const aacPath = `${tempPath}.aac`;
                        try {
                            await downloadFile(audio.url, tempPath);
                            await convertToAac(tempPath, aacPath);
                            const uploaded = await api.uploadAttachment([aacPath], threadId, threadType);
                            const voiceData = uploaded?.[0];
                            if (voiceData?.fileUrl && voiceData?.fileName) {
                                const voiceUrl = `${voiceData.fileUrl}/${voiceData.fileName}`;
                                await api.sendVoice({ voiceUrl, ttl: 900_000 }, threadId, threadType);
                            }
                        } catch (err) {
                            log.warn(`[URL] Error Audio: ${err.message}`);
                        } finally {
                            cleanupFiles([tempPath, aacPath]);
                        }
                    }
                    return;
                }

                const video = data.medias.find(m => m.type === "video" && m.quality?.includes("no_watermark")) || data.medias.find(m => m.type === "video");
                if (!video?.url) return;

                const MAX_SIZE_BYTES = 500 * 1024 * 1024;
                const rawPath = path.join(cacheDir, `fb_${Date.now()}.mov`);
                const processedPath = path.join(cacheDir, `fb_done_${Date.now()}.mov`);
                try {
                    await downloadFile(video.url, rawPath);
                    await processYouTubeVideo(rawPath, processedPath);

                    const { size } = fs.statSync(processedPath);
                    if (size > MAX_SIZE_BYTES) {
                        return;
                    }

                    const metadata = await getVideoMetadata(processedPath);
                    const uploaded = await api.uploadAttachment([processedPath], threadId, threadType);
                    const videoFile = uploaded?.[0];
                    if (!videoFile?.fileUrl || !videoFile?.fileName) {
                        return;
                    }

                    const uploadedUrl = `${videoFile.fileUrl}/${videoFile.fileName}`;
                    await api.sendVideo({
                        videoUrl: uploadedUrl,
                        thumbnailUrl: video.thumbnail || data.thumbnail || uploadedUrl,
                        msg: `/-li 𝐀𝐮𝐭𝐨𝐃𝐨𝐰𝐧: 𝐅𝐚𝐜𝐞𝐛𝐨𝐨𝐤   \n📄 𝐓𝐢𝐭𝐭𝐥𝐞: ${mediaTitle}\n👤 𝐀𝐮𝐭𝐡𝐨𝐫: ${author}`,
                        width: metadata.width,
                        height: metadata.height,
                        duration: metadata.duration * 1000,
                        ttl: 500_000
                    }, threadId, threadType);
                } catch (err) {
                    
                } finally {
                    cleanupFiles([rawPath, processedPath], 0);
                }
                return;
            }
            if (["capcut"].includes(source) || /capcut\.com/.test(body)) {
                const hasVideo = data.medias.some(m => m.type === "video");
                const isImageOnly = !hasVideo;

                if (isImageOnly) {
                    const attachments = [];
                    for (const [index, media] of data.medias.entries()) {
                        if (media.type === "image" && media.url) {
                            try {
                                const ext = path.extname(media.url.split("?")[0]) || ".jpg";
                                const imagePath = path.join(cacheDir, `ttimg_${Date.now()}_${index}${ext}`);
                                await downloadFile(media.url, imagePath);
                                attachments.push(imagePath);
                            } catch (err) {
                                log.warn(`[URL] Error Image: ${err.message}`);
                            }
                        }
                    }

                    if (attachments.length > 0) {
                        await api.sendMessage({
                            msg: `/-li 𝐀𝐮𝐭𝐨𝐃𝐨𝐰𝐧: 𝐂𝐚𝐩𝐂𝐮𝐭    \n📄 𝐓𝐢𝐭𝐭𝐥𝐞: ${mediaTitle}\n👤 𝐀𝐮𝐭𝐡𝐨𝐫: ${author}`,
                            attachments,
                            ttl: 500_000 
                        }, threadId, threadType);
                        cleanupFiles(attachments);
                    }

                    const audio = data.medias.find(m => m.type === "audio" && m.url);
                    if (audio?.url) {
                        const tempPath = path.join(cacheDir, `ttaudio_${Date.now()}`);
                        const aacPath = `${tempPath}.aac`;
                        try {
                            await downloadFile(audio.url, tempPath);
                            await convertToAac(tempPath, aacPath);
                            const uploaded = await api.uploadAttachment([aacPath], threadId, threadType);
                            const voiceData = uploaded?.[0];
                            if (voiceData?.fileUrl && voiceData?.fileName) {
                                const voiceUrl = `${voiceData.fileUrl}/${voiceData.fileName}`;
                                await api.sendVoice({ voiceUrl, ttl: 900_000 }, threadId, threadType);
                            }
                        } catch (err) {
                            log.warn(`[URL] Error Audio: ${err.message}`);
                        } finally {
                            cleanupFiles([tempPath, aacPath]);
                        }
                    }
                    return;
                }

                const video = data.medias.find(m => m.type === "video" && m.quality?.includes("no_watermark")) || data.medias.find(m => m.type === "video");
                if (!video?.url) return;

                const tmpPath = path.join(cacheDir, `ttvid_${Date.now()}.mov`);
                let width = 720, height = 1280, duration = 0;
                try {
                    await downloadFile(video.url, tmpPath);
                    const metadata = await getVideoMetadata(tmpPath);
                    width = metadata.width;
                    height = metadata.height;
                    duration = metadata.duration;
                } catch (err) {
                    log.warn(`[URL] Error Video Metadata: ${err.message}`);
                } finally {
                    cleanupFiles([tmpPath], 0);
                }

                await api.sendVideo({
                    videoUrl: video.url,
                    thumbnailUrl: video.thumbnail || data.thumbnail || video.url,
                    msg: `/-li 𝐀𝐮𝐭𝐨𝐃𝐨𝐰𝐧: 𝐂𝐚𝐩𝐂𝐮𝐭    \n📄 𝐓𝐢𝐭𝐭𝐥𝐞: ${mediaTitle}\n👤 𝐀𝐮𝐭𝐡𝐨𝐫: ${author}`,
                    width,
                    height,
                    duration: duration * 1000,
                    ttl: 500_000
                }, threadId, threadType);
                return;
            }
            if (["instagram", "threads"].includes(source) || /instagram\.com|threads\.net|threads\.com/.test(body)) {
                const platform = /threads/.test(body) ? "𝐓𝐡𝐫𝐞𝐚𝐝𝐬" : "𝐈𝐧𝐬𝐭𝐚𝐠𝐫𝐚𝐦";
                const hasVideo = data.medias.some(m => m.type === "video");
                const isImageOnly = !hasVideo;

                if (isImageOnly) {
                    const attachments = [];
                    for (const [index, media] of data.medias.entries()) {
                        if (media.type === "image" && media.url) {
                            try {
                                const ext = path.extname(media.url.split("?")[0]) || ".jpg";
                                const imagePath = path.join(cacheDir, `media_${Date.now()}_${index}${ext}`);
                                await downloadFile(media.url, imagePath);
                                attachments.push(imagePath);
                            } catch (err) {
                                log.warn(`[URL] Error Image: ${err.message}`);
                            }
                        }
                    }

                    if (attachments.length > 0) {
                        await api.sendMessage({
                            msg: `/-li 𝐀𝐮𝐭𝐨𝐃𝐨𝐰𝐧: ${platform}     \n📄 𝐓𝐢𝐭𝐭𝐥𝐞: ${mediaTitle}\n👤 𝐀𝐮𝐭𝐡𝐨𝐫: ${author}`,
                            attachments,
                            ttl: 500_000
                        }, threadId, threadType);
                        cleanupFiles(attachments);
                    }
                    return;
                }

                const video = data.medias.find(m => m.type === "video");
                if (!video?.url) return;

                const tmpPath = path.join(cacheDir, `media_vid_${Date.now()}.mov`);
                let width = 720, height = 1280, duration = 0;
                try {
                    await downloadFile(video.url, tmpPath);
                    const metadata = await getVideoMetadata(tmpPath);
                    width = metadata.width;
                    height = metadata.height;
                    duration = metadata.duration;
                } catch (err) {
                    log.warn(`[URL] Error Video Metadata: ${err.message}`);
                } finally {
                    cleanupFiles([tmpPath], 0);
                }

                await api.sendVideo({
                    videoUrl: video.url,
                    thumbnailUrl: video.thumbnail || data.thumbnail || video.url,
                    msg: `/-li 𝐀𝐮𝐭𝐨𝐃𝐨𝐰𝐧: ${platform}     \n📄 𝐓𝐢𝐭𝐭𝐥𝐞: ${mediaTitle}\n👤 𝐀𝐮𝐭𝐡𝐨𝐫: ${author}`,
                    width,
                    height,
                    duration: duration * 1000,
                    ttl: 500_000
                }, threadId, threadType);
                return;
            }
            if (source === "bilibili" || /bilibili\.com/.test(body)) {
                const MAX_SIZE_BYTES = 500 * 1024 * 1024;
                const candidates = data.medias.filter(m => m.type?.startsWith("video") && m.url);
                let bestVideo = null;
                for (const video of candidates) {
                    try {
                        const head = await axios.head(video.url);
                        const size = parseInt(head.headers['content-length'] || '0');
                        if (size > 0 && size <= MAX_SIZE_BYTES) {
                            bestVideo = video;
                            break;
                        }
                    } catch (err) {} // gwendev
                }

                if (!bestVideo?.url) {
                    log.warn(`[URL] Limit Video 100MB`);
                    return;
                }

                const rawPath = path.join(cacheDir, `yt_${Date.now()}.mov`);
                const processedPath = path.join(cacheDir, `yt_done_${Date.now()}.mov`);
                try {
                    await downloadFile(bestVideo.url, rawPath);
                    
                    await processYouTubeVideo(rawPath, processedPath);

                    const { size } = fs.statSync(processedPath);
                    if (size > MAX_SIZE_BYTES) {
                        return;
                    }
                    const metadata = await getVideoMetadata(processedPath);
                    const uploaded = await api.uploadAttachment([processedPath], threadId, threadType);
                    const videoFile = uploaded?.[0];
                    if (!videoFile?.fileUrl || !videoFile?.fileName) {
                        return;
                    }

                    const videoUrl = `${videoFile.fileUrl}/${videoFile.fileName}`;
                    await api.sendVideo({
                        videoUrl,
                        thumbnailUrl: data.thumbnail,
                         msg: `/-li 𝐀𝐮𝐭𝐨𝐃𝐨𝐰𝐧: 𝐁𝐢𝐥𝐢𝐁𝐢𝐥𝐢  \n📄 𝐓𝐢𝐭𝐭𝐥𝐞: ${mediaTitle}\n👤 𝐀𝐮𝐭𝐡𝐨𝐫: ${author}`,
                        width: metadata.width,
                        height: metadata.height,
                        duration: metadata.duration * 1000, 
                        ttl: 150_000
                    }, threadId, threadType);
                } catch (err) {
                } finally {
                    cleanupFiles([rawPath, processedPath], 0);
                }
                return;
            }
                if (source === "youtube" || /youtube\.com|youtu\.be/.test(body)) {
                const MAX_SIZE_BYTES = 500 * 1024 * 1024;
                const candidates = data.medias.filter(m => m.type?.startsWith("video") && m.url);
                let bestVideo = null;
                for (const video of candidates) {
                    try {
                        const head = await axios.head(video.url);
                        const size = parseInt(head.headers['content-length'] || '0');
                        if (size > 0 && size <= MAX_SIZE_BYTES) {
                            bestVideo = video;
                            break;
                        }
                    } catch (err) {} // gwendev
                }

                if (!bestVideo?.url) {
                    log.warn(`[URL] Limit Video 100MB`);
                    return;
                }

                const rawPath = path.join(cacheDir, `yt_${Date.now()}.mov`);
                const processedPath = path.join(cacheDir, `yt_done_${Date.now()}.mov`);
                try {
                    await downloadFile(bestVideo.url, rawPath);
                    
                    await processYouTubeVideo(rawPath, processedPath);

                    const { size } = fs.statSync(processedPath);
                    if (size > MAX_SIZE_BYTES) {
                        return;
                    }
                    const metadata = await getVideoMetadata(processedPath);
                    const uploaded = await api.uploadAttachment([processedPath], threadId, threadType);
                    const videoFile = uploaded?.[0];
                    if (!videoFile?.fileUrl || !videoFile?.fileName) {
                        return;
                    }

                    const videoUrl = `${videoFile.fileUrl}/${videoFile.fileName}`;
                    await api.sendVideo({
                        videoUrl,
                        thumbnailUrl: data.thumbnail,
                         msg: `/-li 𝐀𝐮𝐭𝐨𝐃𝐨𝐰𝐧: 𝐘𝐨𝐮𝐭𝐮𝐛𝐞 \n📄 𝐓𝐢𝐭𝐭𝐥𝐞: ${mediaTitle}\n👤 𝐀𝐮𝐭𝐡𝐨𝐫: ${author}`,
                        width: metadata.width,
                        height: metadata.height,
                        duration: metadata.duration * 1000, 
                        ttl: 150_000
                    }, threadId, threadType);
                } catch (err) {
                } finally {
                    cleanupFiles([rawPath, processedPath], 0);
                }
                return;
            }
            
            if (source === "xnxx" || /xnxx\.com/.test(body)) {
                const MAX_SIZE_BYTES = 100 * 1024 * 1024;
                const candidates = data.medias.filter(m => m.type?.startsWith("video") && m.url);
                let bestVideo = null;
                for (const video of candidates) {
                    try {
                        const head = await axios.head(video.url);
                        const size = parseInt(head.headers['content-length'] || '0');
                        if (size > 0 && size <= MAX_SIZE_BYTES) {
                            bestVideo = video;
                            break;
                        }
                    } catch (err) {} // gwendev
                }

                if (!bestVideo?.url) {
                    log.warn(`[URL] Limit Video 100MB`);
                    return;
                }

                const rawPath = path.join(cacheDir, `yt_${Date.now()}.mov`);
                const processedPath = path.join(cacheDir, `yt_done_${Date.now()}.mov`);
                try {
                    await downloadFile(bestVideo.url, rawPath);
                    
                    await processYouTubeVideo(rawPath, processedPath);

                    const { size } = fs.statSync(processedPath);
                    if (size > MAX_SIZE_BYTES) {
                        return;
                    }
                    const metadata = await getVideoMetadata(processedPath);
                    const uploaded = await api.uploadAttachment([processedPath], threadId, threadType);
                    const videoFile = uploaded?.[0];
                    if (!videoFile?.fileUrl || !videoFile?.fileName) {
                        return;
                    }

                    const videoUrl = `${videoFile.fileUrl}/${videoFile.fileName}`;
                    await api.sendVideo({
                        videoUrl,
                        thumbnailUrl: data.thumbnail,
                    msg: `/-li 𝐀𝐮𝐭𝐨𝐃𝐨𝐰𝐧: 𝐗𝐧𝐱𝐱  \n📄 𝐓𝐢𝐭𝐭𝐥𝐞: ${mediaTitle}\n👤 𝐀𝐮𝐭𝐡𝐨𝐫: ${author}`,
                        width: metadata.width,
                        height: metadata.height,
                        duration: metadata.duration * 1000, 
                        ttl: 150_000
                    }, threadId, threadType);
                } catch (err) {
                } finally {
                    cleanupFiles([rawPath, processedPath], 0);
                }
                return;
            }
if (source.includes("xvideos") || /xvideos\.com|xvide\.os/.test(body)) {

    const MAX_SIZE_BYTES = 100 * 1024 * 1024;
    const candidates = data.medias.filter(m => m.type?.startsWith("video") && m.url);
    let bestVideo = null;
    for (const video of candidates) {
        try {
            const head = await axios.head(video.url);
            const size = parseInt(head.headers['content-length'] || '0');
            if (size > 0 && size <= MAX_SIZE_BYTES) {
                bestVideo = video;
                break;
            } else {  
            }
        } catch (err) {
        }
    }
    if (!bestVideo?.url) { 
        return;
    }
    const rawPath = path.join(cacheDir, `yt_${Date.now()}.mov`);
    const processedPath = path.join(cacheDir, `yt_done_${Date.now()}.mov`);
    try {  
        await downloadFile(bestVideo.url, rawPath);  
        await processYouTubeVideo(rawPath, processedPath);
        const { size } = fs.statSync(processedPath);
        if (size > MAX_SIZE_BYTES) {     
            return;
        }   
        const metadata = await getVideoMetadata(processedPath);
        const uploaded = await api.uploadAttachment([processedPath], threadId, threadType);
        const videoFile = uploaded?.[0];
        if (!videoFile?.fileUrl || !videoFile?.fileName) {   
            return;
        }
        const videoUrl = `${videoFile.fileUrl}/${videoFile.fileName}`; 
        await api.sendVideo({
            videoUrl,
            thumbnailUrl: data.thumbnail,
             msg: `/-li 𝐀𝐮𝐭𝐨𝐃𝐨𝐰𝐧: 𝐗𝐯𝐢𝐝𝐞𝐨𝐬   \n📄 𝐓𝐢𝐭𝐭𝐥𝐞: ${mediaTitle}\n👤 𝐀𝐮𝐭𝐡𝐨𝐫: ${author}`,
            width: metadata.width,
            height: metadata.height,
            duration: metadata.duration * 1000,
            ttl: 150_000
        }, threadId, threadType);
    } catch (err) {
    } finally {
        cleanupFiles([rawPath, processedPath], 0);
    }

    return;
}

            if (source === "soundcloud" || /soundcloud\.com/.test(body)) {
    const audio = data.medias.find(m => m.type === "audio");
    if (!audio?.url) { return; }

    const tempPath = path.join(cacheDir, `sc_${Date.now()}`);
    const aacPath = `${tempPath}.aac`;
    const attachments = [];
    let cardPath = null;
    try {
        await downloadFile(audio.url, tempPath);
        await convertToAac(tempPath, aacPath);

        try {
            cardPath = await createSoundCloudCanvas({
                title: mediaTitle,
                artist: author,
                quality: audio.quality || audio.format || "",
                thumbnailUrl: data.thumbnail || "",
            });
        } catch (e) {}

        const uploaded = await api.uploadAttachment([aacPath], threadId, threadType);
        const voiceData = uploaded?.[0];
        if (!voiceData?.fileUrl || !voiceData?.fileName) {
        } else {
            const voiceUrl = `${voiceData.fileUrl}/${voiceData.fileName}`;
            const caption = `/-li 𝐀𝐮𝐭𝐨𝐃𝐨𝐰𝐧: 𝐒𝐨𝐮𝐧𝐝𝐂𝐥𝐨𝐮𝐝   \n📄 𝐓𝐢𝐭𝐭𝐥𝐞: ${mediaTitle}\n👤 𝐀𝐮𝐭𝐡𝐨𝐫: ${author}`;
            if (cardPath) {
                await api.sendMessage({ msg: caption, attachments: [cardPath], ttl: 600_000 }, threadId, threadType);
            } else {
                await api.sendMessage({ msg: caption, ttl: 600_000 }, threadId, threadType);
            }
            await api.sendVoice({ voiceUrl, ttl: 900_000 }, threadId, threadType);
        }
    } catch (err) {
    } finally {
        cleanupFiles([tempPath, aacPath, cardPath].filter(Boolean));
    }
    return;
}
if (source === "mixcloud" || /mixcloud\.com/.test(body)) {
    const audio = data.medias.find(m => m.type === "audio");
    if (!audio?.url) return;

    const tempPath = path.join(cacheDir, `sc_${Date.now()}`);
    const aacPath = `${tempPath}.aac`;
    const attachments = [];
    try {
        await downloadFile(audio.url, tempPath);
        await convertToAac(tempPath, aacPath);
        if (data.thumbnail) {
            const imagePath = path.join(cacheDir, `scimg_${Date.now()}.jpg`);
            await downloadFile(data.thumbnail, imagePath);
            attachments.push(imagePath);
        }
        await api.sendMessage({
           msg: `/-li 𝐀𝐮𝐭𝐨𝐃𝐨𝐰𝐧: 𝐌𝐢𝐱𝐂𝐥𝐨𝐮𝐝  \n📄 𝐓𝐢𝐭𝐭𝐥𝐞: ${mediaTitle}\n👤 𝐀𝐮𝐭𝐡𝐨𝐫: ${author}`,
            attachments,
            ttl: 500_000
        }, threadId, threadType);
        const uploaded = await api.uploadAttachment([aacPath], threadId, threadType);
        const voiceData = uploaded?.[0];
        if (voiceData?.fileUrl && voiceData?.fileName) {
            const voiceUrl = `${voiceData.fileUrl}/${voiceData.fileName}`;
            await api.sendVoice({ voiceUrl, ttl: 900_000 }, threadId, threadType);
        }
    } catch (err) {
    } finally {
        cleanupFiles([tempPath, aacPath, ...attachments]);
    }
    return;
}
if (source === "spotify" || /spotify\.com/.test(body)) {
    const audio = data.medias.find(m => m.type === "audio");
    if (!audio?.url) return;

    const tempPath = path.join(cacheDir, `sc_${Date.now()}`);
    const aacPath = `${tempPath}.aac`;
    const attachments = [];
    try {
        await downloadFile(audio.url, tempPath);
        await convertToAac(tempPath, aacPath);

        if (data.thumbnail) {
            const imagePath = path.join(cacheDir, `scimg_${Date.now()}.jpg`);
            await downloadFile(data.thumbnail, imagePath);
            attachments.push(imagePath);
        }
        await api.sendMessage({
              msg: `/-li 𝐀𝐮𝐭𝐨𝐃𝐨𝐰𝐧: 𝐒𝐩𝐨𝐭𝐢𝐟𝐲  \n📄 𝐓𝐢𝐭𝐭𝐥𝐞: ${mediaTitle}\n👤 𝐀𝐮𝐭𝐡𝐨𝐫: ${author}`,
            attachments,
            ttl: 500_000
        }, threadId, threadType);

        const uploaded = await api.uploadAttachment([aacPath], threadId, threadType);
        const voiceData = uploaded?.[0];
        if (voiceData?.fileUrl && voiceData?.fileName) {
            const voiceUrl = `${voiceData.fileUrl}/${voiceData.fileName}`;
            await api.sendVoice({ voiceUrl, ttl: 900_000 }, threadId, threadType);
        }
    } catch (err) {
    } finally {
        cleanupFiles([tempPath, aacPath, ...attachments]);
    }
    return;
}

if (source === "zingmp3" || /zingmp3\.vn/.test(body)) {
    const audio = data.medias.find(m => m.type === "audio");
    if (!audio?.url) return;

    const tempPath = path.join(cacheDir, `sc_${Date.now()}`);
    const aacPath = `${tempPath}.aac`;
    const attachments = [];
    try {
        await downloadFile(audio.url, tempPath);
        await convertToAac(tempPath, aacPath);

        if (data.thumbnail) {
            const imagePath = path.join(cacheDir, `scimg_${Date.now()}.jpg`);
            await downloadFile(data.thumbnail, imagePath);
            attachments.push(imagePath);
        }
        await api.sendMessage({
             msg: `/-li 𝐀𝐮𝐭𝐨𝐃𝐨𝐰𝐧: 𝐙𝐢𝐧𝐠𝐌𝐏𝟑   \n📄 𝐓𝐢𝐭𝐭𝐥𝐞: ${mediaTitle}\n👤 𝐀𝐮𝐭𝐡𝐨𝐫: ${author}`,
            attachments,
            ttl: 500_000
        }, threadId, threadType);
        const uploaded = await api.uploadAttachment([aacPath], threadId, threadType);
        const voiceData = uploaded?.[0];
        if (voiceData?.fileUrl && voiceData?.fileName) {
            const voiceUrl = `${voiceData.fileUrl}/${voiceData.fileName}`;
            await api.sendVoice({ voiceUrl, ttl: 900_000 }, threadId, threadType);
        }
    } catch (err) {
    } finally {
        cleanupFiles([tempPath, aacPath, ...attachments]);
    }
    return;
}

        } catch (err) {
           
        }
    });
}
