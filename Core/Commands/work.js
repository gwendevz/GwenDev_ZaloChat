// author @GwenDev
import { query } from "../../App/Database.js";
import { dangKyReply } from "../../Handlers/HandleReply.js";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import https from "https";

const works = [
    {
        name: 'Câu Cá',
        prefixMsg: "⚡ Chúc Mừng. Bạn Vừa Câu Được:",
        done: [
            ['Cá Đèn Lồng', 'https://i.imgur.com/BXng765.jpeg'],
            ['Cá Mập', 'https://i.imgur.com/dyLyvOA.jpeg'],
            ['Tôm Tít', 'https://i.imgur.com/YJiCTWH.jpeg'],
            ['Cá Ngừ', 'https://i.imgur.com/eshOIiJ.jpeg'],
            ['Cá Thu', 'https://i.imgur.com/YAS5iGM.jpeg'],
            ['Cá Koi', 'https://i.imgur.com/BXwB4xZ.png'],
            ['Cá Trê', 'https://i.imgur.com/IE6LQU3.png'],
            ['Tôm Hùm Đất', 'https://i.imgur.com/XbSWNha.png'],
            ['Cá Kiếm', 'https://i.imgur.com/nLndbMc.png'],
            ['Cá Vẹt', 'https://i.imgur.com/7H5XwLb.png'],
            ['Cá Hề', 'https://i.imgur.com/cLvJZlM.png'],
            ['Cá Vây Tay', 'https://i.imgur.com/jw5bqu7.png'],
            ['Cá Chép', 'https://i.imgur.com/7hVzeDJ.png'],
            ['Cá Mập Trắng Lớn', 'https://i.imgur.com/TuMhGBS.png'],
            ['Cá Mập Nhám Búa', 'https://i.imgur.com/JDVZ3J7.jpeg'],
            ['Cá Hồi', 'https://i.imgur.com/wKijFF0.png'],
            ['Cá Khủng Long Hoàng Đế', 'https://i.imgur.com/w42NHef.png'],
            ['Cá Hồng Vịnh', 'https://i.imgur.com/UjdnHhE.png'],
            ['Cá Vượng Miệng Rộng', 'https://i.imgur.com/Cw0qh57.png'],
            ['Cá Betta', 'https://i.imgur.com/d33003f.png'],
            ['Cá Rô Phi', 'https://i.imgur.com/sqBRoDe.png'],
            ['Cá Ngừ Đại Dương', 'https://i.imgur.com/A1qXwXV.png'],
            ['Cá Nhám Voi', 'https://i.imgur.com/K7Qy4mI.png'],
            ['Cá Pecca Vàng', 'https://i.imgur.com/S9Qqr3D.png'],
            ['Cá Mù Lán Chấm Hoa', 'https://i.imgur.com/A5XeYbS.png'],
        ]
    },
    {
        name: 'Săn Thú Hoang',
        prefixMsg: "⚡ Chúc Mừng. Bạn Vừa Săn Được:",
        done: [
            ['Con Rắn', 'https://i.imgur.com/Q7vv6mG.jpg'],
            ['Con Rồng Komodo', 'https://i.imgur.com/Y8mfwPN.jpeg'],
            ['Con Bói Cá', 'https://i.imgur.com/XAM9Ne6.jpeg'],
            ['Con Gấu Nâu', 'https://i.imgur.com/A3OxqoB.jpeg'],
            ['Con Rắn Anaconda', 'https://i.imgur.com/4z6kr8V.jpeg'],
            ['Con Hươu', 'https://i.imgur.com/lHQKacE.jpg'],
            ['Con Heo Rừng', 'https://i.imgur.com/eQQUR3s.jpg'],
            ['Con Sư Tử', 'https://i.imgur.com/ThGSaPn.jpg'],
        ]
    },
    {
        name: 'Khai Thác Mỏ',
        prefixMsg: "⚡ Chúc Mừng. Bạn Vừa Khai Thác Được:",
        done: [
            ['Viên Kim Cương', 'https://i.imgur.com/9cHq8nN.png'],
            ['Vàng', 'https://i.imgur.com/HB0Bmqo.jpg'],
            ['Quặng Sắt', 'https://i.imgur.com/wD0VEZ8.png'],
            ['Ngọc Lục Bảo', 'https://i.imgur.com/NyYurEd.jpg'],
            ['Ngọc Anh Tím', 'https://i.imgur.com/8kc5m2L.jpg'],
            ['Than Đá', 'https://i.imgur.com/CY3lCqx.jpg'],
            ['Ruby Cực Hiếm', 'https://i.imgur.com/OoP1Smk.jpg'],
        ]
    },
    {
        name: 'Bắn Chim',
        prefixMsg: "⚡ Chúc Mừng. Bạn Vừa Bắn Hạ Được:",
        done: [
            ['Chim Đen', 'https://i.imgur.com/IPeNm8n.jpeg'],
            ['Đại Bàng', 'https://i.imgur.com/EklUNah.jpeg'],
            ['Chim Én', 'https://i.imgur.com/kUhS155.jpeg'],
            ['Chim Vành Khuyên', 'https://i.imgur.com/DErkrnd.jpeg'],
            ['Chim Đuôi Dài', 'https://i.imgur.com/PMaurmG.jpeg'],
            ['Chim Chích Chòe', 'https://i.imgur.com/muJCa5P.jpeg'],
            ['Vẹt', 'https://i.imgur.com/2nN01CY.jpeg'],
            ['Chim Họa Mi', 'https://i.imgur.com/88Cq2Hf.jpeg'],
            ['Chim Chào Mào', 'https://i.imgur.com/9R8BrMF.jpeg'],
            ['Chim Sẻ', 'https://i.imgur.com/yZcWTT6.jpeg'],
            ['Chim Vàng Anh', 'https://i.imgur.com/bk9a6e4.jpeg'],
            ['Chim Chìa Vôi', 'https://i.imgur.com/SxhsgX2.jpeg'],
            ['Chim Cu Gáy', 'https://i.imgur.com/ZdFZQ1N.jpeg'],
            ['Chim Yến Phụng', 'https://i.imgur.com/FG61Y7R.jpeg'],
            ['Chim Sơn Ca', 'https://i.imgur.com/XZSGXkL.jpeg'],
        ]
    }
];

