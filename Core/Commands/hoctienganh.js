// author waguri kaori
import axios from "axios";
import fs from "fs";
import path from "path";
import { ThreadType } from "zca-js";
import { settings } from "../../App/Settings.js";
import { query } from "../../App/Database.js";
import { dangKyReply } from "../../Handlers/HandleReply.js";
import { createCanvas, loadImage } from "canvas";

const CACHE = path.join("Data", "Cache", "hoctienganh");
fs.mkdirSync(CACHE, { recursive: true });

function userFile(uid){return path.join(CACHE,`${uid}.json`);} 
function load(uid){if(fs.existsSync(userFile(uid)))return JSON.parse(fs.readFileSync(userFile(uid),"utf8"));return {last:0};}
function save(uid,data){fs.writeFileSync(userFile(uid),JSON.stringify(data,null,2));}

function geminiURL() {
  const key = settings.geminiApiKey;
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  const model = settings.geminiModel || "gemini-2.5-flash";
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
}
async function gemini(prompt, max_tokens = 256, temperature = 0.7) {
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature, maxOutputTokens: max_tokens },
  };
  const { data } = await axios.post(geminiURL(), body, { headers: { "Content-Type": "application/json" } });
  return (
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("")?.trim() || ""
  );
}

async function buildTestQuestions() {
  const prompt = `Create 24 English multiple-choice questions for learners. Return ONLY valid JSON array where each element has: "q" (question), "a" (option A), "b", "c", "d", and "ans" (one of A/B/C/D). Example:
[{"q":"...","a":"...","b":"...","c":"...","d":"...","ans":"A"}, ...]
Do NOT wrap in markdown.`;
  try {
    const txt = await gemini(prompt, 800, 0.9);
    const jsonStart = txt.indexOf("[");
    const json = JSON.parse(txt.slice(jsonStart));
    if (Array.isArray(json) && json.length >= 24) return json.slice(0, 24);
  } catch {}
  try {
    const raw = fs.readFileSync(path.join("Api", "HocTiengAnh", "questions.json"), "utf8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length >= 24) {
      return arr.sort(() => Math.random() - 0.5).slice(0, 24);
    }
  } catch {}
  return [
    { q: "Fallback: 2+2= ?", a: "3", b: "4", c: "5", d: "22", ans: "B" },
  ].sort(() => Math.random() - 0.5).slice(0, 24);
}

function wrap(ctx, text, x, y, maxW, lh) {
  const words = String(text||"").split(/\s+/g);
  let line="";
  for(const w of words){
    const test=line?line+" "+w:w;
    if(ctx.measureText(test).width>maxW){ ctx.fillText(line,x,y); y+=lh; line=w; } else line=test; }
  if(line) { ctx.fillText(line,x,y); }
  return y+lh;
}

async function getUserProfile(api, uid) {
  try {
    const info = await api.getUserInfo(uid);
    const changed = info?.changed_profiles?.[uid];
    const basic = info?.[uid] || {};
    const displayName = changed?.displayName || changed?.zaloName || basic.displayName || basic.zaloName || basic.username || String(uid);
    const avatar = changed?.thumbSrc || changed?.avatar || basic.thumbnailUrl || basic.avatar || "";
    return { displayName, avatar };
  } catch {
    return { displayName: String(uid), avatar: "" };
  }
}

