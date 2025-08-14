// author @GwenDev
import axios from "axios";
import fs from "fs/promises";
import { execFile } from "child_process";
import ffmpegPath from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import path from "path";
import { createCanvas, loadImage } from "canvas";

import ffmpeg from 'fluent-ffmpeg';
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobe.path);

export function createThumbnail(videoPath, thumbNameWithBinExt, thumbDir) {
    return new Promise(async (resolve, reject) => {
        const tempThumbName = `${path.parse(thumbNameWithBinExt).name}.jpg`;
        const tempOutputPath = path.join(thumbDir, tempThumbName);
        const finalOutputPath = path.join(thumbDir, thumbNameWithBinExt);

        const params = [
            '-i', videoPath,
            '-ss', '00:00:01',
            '-vframes', '1',
            '-vf', 'scale=320:-1',
            '-q:v', '5',
            tempOutputPath
        ];

        execFile(ffmpegPath, params, async (error, stdout, stderr) => {
            if (error) {
                return reject(error);
            }

            try {
                await fs.rename(tempOutputPath, finalOutputPath);
                resolve(finalOutputPath);
            } catch (renameError) {
                reject(renameError);
            }
        });
    });
}

export async function downloadFile(url, filePath) {
    const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 20000,
        maxContentLength: 150 * 1024 * 1024,
    });
    await fs.writeFile(filePath, response.data);
    return response.data;
}

export function getVideoMetadata(filePath) {
    return new Promise((resolve, reject) => {
        const params = ["-v", "error", "-show_format", "-show_streams", "-of", "json", filePath];
        execFile(ffprobe.path, params, (error, stdout, stderr) => {
            if (error) {
                return reject(error);
            }
            try {
                const data = JSON.parse(stdout);
                const videoStream = data.streams.find(s => s.codec_type === 'video');
                if (!videoStream) {
                    return reject(new Error("Không tìm thấy video stream trong file."));
                }
                resolve({
                    width: videoStream.width || 0,
                    height: videoStream.height || 0,
                    duration: Math.round(parseFloat(data.format.duration || 0))
                });
            } catch (e) {
                reject(e);
            }
        });
    });
}
export function processYouTubeVideo(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .outputOptions([
                "-preset veryfast", "-movflags +faststart", "-vf scale=640:-2",
                "-c:v libx264", "-c:a aac", "-b:v 700k", "-b:a 128k",
            ])
            .save(outputPath)
            .on("end", resolve)
            .on("error", (err) => reject(err));
    });
}

export function convertToAac(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .audioCodec('aac')
            .save(outputPath)
            .on('end', resolve)
            .on('error', (err) => reject(err));
    });
}

export function muxImageAndAudioToVideo(imagePath, audioPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg()
            .addInput(imagePath)
            .inputOptions(['-loop 1'])
            .addInput(audioPath)
            .videoCodec('libx264')
            .audioCodec('aac')
            .outputOptions([
                '-shortest',
                '-pix_fmt yuv420p',
                '-movflags +faststart',
                '-vf scale=640:-2',
                '-r 24',
                '-tune stillimage',
                '-preset veryfast',
                '-crf 28',
                '-b:a 128k'
            ])
            .save(outputPath)
            .on('end', resolve)
            .on('error', (err) => reject(err));
    });
}

