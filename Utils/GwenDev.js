
import axios from "axios";
import fs from "fs/promises";
import { execFile } from "child_process";
import ffmpegPath from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import path from "path";

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