async function makeQuestionCard({ qObj, idx, total, name, avatarUrl }) {
  const W=1080, H=600;
  const canvas=createCanvas(W,H);
  const ctx=canvas.getContext("2d");

  ctx.fillStyle="#58CC02"; ctx.fillRect(0,0,W,H);

  const cardW=W-120, cardH=H-160; const cardX=(W-cardW)/2, cardY=(H-cardH)/2;
  const radius=28;
  ctx.fillStyle="#ffffff";
  ctx.beginPath();
  ctx.moveTo(cardX+radius,cardY);
  ctx.arcTo(cardX+cardW,cardY,cardX+cardW,cardY+cardH,radius);
  ctx.arcTo(cardX+cardW,cardY+cardH,cardX,cardY+cardH,radius);
  ctx.arcTo(cardX,cardY+cardH,cardX,cardY,radius);
  ctx.arcTo(cardX,cardY,cardX+cardW,cardY,radius);
  ctx.closePath(); ctx.fill();

  const avSize=120; const avX=cardX+40, avY=cardY-avSize/2;
  ctx.fillStyle="#ffffff"; ctx.beginPath(); ctx.arc(avX+avSize/2,avY+avSize/2,avSize/2,0,Math.PI*2); ctx.fill();
  try{ if(avatarUrl){ const img=await loadImage(avatarUrl); ctx.save(); ctx.beginPath(); ctx.arc(avX+avSize/2,avY+avSize/2,avSize/2-4,0,Math.PI*2); ctx.clip(); ctx.drawImage(img,avX+4,avY+4,avSize-8,avSize-8); ctx.restore(); }}catch{}

  ctx.fillStyle="#333"; ctx.font="600 30px Arial"; ctx.fillText(name, avX+avSize+24, cardY+20);
  ctx.font="500 22px Arial"; ctx.fillStyle="#666"; ctx.fillText(`Câu ${idx}/${total}`, avX+avSize+24, cardY+20+34);

  const qX=cardX+40, qY=cardY+120, qMaxW=cardW-80;
  ctx.fillStyle="#000"; ctx.font="bold 28px Arial"; const nextY=wrap(ctx,qObj.q,qX,qY,qMaxW,34);
  const opts=["A","B","C","D"], vals=[qObj.a,qObj.b,qObj.c,qObj.d];
  ctx.font="24px Arial"; let oy=nextY+30;
  for(let i=0;i<4;i++){ const boxH=48; const boxY=oy; const color="#EDEFF4";
    ctx.fillStyle=color; ctx.roundRect?ctx.roundRect(qX,boxY,qMaxW,boxH,14,true,false): (ctx.fillRect(qX,boxY,qMaxW,boxH));
    ctx.fillStyle="#000"; ctx.fillText(`${opts[i]}. ${vals[i]}`, qX+16, boxY+32);
    oy+=boxH+20;
  }

  const out=path.join("Data","Cache",`qa_${Date.now()}.png`);
  fs.writeFileSync(out, canvas.toBuffer("image/png"));
  return out;
}