export async function createSoundCloudCanvas({
    title = "",
    artist = "",
    quality = "",
    thumbnailUrl = "",
}) {
    const width = 900;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

const grad = ctx.createLinearGradient(0, 0, width, height);
grad.addColorStop(0, "#ee9ca7");  // hồng 1
grad.addColorStop(1, "#ffdde1");  // hồng 2
ctx.fillStyle = grad;
ctx.fillRect(0, 0, width, height);
    let thumbImg = null;
    try {
        if (thumbnailUrl) {
            thumbImg = await loadImage(thumbnailUrl);
        }
    } catch {}

    const posterX = 24;
    const posterY = 24;
    const posterW = 372;
    const posterH = 372;
    if (thumbImg) {
        ctx.save();
        const radius = 24;
        ctx.beginPath();
        ctx.moveTo(posterX + radius, posterY);
        ctx.arcTo(posterX + posterW, posterY, posterX + posterW, posterY + posterH, radius);
        ctx.arcTo(posterX + posterW, posterY + posterH, posterX, posterY + posterH, radius);
        ctx.arcTo(posterX, posterY + posterH, posterX, posterY, radius);
        ctx.arcTo(posterX, posterY, posterX + posterW, posterY, radius);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(thumbImg, posterX, posterY, posterW, posterH);
        ctx.restore();
    } else {
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        ctx.fillRect(posterX, posterY, posterW, posterH);
    }

    const panelX = posterX + posterW + 24;
    const panelY = 24;
    const panelW = width - panelX - 24;
    const panelH = height - 48;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    const pr = 20;
    ctx.beginPath();
    ctx.moveTo(panelX + pr, panelY);
    ctx.arcTo(panelX + panelW, panelY, panelX + panelW, panelY + panelH, pr);
    ctx.arcTo(panelX + panelW, panelY + panelH, panelX, panelY + panelH, pr);
    ctx.arcTo(panelX, panelY + panelH, panelX, panelY, pr);
    ctx.arcTo(panelX, panelY, panelX + panelW, panelY, pr);
    ctx.closePath();
    ctx.fill();

    const safeTitle = String(title || "").slice(0, 120);
    const safeArtist = String(artist || "Unknown");
    const safeQuality = String(quality || "");

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px Arial";
    ctx.textBaseline = "top";
    wrapText(ctx, safeTitle, panelX + 24, panelY + 24, panelW - 48, 40, 2);

    ctx.font = "600 26px Arial";
    ctx.fillStyle = "#f0f0f0";
    ctx.fillText(`Artist: ${safeArtist}`, panelX + 24, panelY + 24 + 40 * 2 + 16);

    ctx.font = "500 22px Arial";
    ctx.fillStyle = "#f8f8f8";
    ctx.fillText(`Quality: ${safeQuality || 'n/a'}`, panelX + 24, panelY + 24 + 40 * 2 + 16 + 34);

    ctx.font = "bold 18px Arial";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("AutoDown • SoundCloud", panelX + 24, panelY + panelH - 28);

    const cacheDir = path.join("Data", "Cache");
    try { await fs.mkdir(cacheDir, { recursive: true }); } catch {}
    const outPath = path.join(cacheDir, `sc_card_${Date.now()}.png`);
    const buffer = canvas.toBuffer("image/png");
    await fs.writeFile(outPath, buffer);
    return outPath;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = text.split(/\s+/g);
    let line = "";
    let lineCount = 0;
    for (let n = 0; n < words.length; n++) {
        const testLine = line ? `${line} ${words[n]}` : words[n];
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && line) {
            ctx.fillText(line, x, y);
            y += lineHeight;
            line = words[n];
            lineCount++;
            if (lineCount >= maxLines - 1) {
                let remaining = words.slice(n).join(" ");
                while (ctx.measureText(remaining + "…").width > maxWidth && remaining.length > 0) {
                    remaining = remaining.slice(0, -1);
                }
                ctx.fillText(remaining + "…", x, y);
                return;
            }
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, y);
}

