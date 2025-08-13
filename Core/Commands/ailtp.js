import fs from "fs";
import path from "path";
import { createCanvas, loadImage } from "canvas";
import axios from "axios";
import { query } from "../../App/Database.js";
import { ThreadType } from "zca-js";
import { dangKyReply, clearPendingReply } from "../../Handlers/HandleReply.js";

const ACTIVE_GAMES = new Map();

const DATA_DIR = path.resolve("Api", "AiLaTrieuPhu");
const DATA_PATH = path.join(DATA_DIR, "questions.json");
const REWARD_ARR = [
  1000, 2000, 3000, 5000, 7000, 10000, 15000, 22000, 30000, 40000, 55000, 70000, 90000, 120000, 150000,
];

const MODE_MULT = { easy: 1, normal: 2, hard: 3 };
function buildRewardArr(mode = 'normal') {
  const mult = MODE_MULT[mode] || 1;
  return REWARD_ARR.map(v => v * mult);
}
let DATASET = null;
function loadDataset(filePath) {
  if (DATASET) return DATASET;
  try {
    const raw = fs.readFileSync(filePath || DATA_PATH, "utf-8");
    DATASET = JSON.parse(raw);
  } catch {
    DATASET = [];
  }
  return DATASET;
}

export default {
  name: "altp",
  aliases: ["trieuphu", "ailatrieuphu"],
  group: "game",
  role: 0,
  cooldown: 5,
  description: "Chơi Ai Là Triệu Phú",
  noPrefix: false,

  async run({ message, api, args }) {
    const sub = (args[0] || '').toLowerCase();
    const threadId = message.threadId;
    const threadType = message.type ?? ThreadType.User;
    const uid = message.data?.uidFrom;

    if (sub === 'start' || sub === 'play') {
      if (ACTIVE_GAMES.has(threadId)) {
        return api.sendMessage(
          '[ HELP ] • Đang Có Người Diễn Ra Trò Chơi Trên Nhóm Này',
          threadId,
          threadType
        );
      }
      const pickMsg = [
        '🎮 Chọn độ khó Ai Là Triệu Phú:',
        '1) Easy',
        '2) Normal',
        '3) Hard',
        '❓ Trả lời 1-3 hoặc easy/normal/hard'
      ].join('\n');
      const sent = await api.sendMessage(pickMsg, threadId, threadType);
      const msgId = sent?.message?.msgId ?? sent?.msgId ?? null;
      const cliMsgId = sent?.message?.cliMsgId ?? sent?.cliMsgId ?? 0;
      const parseMode = (txt) => {
        const t = String(txt || '').trim().toLowerCase();
        if (t === '1' || t === 'easy') return 'easy';
        if (t === '2' || t === 'normal') return 'normal';
        if (t === '3' || t === 'hard') return 'hard';
        return '';
      };
      const loadPathByMode = (mode) => {
        if (mode === 'easy') return path.join(DATA_DIR, 'questions_easy.json');
        if (mode === 'hard') return path.join(DATA_DIR, 'questions_hard.json');
        return path.join(DATA_DIR, 'questions_normal.json');
      };
      const startWithMode = async (mode) => {
        const fp = loadPathByMode(mode);
        
        DATASET = null;
        const dataset = loadDataset(fp);
        if (!Array.isArray(dataset) || dataset.length === 0) {
          return api.sendMessage("Dataset rỗng hoặc không đọc được.", threadId, threadType);
        }
        const QUESTIONS = [...dataset];
        QUESTIONS.sort(() => Math.random() - 0.5);
        const maxQ = Math.min(15, QUESTIONS.length);
        const rewardArr = buildRewardArr(mode);
        const game = {
          index: 0,
          uid,
          winnings: 0,
          lifeline5050:false,
          lifelineCall:false,
          lifelineAudience:false,
          questions: QUESTIONS.slice(0, maxQ),
          timerId: null,
          rewardArr,
          mode
        };
        ACTIVE_GAMES.set(threadId, game);
        const CACHE_DIR = path.resolve("Data", "Cache", "AiLaTrieuPhu");
        if (!fs.existsSync(CACHE_DIR)) await fs.promises.mkdir(CACHE_DIR, { recursive: true });
        function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
          const words = text.split(' ');
          let line = '';
          for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            const testWidth = metrics.width;
            if (testWidth > maxWidth && n > 0) {
              ctx.fillText(line, x, y);
              line = words[n] + ' ';
              y += lineHeight;
            } else {
              line = testLine;
            }
          }
          ctx.fillText(line, x, y);
          return y;
        }
        async function createImage(qObj, idx) {
          const width = 1000, height = 600;
          const canvas = createCanvas(width, height);
          const ctx = canvas.getContext('2d');
          const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
          bgGrad.addColorStop(0, '#001a4d');
          bgGrad.addColorStop(1, '#000428');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, width, height);
          ctx.fillStyle = '#ffdf00';
          ctx.font = 'bold 28px Arial';
          ctx.fillText(`CÂU ${idx + 1}`, 30, 50);
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          ctx.fillRect(30, 80, 600, 140);
          ctx.strokeStyle = '#ffdf00';
          ctx.lineWidth = 2;
          ctx.strokeRect(30, 80, 600, 140);
          ctx.fillStyle = '#ffffff';
          ctx.font = '22px Arial';
          wrapText(ctx, qObj.question, 40, 110, 580, 30);
          const letters = ['A', 'B', 'C', 'D'];
          const boxPos = [ [30, 250],[330, 250],[30, 320],[330, 320] ];
          qObj.choices.forEach((c, i) => {
            const [x, y] = boxPos[i];
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillRect(x, y, 270, 50);
            ctx.strokeStyle = '#00aaff';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, 270, 50);
            ctx.fillStyle = '#00aaff';
            ctx.font = 'bold 24px Arial';
            ctx.fillText(letters[i], x + 10, y + 35);
            ctx.fillStyle = '#ffffff';
            ctx.font = '20px Arial';
            ctx.fillText(c, x + 40, y + 35);
          });
          ctx.font = '18px Arial';
          ctx.textAlign = 'right';
          const milestoneIdx = [4, 9, 14];
          rewardArr.forEach((val, i) => {
            const y = 100 + i * 28;
            if (i === idx) {
              ctx.fillStyle = '#ffdf00';
              ctx.fillRect(width - 200, y - 18, 170, 24);
              ctx.fillStyle = '#000';
            } else if (milestoneIdx.includes(i)) {
              ctx.fillStyle = '#ffa500';
            } else {
              ctx.fillStyle = '#ffffff';
            }
            ctx.fillText(`${i + 1}. ${val.toLocaleString()}`, width - 40, y);
          });
          ctx.textAlign = 'left';
          ctx.fillStyle = '#ffdf00';
          ctx.font = 'bold 22px Arial';
          ctx.fillText(`Tiền thưởng: ${game.winnings.toLocaleString()}$`, 30, height - 40);
          const lifelines = ['50:50', '📞', '👥'];
          lifelines.forEach((t, i) => {
            const x = 700 + i * 90; const y = 40;
            ctx.strokeStyle = '#ffdf00'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(x, y, 25, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#ffffff'; ctx.font = '18px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(t, x, y);
          });
          const filePath = path.join(CACHE_DIR, `q_${Date.now()}_${idx}.png`);
          await fs.promises.writeFile(filePath, canvas.toBuffer());
          return filePath;
        }
        const sendQ = async () => {
          if (game.timerId) { try { clearTimeout(game.timerId); } catch {} game.timerId = null; }
          const qObj = game.questions[game.index];
          if (!qObj._displayChoices) {
            const order = [0,1,2,3].sort(() => Math.random() - 0.5);
            const displayChoices = order.map((i) => qObj.choices[i]);
            const displayCorrectIdx = order.indexOf(qObj.answer);
            qObj._order = order; qObj._displayChoices = displayChoices; qObj._displayCorrect = displayCorrectIdx;
          }
          const letters = ['A','B','C','D'];
          const imgPath = await createImage({ ...qObj, choices: qObj._displayChoices, answer: qObj._displayCorrect }, game.index);
          const body = [
            `⚙️ Chế độ: ${game.mode.toUpperCase()}`,
            '•  A B C D -> Trả Lời Câu Hỏi',
            '•  call -> Gọi Trợ Giúp Người Thân',
            '•  ask -> Hỏi Ý Kiến Khán Giả',
            '•  stop -> Dừng Cuộc Chơi & Nhận Thưởng'
          ].join('\n');
          if (game.prevMsgId) { try { api.undo({ msgId: game.prevMsgId, cliMsgId: game.prevCliMsgId || 0 }, threadId, threadType); } catch {} }
          const sendRes = await api.sendMessage({ msg: body, attachments: [imgPath], ttl: 60_000 }, threadId, threadType);
          const flatten = (v) => (Array.isArray(v) ? v.flat(Infinity) : [v]);
          const all = flatten(sendRes).filter(Boolean);
          const first = all[0] || {};
          const msgId2 = first?.message?.msgId ?? first?.msgId ?? first?.attachment?.[0]?.msgId ?? null;
          const cliMsgId2 = first?.message?.cliMsgId ?? first?.cliMsgId ?? null;
          game.prevMsgId = msgId2; game.prevCliMsgId = cliMsgId2;
          dangKyReply({
            msgId: msgId2, cliMsgId: cliMsgId2, threadId, authorId: uid, command: 'ailtp', data: game,
            onReply: async ({ message: m, content }) => {
              if (game.timerId) { try { clearTimeout(game.timerId); } catch {} game.timerId = null; }
              const ans = content.trim().toLowerCase();
              if (ans === '50' || ans === '5050') {
                if (game.lifeline5050) { await api.sendMessage('[ HELP ] • Bạn Đã Sử Dụng Quyền Hạn 5050', threadId, threadType); return { clear: false }; }
                game.lifeline5050 = true;
                const wrongIdx = [0,1,2,3].filter(i=>i!==qObj._displayCorrect && qObj._displayChoices[i] !== '---');
                wrongIdx.sort(()=>Math.random()-0.5);
                const removed = wrongIdx.slice(0,2);
                removed.forEach(di => { qObj._displayChoices[di] = '---'; });
                await sendQ();
                return { clear: true };
              }
              if (ans === 'stop') {
                if (game.timerId) { try { clearTimeout(game.timerId);} catch{} }
                await api.sendMessage(`[ WIN ] •  Chúc Mừng Bạn Đã Dừng Cuộc Chơi Và Nhận Về: ${game.winnings.toLocaleString()}$`, threadId, threadType);
                ACTIVE_GAMES.delete(threadId); clearPendingReply(threadId); return { clear: true };
              }
              if (ans === 'call' || ans === '📞') {
                if (game.lifelineCall) { await api.sendMessage('[ HELP ] • Bạn Đã Dùng Quyền Hạn Gọi Người Thân Rồi', threadId, threadType); return { clear:false }; }
                game.lifelineCall = true; const letter = letters[qObj._displayCorrect]; await api.sendMessage(`📞 Người thân nghĩ đáp án đúng là: ${letter}`, threadId, threadType); return { clear:false };
              }
              if (ans === 'ask' || ans === '👥') {
                if (game.lifelineAudience) { await api.sendMessage('[ HELP ] • Bạn Đã Dùng Quyền Hạn Hỏi Khán Giả Rồi', threadId, threadType); return { clear:false }; }
                game.lifelineAudience = true; const perc = [0,0,0,0]; perc[qObj._displayCorrect] = 40; let remain = 60; const others = [0,1,2,3].filter(i=>i!==qObj._displayCorrect);
                others.forEach((i,idx)=>{ const val = idx<others.length-1? Math.floor(Math.random()*remain):remain; perc[i]=val; remain-=val; });
                const msgPoll = perc.map((p,i)=>`${letters[i]}: ${p}%`).join('\n'); await api.sendMessage(`👥 Khán giả bình chọn:\n${msgPoll}`, threadId, threadType); return { clear:false };
              }
              const map = { a:0,b:1,c:2,d:3, '1':0,'2':1,'3':2,'4':3 };
              if (!(ans in map)) { await api.sendMessage('⚙️ Vui Lòng Reply Tin Nhắn Bot\n•  A B C D -> Trả Lời Câu Hỏi\n•  call -> Gọi Trợ Giúp Người Thân\n•  ask -> Hỏi Ý Kiến Khán Giả\n•  stop -> Dừng Cuộc Chơi & Nhận Thưởng', threadId, threadType); return { clear: false }; }
              const choice = map[ans]; const correct = choice === qObj._displayCorrect;
              if (correct) {
                const add = game.rewardArr[game.index] || 0; game.winnings += add; await query("UPDATE users SET coins = COALESCE(coins,0) + ? WHERE uid = ?", [add, uid]);
                if (game.index + 1 >= maxQ) {
                  await api.sendMessage(`[ SUPER ] • Chúc Mừng Bạn Trở Thành Triệu Phú Và Nhận Về: ${game.winnings.toLocaleString()}$`, threadId, threadType);
                  await query('UPDATE users SET altp_max = GREATEST(COALESCE(altp_max,0), ?) WHERE uid = ?', [game.index, uid]);
                  ACTIVE_GAMES.delete(threadId); clearPendingReply(threadId); return { clear: true };
                }
                game.index += 1; await query('UPDATE users SET altp_max = GREATEST(COALESCE(altp_max,0), ?) WHERE uid = ?', [game.index, uid]); await sendQ(); return { clear: true };
              }
              await api.sendMessage(`[ LOSE ] • Bạn Đã Thua Cuộc. Đáp Án Đúng Là: ${letters[qObj._displayCorrect]}`, threadId, threadType);
              ACTIVE_GAMES.delete(threadId); clearPendingReply(threadId); return { clear: true };
            },
          });
          game.timerId = setTimeout(async () => {
            try { await api.sendMessage('[ LOSE ] • Bạn Đã Thua Cuộc Do Quá Thời Gian Trả Lời (60s).', threadId, threadType); } catch {}
            ACTIVE_GAMES.delete(threadId); clearPendingReply(threadId);
          }, 60_000);
          setTimeout(() => { fs.promises.unlink(imgPath).catch(() => {}); }, 60_000);
          setTimeout(() => { ACTIVE_GAMES.delete(threadId); }, 15 * 60_000);
        };
        await sendQ();
      };
      dangKyReply({
        msgId, cliMsgId, threadId, authorId: uid, command: 'ailtp',
        onReply: async ({ content }) => {
          const mode = parseMode(content);
          if (!mode) { await api.sendMessage('Vui lòng chọn: 1 (Easy) / 2 (Normal) / 3 (Hard)', threadId, threadType); return { clear: false }; }
          await startWithMode(mode);
          return { clear: true };
        }
      });
      return;
    }

    if (!sub || sub === 'help') {
      return api.sendMessage(
        [
          '🎮 MiniGame Ai Là Triệu Phú',
          '⋆────────────────⋆',
          '⚙️ Usage',
          'altp play -> Bắt Đầu Chơi',
          'altp rank -> Kiểm Tra Top',
          '',
          '⚙️ Reply',
          '5050 -> Loại 2 Đáp Án',
          'call -> Gọi Người Thân',
          'ask -> Hỏi Khán Giả',
          'stop -> Dừng Trò Chơi & Nhận Thưởng',
          '',
          '❓ Hãy Là Người Chơi - Đừng Can Thiệp AI ❤️'
        ].join('\n'),
        threadId,
        threadType
      );
    }

    if (sub === 'rank') {
      try {
        const rows = await query('SELECT uid, name, altp_max FROM users WHERE altp_max IS NOT NULL ORDER BY altp_max DESC LIMIT 10');
        if (!rows.length) {
          return api.sendMessage('Chưa có dữ liệu bảng xếp hạng.', threadId, threadType);
        }

        const uids = rows.map(r => r.uid);
        const avatars = {};
        try {
          const info = await api.getUserInfo(uids);
          const map = info.changed_profiles || {};
          rows.forEach(r => {
            const k = Object.keys(map).find(x => x.startsWith(r.uid));
            if (k) avatars[r.uid] = map[k].avatar;
          });
        } catch {}

        const width = 700;
        const rowH = 70;
        const headerH = 100;
        const height = headerH + rows.length * rowH + 40;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        const g = ctx.createLinearGradient(0, 0, 0, height);
        g.addColorStop(0, '#0f2027');
        g.addColorStop(1, '#203a43');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#ffdf00';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('AI LÀ TRIỆU PHÚ TOP 10', width / 2, 60);

        ctx.textAlign = 'left';
        for (let i = 0; i < rows.length; i++) {
          const y = headerH + i * rowH;
          const rank = i + 1;

          if (avatars[rows[i].uid]) {
            try {
              const buf = await axios.get(avatars[rows[i].uid], { responseType: 'arraybuffer' });
              const img = await loadImage(buf.data);
              const sz = 50;
              ctx.save();
              ctx.beginPath();
              ctx.arc(60, y + rowH / 2, sz / 2, 0, Math.PI * 2);
              ctx.closePath();
              ctx.clip();
              ctx.drawImage(img, 35, y + rowH / 2 - sz / 2, sz, sz);
              ctx.restore();
            } catch {}
          }

          ctx.fillStyle = '#ffdf00';
          ctx.font = 'bold 28px Arial';
          ctx.fillText(String(rank), 10, y + rowH / 2 + 10);

          ctx.fillStyle = '#ecf0f1';
          ctx.font = '24px Arial';
          ctx.fillText(rows[i].name || 'Không rõ', 100, y + rowH / 2 + 10);

          ctx.fillStyle = '#e67e22';
          ctx.font = '24px Arial';
          ctx.textAlign = 'right';
          ctx.fillText(`Level ${rows[i].altp_max}`, width - 40, y + rowH / 2 + 10);
          ctx.textAlign = 'left';
        }

        const dir = path.resolve('Data', 'Cache', 'AltpRank');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `altp_rank_${Date.now()}.png`);
        fs.writeFileSync(file, canvas.toBuffer('image/png'));

        const result = await api.sendMessage({ msg: '🏆 Bảng Xếp Hạng Ai Là Triệu Phú', attachments: [file] }, threadId, threadType);

        try {
          if (fs.existsSync(file)) await fs.promises.unlink(file).catch(() => {});
        } catch {}

        return result;
      } catch (err) {
        return api.sendMessage('Lỗi lấy bảng xếp hạng.', threadId, threadType);
      }
    }
    const dataset = loadDataset(path.join(DATA_DIR, 'questions_normal.json'));
    if (!Array.isArray(dataset) || dataset.length === 0) {
      return api.sendMessage("Dataset rỗng hoặc không đọc được.", threadId, threadType);
    }
    const QUESTIONS = [...dataset]; QUESTIONS.sort(() => Math.random() - 0.5);
    const maxQ = Math.min(15, QUESTIONS.length);
    const rewardArr = buildRewardArr('normal');
    const game = { index: 0, uid, winnings: 0, lifeline5050:false, lifelineCall:false, lifelineAudience:false, questions: QUESTIONS.slice(0, maxQ), timerId: null, rewardArr, mode: 'normal' };
    ACTIVE_GAMES.set(threadId, game);
    const CACHE_DIR = path.resolve("Data", "Cache", "AiLaTrieuPhu");
    if (!fs.existsSync(CACHE_DIR)) await fs.promises.mkdir(CACHE_DIR, { recursive: true });

    function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
      const words = text.split(' ');
      let line = '';
      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
          ctx.fillText(line, x, y);
          line = words[n] + ' ';
          y += lineHeight;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, x, y);
      return y;
    }

    async function createImage(qObj, idx) {
      const width = 1000, height = 600;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
     
      const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
      bgGrad.addColorStop(0, '#001a4d');
      bgGrad.addColorStop(1, '#000428');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#ffdf00';
      ctx.font = 'bold 28px Arial';
      ctx.fillText(`CÂU ${idx + 1}`, 30, 50);

      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(30, 80, 600, 140);
      ctx.strokeStyle = '#ffdf00';
      ctx.lineWidth = 2;
      ctx.strokeRect(30, 80, 600, 140);

      ctx.fillStyle = '#ffffff';
      ctx.font = '22px Arial';
      wrapText(ctx, qObj.question, 40, 110, 580, 30);

      const letters = ['A', 'B', 'C', 'D'];
      const boxPos = [
        [30, 250],
        [330, 250],
        [30, 320],
        [330, 320],
      ];
      qObj.choices.forEach((c, i) => {
        const [x, y] = boxPos[i];
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x, y, 270, 50);
        ctx.strokeStyle = '#00aaff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, 270, 50);

        ctx.fillStyle = '#00aaff';
        ctx.font = 'bold 24px Arial';
        ctx.fillText(letters[i], x + 10, y + 35);

        ctx.fillStyle = '#ffffff';
        ctx.font = '20px Arial';
        ctx.fillText(c, x + 40, y + 35);
      });

      ctx.font = '18px Arial';
      ctx.textAlign = 'right';
      const milestoneIdx = [4, 9, 14];
      rewardArr.forEach((val, i) => {
        const y = 100 + i * 28; 
        if (i === idx) {
          ctx.fillStyle = '#ffdf00';
          ctx.fillRect(width - 200, y - 18, 170, 24);
          ctx.fillStyle = '#000';
        } else if (milestoneIdx.includes(i)) {
          ctx.fillStyle = '#ffa500';
        } else {
          ctx.fillStyle = '#ffffff';
        }
        ctx.fillText(`${i + 1}. ${val.toLocaleString()}`, width - 40, y);
      });

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffdf00';
      ctx.font = 'bold 22px Arial';
      ctx.fillText(`Tiền thưởng: ${game.winnings.toLocaleString()}$`, 30, height - 40);

      const lifelines = ['50:50', '📞', '👥'];
      lifelines.forEach((t, i) => {
        const x = 700 + i * 90;
        const y = 40;
        ctx.strokeStyle = '#ffdf00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = '18px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t, x, y);
      });

      const filePath = path.join(CACHE_DIR, `q_${Date.now()}_${idx}.png`);
      await fs.promises.writeFile(filePath, canvas.toBuffer());
      return filePath;
    }

    const sendQ = async () => {

      if (game.timerId) {
        try { clearTimeout(game.timerId); } catch {}
        game.timerId = null;
      }

      const qObj = game.questions[game.index];
      if (!qObj._displayChoices) {
        const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
        const displayChoices = order.map((i) => qObj.choices[i]);
        const displayCorrectIdx = order.indexOf(qObj.answer);
        qObj._order = order; 
        qObj._displayChoices = displayChoices;
        qObj._displayCorrect = displayCorrectIdx;
      }

      const letters = ["A", "B", "C", "D"];
      const imgPath = await createImage({ ...qObj, choices: qObj._displayChoices, answer: qObj._displayCorrect }, game.index);

      const body = [
        '⚙️ Vui Lòng Reply Tin Nhắn Bot',
        '•  A B C D -> Trả Lời Câu Hỏi',
        '•  call -> Gọi Trợ Giúp Người Thân',
        '•  ask -> Hỏi Ý Kiến Khán Giả',
        '•  stop -> Dừng Cuộc Chơi & Nhận Thưởng'
      ].join('\n');
      if (game.prevMsgId) {
        try { api.undo({ msgId: game.prevMsgId, cliMsgId: game.prevCliMsgId || 0 }, threadId, threadType); } catch {}
      }

      const sendRes = await api.sendMessage({ msg: body, attachments: [imgPath], ttl: 60_000 }, threadId, threadType);
      try {
        console.log("[AILTP] sendRes:", JSON.stringify(sendRes, null, 2));
      } catch {}
      const flatten = (v) => (Array.isArray(v) ? v.flat(Infinity) : [v]);
      const all = flatten(sendRes).filter(Boolean);
      const first = all[0] || {};
      const msgId = first?.message?.msgId ?? first?.msgId ?? first?.attachment?.[0]?.msgId ?? null;
      const cliMsgId = first?.message?.cliMsgId ?? first?.cliMsgId ?? null;
      game.prevMsgId = msgId;
      game.prevCliMsgId = cliMsgId;

      dangKyReply({
        msgId,
        cliMsgId,
        threadId,
        authorId: uid,
        command: "ailtp",
        data: game,
        onReply: async ({ message: m, content }) => {
      
          if (game.timerId) {
            try { clearTimeout(game.timerId); } catch {}
            game.timerId = null;
          }

          const ans = content.trim().toLowerCase();
          if (ans === '50' || ans === '5050') {
            if (game.lifeline5050) {
              await api.sendMessage('[ HELP ] • Bạn Đã Sử Dụng Quyền Hạn 5050', threadId, threadType);
              return { clear: false };
            }
            game.lifeline5050 = true;
            const wrongIdx = [0,1,2,3].filter(i=>i!==qObj._displayCorrect && qObj._displayChoices[i] !== '---');
            wrongIdx.sort(()=>Math.random()-0.5);
            const removed = wrongIdx.slice(0,2);
            removed.forEach(di => { qObj._displayChoices[di] = '---'; });
            await sendQ(); 
            return { clear: true };
          }
          if (ans === "stop") {
            if (game.timerId) { try { clearTimeout(game.timerId);} catch{} }
            await api.sendMessage(`[ WIN ] •  Chúc Mừng Bạn Đã Dừng Cuộc Chơi Và Nhận Về: ${game.winnings.toLocaleString()}$`, threadId, threadType);
            ACTIVE_GAMES.delete(threadId);
            clearPendingReply(threadId);
            return { clear: true };
          }
          if (ans === 'call' || ans === '📞') {
            if (game.lifelineCall) {
              await api.sendMessage('[ HELP ] • Bạn Đã Dùng Quyền Hạn Gọi Người Thân Rồi', threadId, threadType);
              return { clear:false };
            }
            game.lifelineCall = true;
            const letter = letters[qObj._displayCorrect];
            await api.sendMessage(`📞 Người thân nghĩ đáp án đúng là: ${letter}`, threadId, threadType);
            return { clear:false };
          }

          if (ans === 'ask' || ans === '👥') {
            if (game.lifelineAudience) {
              await api.sendMessage('[ HELP ] • Bạn Đã Dùng Quyền Hạn Hỏi Khán Giả Rồi', threadId, threadType);
              return { clear:false };
            }
            game.lifelineAudience = true;
          
            const perc = [0,0,0,0];
            perc[qObj._displayCorrect] = 40;
            let remain = 60;
            const others = [0,1,2,3].filter(i=>i!==qObj._displayCorrect);
            others.forEach((i,idx)=>{
              const val = idx<others.length-1? Math.floor(Math.random()*remain):remain;
              perc[i]=val;
              remain-=val;
            });
            const msgPoll = perc.map((p,i)=>`${letters[i]}: ${p}%`).join('\n');
            await api.sendMessage(`👥 Khán giả bình chọn:
${msgPoll}`, threadId, threadType);
            return { clear:false };
          }
          const map = { a: 0, b: 1, c: 2, d: 3, "1": 0, "2": 1, "3": 2, "4": 3 };

          console.log("[AILTP] User reply:", ans, "| uid:", uid);
          if (!(ans in map)) {
            await api.sendMessage('⚙️ Vui Lòng Reply Tin Nhắn Bot\n•  A B C D -> Trả Lời Câu Hỏi\n•  call -> Gọi Trợ Giúp Người Thân\n•  ask -> Hỏi Ý Kiến Khán Giả\n•  stop -> Dừng Cuộc Chơi & Nhận Thưởng', threadId, threadType);
            return { clear: false };
          }
          const choice = map[ans];
          const correct = choice === qObj._displayCorrect;
          if (correct) {
            const add = game.rewardArr[game.index] || 0;
            game.winnings += add;
            await query("UPDATE users SET coins = COALESCE(coins,0) + ? WHERE uid = ?", [add, uid]);
            if (game.index + 1 >= maxQ) {
              await api.sendMessage(`[ SUPER ] • Chúc Mừng Bạn Trở Thành Triệu Phú Và Nhận Về: ${game.winnings.toLocaleString()}$`, threadId, threadType);
              await query('UPDATE users SET altp_max = GREATEST(COALESCE(altp_max,0), ?) WHERE uid = ?', [game.index, uid]);
              ACTIVE_GAMES.delete(threadId);
              clearPendingReply(threadId);
              return { clear: true };
            }
            game.index += 1;
            await query('UPDATE users SET altp_max = GREATEST(COALESCE(altp_max,0), ?) WHERE uid = ?', [game.index, uid]);
            await sendQ();
            return { clear: true };
          }
          await api.sendMessage(`[ LOSE ] • Bạn Đã Thua Cuộc. Đáp Án Đúng Là: ${letters[qObj._displayCorrect]}`, threadId, threadType);
          ACTIVE_GAMES.delete(threadId);
          clearPendingReply(threadId);
          return { clear: true };
        },
      });

      game.timerId = setTimeout(async () => {
        try {
          await api.sendMessage('[ LOSE ] • Bạn Đã Thua Cuộc Do Quá Thời Gian Trả Lời (60s).', threadId, threadType);
        } catch {}
        ACTIVE_GAMES.delete(threadId);
        clearPendingReply(threadId);
      }, 60_000);
     
      setTimeout(() => {
        fs.promises.unlink(imgPath).catch(() => {});
      }, 60_000);
     
      setTimeout(() => {
        ACTIVE_GAMES.delete(threadId);
      }, 15 * 60_000); 
    };

    await sendQ();
  },
};