const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const formatTime = (ms) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export default {
    name: "work",
    description: "Làm việc kiếm tiền",
    role: 0,
    cooldown: 0,
    group: "work",
    aliases: ["làm việc", "kiếm tiền", "công việc"],
    noPrefix: false,

    async run({ message, api }) {
        const threadId = message.threadId;
        const threadType = message.type;
        const uid = message.data?.uidFrom;

        const [userExists] = await query("SELECT uid FROM users WHERE uid = ?", [uid]);
        if (!userExists) {
            return api.sendMessage("Bạn chưa có tài khoản trong hệ thống. Vui lòng tương tác với bot trước.", threadId, threadType);
        }

        const workList = works.map((work, index) => `${index + 1}. ${work.name}`).join('\n');

        const workMessage = `🧾 𝐃𝐚𝐧𝐡 𝐒𝐚́𝐜𝐡 𝐂𝐨̂𝐧𝐠 𝐕𝐢𝐞̣̂𝐜.\n${workList}\n⋆─────────────⋆\n• Reply+ STT Để Chọn Công Việc\n• Thời Gian Hồi Sức Là 2 Giờ\n• Có Tỉ Lệ Gặp Tai Nạn Khi Làm Việc`;

        const res = await api.sendMessage({ msg: workMessage, ttl: 2*60*60_000 }, threadId, threadType);
        const msgId = res?.message?.msgId ?? res?.msgId ?? null;
        const cliMsgId = res?.message?.cliMsgId ?? res?.cliMsgId ?? null;

        dangKyReply({
            msgId,
            cliMsgId,
            threadId,
            authorId: uid,
            command: "work",
            onReply: async ({ message, api, content }) => {
                const replyNumber = parseInt(content.trim());
                const senderUid = message.data?.uidFrom;
                const replyThreadId = message.threadId;

                if (isNaN(replyNumber) || replyNumber < 1 || replyNumber > works.length) {
                    await api.sendMessage({ msg: " Số thứ tự không hợp lệ! Vui lòng chọn từ 1-4.", ttl: 2*60*60_000 }, replyThreadId, message.type);
                    return { clear: false };
                }

                const work = works[replyNumber - 1];
                const [user] = await query("SELECT work_cooldown FROM users WHERE uid = ?", [senderUid]);
                const now = Date.now();
                const cooldownTime = 2 * 60 * 60 * 1000;

                if (!user) {
                    await api.sendMessage({ msg: "Bạn chưa có tài khoản trong hệ thống. Vui lòng tương tác với bot trước.", ttl: 2*60*60_000 }, replyThreadId, message.type);
                    return { clear: false };
                }

                if (user.work_cooldown && now < user.work_cooldown) {
                    const remaining = user.work_cooldown - now;
                    await api.sendMessage({ msg: ` Bạn cần chờ ${formatTime(remaining)} để làm việc tiếp theo!`, ttl: 2*60*60_000 }, replyThreadId, message.type);
                    return { clear: false };
                }

                await query(
                    "UPDATE users SET work_cooldown = ? WHERE uid = ?",
                    [now + cooldownTime, senderUid]
                );

                const workingMsg = await api.sendMessage({ msg: ` Đang ${work.name}...`, ttl: 2*60*60_000 }, replyThreadId, message.type);

                await new Promise(resolve => setTimeout(resolve, 3500));

                if (Math.random() < 0.2) {
                    try {
                        await api.undo({ 
                            msgId: workingMsg.messageID, 
                            cliMsgId: workingMsg.cliMsgId || 0 
                        }, replyThreadId, message.type);
                    } catch {}
                    await api.sendMessage({ msg: `⚠️ Ôi Không Bạn Gặp Tai Nạn Trong Lúc Làm Việc.`, ttl: 2*60*60_000 }, replyThreadId, message.type);
                    return { clear: true };
                }

                const result = work.done[Math.floor(Math.random() * work.done.length)];
                const money = random(200000, 1000000);

                const resultMessage = `${work.prefixMsg} ${result[0]}\n💵 Nhận Được: ${money.toLocaleString()}$\n💳 Tiền Đã Được Đưa Vào Ngân Hàng Của Bạn`;

                await query(
                    "UPDATE users SET coins = coins + ? WHERE uid = ?",
                    [money, senderUid]
                );

                try {
                    await api.undo({ 
                        msgId: workingMsg.messageID, 
                        cliMsgId: workingMsg.cliMsgId || 0 
                    }, replyThreadId, message.type);
                } catch {}

                if (result[1]) {
                    try {
                        const cacheDir = path.resolve("Data", "Cache");
                        await fsp.mkdir(cacheDir, { recursive: true });
                        const fileName = `work_${Date.now()}.jpg`;
                        const filePath = path.join(cacheDir, fileName);

                        await new Promise((resolve, reject) => {
                            const file = fs.createWriteStream(filePath);
                            https.get(result[1], (res) => {
                                res.pipe(file);
                                file.on("finish", () => file.close(resolve));
                            }).on("error", async (err) => {
                                await fsp.unlink(filePath).catch(() => {});
                                reject(err);
                            });
                        });

                        await api.sendMessage({
                            msg: resultMessage,
                            attachments: [filePath],
                            ttl: 2*60*60_000
                        }, replyThreadId, message.type);

                        await fsp.unlink(filePath).catch(() => {});
                    } catch {
                        await api.sendMessage({ msg: resultMessage, ttl: 2*60*60_000 }, replyThreadId, message.type);
                    }
                } else {
                    await api.sendMessage({ msg: resultMessage, ttl: 2*60*60_000 }, replyThreadId, message.type);
                }

                return { clear: true };
            }
        });
    }
};