export async function createSoundCloudResultsCanvas(items = [], header = "SoundCloud Search") {
    const safeItems = Array.isArray(items) ? items.slice(0, 8) : [];
    const width = 1024;             // fixed width
    const margin = 24;              // outer margin
    const headerH = 100;            // header block height
    const rowH = 110;               // each row height
    const gap = 14;                 // gap between rows
    const idxColW = 56;             // index column width (more breathing room)
    const thumbSize = 84;           // thumbnail square size
    const innerPad = 18;            // padding inside row card

    const height = margin + headerH + (safeItems.length > 0 ? (safeItems.length * rowH + (safeItems.length - 1) * gap) : 0) + margin;
    const canvas = createCanvas(width, Math.max(height, headerH + margin * 2));
    const ctx = canvas.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, "#ee9ca7");
    grad.addColorStop(1, "#ffdde1");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const hdrX = margin;
    const hdrY = margin;
    const hdrW = width - margin * 2;
    const hdrH = headerH;
    roundedFill(ctx, hdrX, hdrY, hdrW, hdrH, 20, "rgba(0,0,0,0.25)");

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px Arial";
    const headerMax = hdrW - 32;
    wrapText(ctx, String(header || "Results"), hdrX + 16, hdrY + 31, headerMax, 36, 2);
    ctx.font = "500 18px Arial";
    ctx.fillStyle = "#f2f2f2";
    ctx.fillText(`Top ${safeItems.length} kết quả`, hdrX + 16, hdrY + hdrH - 26);

    let y = hdrY + hdrH + 30; // lowered more below header
    for (let i = 0; i < safeItems.length; i++) {
        const it = safeItems[i] || {};
        const rowX = margin;
        const rowW = width - margin * 2;

        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.15)";
        ctx.shadowBlur = 8;
        roundedFill(ctx, rowX, y, rowW, rowH, 18, "rgba(0,0,0,0.25)");
        ctx.restore();
        roundedStroke(ctx, rowX, y, rowW, rowH, 18, "rgba(255,255,255,0.08)", 1);

        const idxCenterX = rowX + 28;
        const idxCenterY = y + rowH / 2 ;
        filledCircle(ctx, idxCenterX, idxCenterY, 13, "rgba(255,255,255,0.18)");
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 16px Arial";
        const num = String(i + 1);
        const tW = ctx.measureText(num).width;
        ctx.fillText(num, idxCenterX - tW / 2, idxCenterY + 6);

        const thumbX = rowX + idxColW + innerPad;
        const thumbY = y + (rowH - thumbSize) / 2;
        roundedFill(ctx, thumbX, thumbY, thumbSize, thumbSize, 12, "rgba(255,255,255,0.16)");
        try {
            if (it.thumb) {
                const img = await loadImage(it.thumb);
                ctx.save();
                roundedClip(ctx, thumbX, thumbY, thumbSize, thumbSize, 12);
                ctx.drawImage(img, thumbX, thumbY, thumbSize, thumbSize);
                ctx.restore();
            }
        } catch {}

        const txtX = thumbX + thumbSize + innerPad;
        const txtW = rowX + rowW - innerPad - txtX; // ensures no overflow
        const title = String(it.title || "(no title)");
        const artist = String(it.artist || "Unknown");
        const meta = String(it.timestamp || it.release || "");

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 24px Arial";
        wrapText(ctx, title, txtX, y + innerPad + 6, txtW, 28, 2);

        ctx.fillStyle = "#f6f6f6";
        ctx.font = "500 16px Arial";
        drawEllipsis(ctx, artist, txtX, y + innerPad + 28 * 2 + 22, txtW);

        if (meta) {
            ctx.fillStyle = "#ececec";
            ctx.font = "500 14px Arial";
            drawEllipsis(ctx, meta, txtX, y + rowH - innerPad - 16, txtW);
        }

        y += rowH + gap;
    }

    const cacheDir = path.join("Data", "Cache");
    try { await fs.mkdir(cacheDir, { recursive: true }); } catch {}
    const outPath = path.join(cacheDir, `sc_results_${Date.now()}.png`);
    const buffer = canvas.toBuffer("image/png");
    await fs.writeFile(outPath, buffer);
    return outPath;
}

function roundedFill(ctx, x, y, w, h, r, fillStyle) {
    ctx.save();
    ctx.fillStyle = fillStyle;
    roundedPath(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.restore();
}

function roundedClip(ctx, x, y, w, h, r) {
    ctx.save();
    roundedPath(ctx, x, y, w, h, r);
    ctx.clip();
}

function roundedPath(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

function roundedStroke(ctx, x, y, w, h, r, strokeStyle, lineWidth = 1) {
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    roundedPath(ctx, x, y, w, h, r);
    ctx.stroke();
    ctx.restore();
}

function filledCircle(ctx, cx, cy, r, fillStyle) {
    ctx.save();
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawEllipsis(ctx, text, x, y, maxWidth) {
    const t = String(text || "");
    if (ctx.measureText(t).width <= maxWidth) {
        ctx.fillText(t, x, y);
        return;
    }
    let lo = 0, hi = t.length;
    while (lo < hi) {
        const mid = Math.floor((lo + hi + 1) / 2);
        const s = t.slice(0, mid) + "…";
        if (ctx.measureText(s).width <= maxWidth) lo = mid; else hi = mid - 1;
    }
    ctx.fillText(t.slice(0, lo) + "…", x, y);
}