export default {
  name: "hoctienganh",
  aliases: [],
  description: "Luyện tiếng Anh",
  role: 0,
  cooldown: 5,
  group: "group",

  async run({ message, api, args }) {
    const uid = message.data?.uidFrom;
    const threadId = message.threadId;
    const threadType = message.type ?? ThreadType.User;
    const sub = (args?.[0] || "").toLowerCase();
    const user = load(uid);

    // ---------- default help ----------
    if(!sub){return api.sendMessage("📚 Học Tiếng Anh\n• hoctienganh kiemtra – Làm 24 câu\n• hoctienganh diemso – Xem điểm\n• hoctienganh top – BXH",threadId,threadType);} 

    // ---------- kiểm tra 24 câu ----------
    if (sub === "kiemtra") {
      let questions;
      try {
        questions = await buildTestQuestions();
      } catch {
        questions = await buildTestQuestions();
      }
      const state = {
        mode: "test",
        list: questions,
        idx: 0,
        correct: 0,
      };
      save(uid, { ...user, state });

      const sendQ = async (qObj, idx) => {
     
        if (state.prevMsgId) {
          try { await api.undo({ msgId: state.prevMsgId, cliMsgId: state.prevCliMsgId||0 }, threadId, threadType);} catch {}
        }
        const profile = await getUserProfile(api, uid);
        const imgPath = await makeQuestionCard({ qObj, idx, total:24, name: profile.displayName, avatarUrl: profile.avatar });
        const caption = `❓ Câu ${idx}/24 – Trả lời A/B/C/D hoặc 'nopbai' để nộp.`;
        const sentRes = await api.sendMessage({ msg: caption, attachments:[imgPath] }, threadId, threadType);
        const flatten = v => (Array.isArray(v)?v.flat(Infinity):[v]);
        const all = flatten(sentRes).filter(Boolean);
        const first = all[0] || {};
        const mid = first?.message?.msgId ?? first?.msgId ?? first?.attachment?.[0]?.msgId ?? null;
        const cid = first?.message?.cliMsgId ?? first?.cliMsgId ?? null;
        state.prevMsgId = mid; state.prevCliMsgId = cid;

        dangKyReply({
          msgId: mid,
          cliMsgId: cid,
          threadId,
          authorId: uid,
          command: "hoctienganh-test",
          data: { uid, state },
          ttlMs: 30*60_000,
          handler: replyHandler,
        });
        return sentRes;
      };

      async function replyHandler({ message: rep, api: _api, content }) {
          const upper = content.trim().toUpperCase();
          const data = load(uid);
          if (!data.state || data.state.mode !== "test") return { clear: true };

          
          if (["NOPBAI", "XONG", "SUBMIT"].includes(upper)) {
            const right = data.state.correct;
            const totalDone = data.state.idx;
            const percent = totalDone ? Math.round((right / totalDone) * 100) : 0;
            await _api.sendMessage(`Bạn đã nộp bài sớm. Đúng ${right}/${totalDone} câu (${percent}%).`, threadId, threadType);
            await query(`UPDATE users SET tienganh = COALESCE(tienganh,0) + ? WHERE uid = ?`, [right, uid]);
            const d=load(uid);d.last=right;save(uid,d);
            return { clear: true };
          }

          const answer = upper[0];
          if (!"ABCD".includes(answer)) return { clear: false };

          const cur = data.state.list[data.state.idx];
          if (answer === cur.ans.toUpperCase()) data.state.correct++;
          data.state.idx++;

          if (data.state.idx >= 24) {
            
            const right = data.state.correct;
            const percent = Math.round((right / 24) * 100);
            await api.sendMessage(
              ` Hoàn thành! Bạn đúng ${right}/24 câu (${percent}%).`,
              threadId,
              threadType
            );
           
            await query(`UPDATE users SET tienganh = COALESCE(tienganh,0) + ? WHERE uid = ?`, [right, uid]);
            const d=load(uid);d.last=right;save(uid,d);
            return { clear: true };
          } else {
            save(uid, data);
            const nextQ = data.state.list[data.state.idx];
            const newMsg = await sendQ(nextQ, data.state.idx+1);
            save(uid, data);
            const newMid = newMsg?.message?.msgId ?? newMsg?.msgId;
            const newCid = newMsg?.message?.cliMsgId ?? newMsg?.cliMsgId ?? 0;
            return { clear: true };
          }
      }

      await sendQ(questions[0],1);
      return;
    }

    if (sub === "batdau") {
      const loading = await api.sendMessage("🤖 Đang tạo câu hỏi...", threadId, threadType);
      let q;
      try {
        const prompt = `Create ONE English question for conversation.`;
        q = await gemini(prompt, 80, 0.8);
      } catch {
        q = "What is your favorite season and why?";
      }
      await api.undo({ msgId: loading.messageID, cliMsgId: 0 }, threadId, threadType);
      await api.sendMessage(`❓ ${q}\n👉 Trả lời bằng cách phản hồi tin nhắn này.`, threadId, threadType);
      return;
    }

    if(sub==="diemso"){const [row]=await query("SELECT tienganh FROM users WHERE uid=?",[uid]);const score=row?.tienganh??0;return api.sendMessage(`🎯 Điểm của bạn: ${score}/24`,threadId,threadType);} 

    if(sub==="top"){const rows=await query("SELECT uid,name,tienganh FROM users WHERE tienganh IS NOT NULL ORDER BY tienganh DESC LIMIT 10");if(!rows.length)return api.sendMessage("Chưa có dữ liệu.",threadId,threadType);
     
      const uids=rows.map(r=>r.uid);const avatars={};try{const info=await api.getUserInfo(uids);const map=info.changed_profiles||{};rows.forEach(r=>{const k=Object.keys(map).find(x=>x.startsWith(r.uid));if(k)avatars[r.uid]=map[k].avatar;});}catch{}
      const W=700,rowH=70,headerH=100,H=headerH+rows.length*rowH+40;const canvas=createCanvas(W,H);const ctx=canvas.getContext("2d");const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,"#1b2735");g.addColorStop(1,"#090a0f");ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
      ctx.fillStyle="#fff";ctx.font="bold 40px Arial";ctx.textAlign="center";ctx.fillText("ENGLISH RANK TOP 10",W/2,60);ctx.textAlign="left";
      for(let i=0;i<rows.length;i++){const y=headerH+i*rowH;const rank=i+1; // avatar circle
        if(avatars[rows[i].uid]){try{const buf=await axios.get(avatars[rows[i].uid],{responseType:"arraybuffer"});const img=await loadImage(buf.data);const sz=50;ctx.save();ctx.beginPath();ctx.arc(60,y+rowH/2,sz/2,0,Math.PI*2);ctx.closePath();ctx.clip();ctx.drawImage(img,35,y+rowH/2-sz/2,sz,sz);ctx.restore();}catch{}}
        ctx.fillStyle="#f1c40f";ctx.font="bold 28px Arial";ctx.fillText(String(rank),10,y+rowH/2+10);
        ctx.fillStyle="#ecf0f1";ctx.font="24px Arial";ctx.fillText(rows[i].name||"User",100,y+rowH/2+10);
        ctx.fillStyle="#e67e22";ctx.textAlign="right";ctx.fillText(`${rows[i].tienganh}`,W-40,y+rowH/2+10);ctx.textAlign="left";}
      const dir=path.join("Data","Cache","EngRank");if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});const out=path.join(dir,`rank_${Date.now()}.png`);fs.writeFileSync(out,canvas.toBuffer("image/png"));await api.sendMessage({msg:"🏆 Bảng Xếp Hạng",attachments:[out]},threadId,threadType);return;}

    await api.sendMessage(" Lệnh không hợp lệ!", threadId, threadType);
  },
};
