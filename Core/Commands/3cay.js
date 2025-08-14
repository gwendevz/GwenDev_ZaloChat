// author @GwenDev
import fs from "fs";
import path from "path";
import { ThreadType } from "zca-js";
import { query } from "../../App/Database.js";

let createCanvas;
let loadImage;
try {
  const mod = await import("canvas");
  createCanvas = mod.createCanvas;
  loadImage = mod.loadImage;
} catch {}

const SUITS = ["spades", "hearts", "diamonds", "clubs"]; // ♠ ♥ ♦ ♣
const VALUES = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];

function buildDeck() {
  const deck = [];
  for (const v of VALUES) {
    for (const s of SUITS) {
      let weight = parseInt(v, 10);
      if (["J","Q","K"].includes(v)) weight = 10; 
      else if (v === "A") weight = 11; 
      deck.push({ value: v, suit: s, weight });
    }
  }
  return deck;
}

function shuffleDeck() {
  const d = buildDeck();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function cardToFile(value, suit) {
  const name =
    value === "J" ? "jack" :
    value === "Q" ? "queen" :
    value === "K" ? "king" :
    value === "A" ? "ace" :
    value;
  const file = `${name}_of_${suit}.png`;
  return path.resolve("Api", "Poker", "Image", file);
}

async function drawCardsImage(cardFiles) {
  if (!createCanvas || !loadImage) return null;
  try {
    const imgs = [];
    for (const f of cardFiles) {
      const buf = await fs.promises.readFile(f);
      imgs.push(await loadImage(buf));
    }
    const w = imgs[0].width;
    const h = imgs[0].height;
    const canvas = createCanvas(w * imgs.length, h);
    const ctx = canvas.getContext("2d");
    let x = 0;
    for (const img of imgs) {
      ctx.drawImage(img, x, 0, w, h);
      x += w;
    }
    const outDir = path.resolve("Data", "Cache", "BaCay");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `ba_cay_${Date.now()}.png`);
    await fs.promises.writeFile(outFile, canvas.toBuffer("image/png"));
    return outFile;
  } catch {
    return null;
  }
}

function calcPoint(cards) {
  let sum = 0;
  for (const c of cards) sum += c.weight;
  sum = sum % 10;
  return sum;
}

async function getDisplayName(api, uid) {
  try {
    const info = await api.getUserInfo(uid);
    const profiles = info?.changed_profiles || {};
    const key = Object.keys(profiles).find((k) => k.startsWith(String(uid)));
    const p = key ? profiles[key] : null;
    return p?.displayName || p?.zaloName || p?.username || String(uid);
  } catch {
    return String(uid);
  }
}

function buildMention(name) {
  return `@${name}`;
}

const tables = new Map();

async function dmHandToPlayer(api, player) {
  const icon = (s) => (s === "spades" ? "♠" : s === "hearts" ? "♥" : s === "diamonds" ? "♦" : "♣");
  const text = `Bài của bạn:\n${player.cards.map(c => `${c.value}${icon(c.suit)}`).join(" | ")}\n\nTổng điểm: ${player.point}`;
  const files = player.cards.map(c => cardToFile(c.value, c.suit));
  const img = await drawCardsImage(files);
  const payload = img ? { msg: text, attachments: [img], ttl: 30 * 60_000 } : { msg: text, ttl: 30 * 60_000 };
  try {
    const res = await api.sendMessage(payload, player.uid);
    if (img && fs.existsSync(img)) {
      await fs.promises.unlink(img).catch(() => {});
    }
    return res;
  } catch {
    return null;
  }
}

async function ensureUserBalance(uid, amount) {
  const rows = await query("SELECT coins FROM users WHERE uid = ?", [uid]);
  if (!rows.length) return { ok: false, coins: 0 };
  const v = Number(rows[0].coins || 0);
  return { ok: v >= amount, coins: v };
}

async function addBalance(uid, amount) {
  await query("UPDATE users SET coins = coins + ? WHERE uid = ?", [amount, uid]);
}

async function subBalance(uid, amount) {
  await query("UPDATE users SET coins = coins - ? WHERE uid = ?", [amount, uid]);
}

export default {
  name: "3cay",
  description: "Chơi 3 Cây đặt cược (gộp ảnh 3 lá bài và gửi riêng)",
  role: 0,
  cooldown: 2,
  group: "minigame",
  aliases: ["bacay"],
  noPrefix: false,

  async run({ message, api, args }) {
    const threadId = message.threadId;
    const threadType = message.type ?? ThreadType.User;
    const uid = message.data?.uidFrom;
    const sub = String(args[0] || "").toLowerCase();

  const help = () => api.sendMessage({ msg: [
      "🎴 3 Cây - Dùng:",
      ".3cay create <mức cược>",
      ".3cay join",
      ".3cay leave",
      ".3cay start",
      ".3cay swap",
      ".3cay ready",
      ".3cay info",
      ".3cay nonready",
    ].join("\n"), ttl: 60_000 }, threadId, threadType);

    if (!sub || !["create","join","leave","start","swap","ready","info","nonready"].includes(sub)) {
      return help();
    }

    const table = tables.get(threadId);

    if (sub === "create") {
      const bet = parseInt(args[1] || "", 10);
      if (!Number.isInteger(bet) || bet <= 0) {
        return api.sendMessage({ msg: "Mức cược không hợp lệ.", ttl: 60_000 }, threadId, threadType);
      }
      if (tables.has(threadId)) {
        return api.sendMessage({ msg: "Nhóm đã có bàn 3 Cây đang mở.", ttl: 60_000 }, threadId, threadType);
      }
      const bal = await ensureUserBalance(uid, bet);
      if (!bal.ok) {
        return api.sendMessage({ msg: `Bạn không đủ tiền. Cần ${bet.toLocaleString()} coins`, ttl: 60_000 }, threadId, threadType);
      }
      await subBalance(uid, bet);
      const name = await getDisplayName(api, uid);
      const t = {
        authorUid: uid,
        bet,
        deck: [],
        started: false,
        dealt: false,
        threadType,
        players: [{ uid, name, cards: [], swapsLeft: 2, point: 0, ready: false }],
      };
      tables.set(threadId, t);
      return api.sendMessage({ msg: `Đã tạo bàn 3 Cây với cược ${bet.toLocaleString()} coins. Người khác gõ .3cay join để tham gia.`, ttl: 60_000 }, threadId, threadType);
    }

    if (sub === "join") {
      if (!table) return api.sendMessage({ msg: "Chưa có bàn. Dùng .3cay create", ttl: 60_000 }, threadId, threadType);
      if (table.started) return api.sendMessage({ msg: "Bàn đã bắt đầu, không thể tham gia.", ttl: 60_000 }, threadId, threadType);
      if (table.players.some(p => String(p.uid) === String(uid))) return api.sendMessage({ msg: "Bạn đã tham gia bàn này rồi.", ttl: 60_000 }, threadId, threadType);
      const ok = await ensureUserBalance(uid, table.bet);
      if (!ok.ok) return api.sendMessage({ msg: `Bạn không đủ tiền. Cần ${table.bet.toLocaleString()} coins`, ttl: 60_000 }, threadId, threadType);
      await subBalance(uid, table.bet);
      const name = await getDisplayName(api, uid);
      table.players.push({ uid, name, cards: [], swapsLeft: 2, point: 0, ready: false });
      return api.sendMessage({ msg: `${name} đã tham gia bàn!`, ttl: 60_000 }, threadId, threadType);
    }

    if (sub === "leave") {
      if (!table) return api.sendMessage({ msg: "Không có bàn 3 Cây trong nhóm.", ttl: 60_000 }, threadId, threadType);
      const idx = table.players.findIndex(p => String(p.uid) === String(uid));
      if (idx === -1) return api.sendMessage({ msg: "Bạn chưa tham gia bàn này.", ttl: 60_000 }, threadId, threadType);
      if (table.started) return api.sendMessage({ msg: "Bàn đã bắt đầu, không thể rời.", ttl: 60_000 }, threadId, threadType);
      const isAuthor = String(table.authorUid) === String(uid);
      if (isAuthor) {
        tables.delete(threadId);
        return api.sendMessage({ msg: "Chủ bàn đã rời, bàn bị giải tán!", ttl: 60_000 }, threadId, threadType);
      }
      table.players.splice(idx, 1);
      return api.sendMessage({ msg: "Đã rời bàn 3 Cây.", ttl: 60_000 }, threadId, threadType);
    }

    if (sub === "start") {
      if (!table) return api.sendMessage({ msg: "Chưa có bàn. Dùng .3cay create", ttl: 60_000 }, threadId, threadType);
      if (String(table.authorUid) !== String(uid)) return api.sendMessage({ msg: "Chỉ chủ bàn mới được bắt đầu.", ttl: 60_000 }, threadId, threadType);
      if (table.started) return api.sendMessage({ msg: "Bàn đã bắt đầu rồi.", ttl: 60_000 }, threadId, threadType);
      if (table.players.length <= 1) return api.sendMessage({ msg: "Cần ít nhất 2 người chơi.", ttl: 60_000 }, threadId, threadType);

      table.deck = shuffleDeck();
      table.started = true;
      table.dealt = true;

      for (const p of table.players) {
        p.cards = [table.deck.shift(), table.deck.shift(), table.deck.shift()];
        p.point = calcPoint(p.cards);
      }

      for (const p of table.players) {
        await dmHandToPlayer(api, p);
      }

      return api.sendMessage({ msg: "Đã chia bài (gửi riêng từng người). Mỗi người có 2 lượt .3cay swap. Dùng .3cay ready khi sẵn sàng.", ttl: 60_000 }, threadId, threadType);
    }

    if (sub === "swap") {
   
      let useThreadId = threadId;
      let useThreadType = threadType;
      let useTable = table;
      let player = null;

      const findPlayerTable = () => {
        for (const [tid, tbl] of tables) {
          const found = tbl.players.find(x => String(x.uid) === String(uid));
          if (found && tbl.started && tbl.dealt) {
            return { tid, tbl, p: found };
          }
        }
        return null;
      };

      if (!useTable || !useTable.started || !useTable.dealt) {
        const f = findPlayerTable();
        if (!f) return api.sendMessage({ msg: "Bạn không có bàn 3 Cây nào đang chơi để đổi bài.", ttl: 60_000 }, threadId, threadType);
        useThreadId = f.tid;
        useThreadType = f.tbl.threadType || ThreadType.Group;
        useTable = f.tbl;
        player = f.p;
      } else {
        player = useTable.players.find(x => String(x.uid) === String(uid));
      }

      if (!player) return api.sendMessage({ msg: "Bạn không ở trong bàn này.", ttl: 60_000 }, threadId, threadType);
      if (player.ready) return api.sendMessage({ msg: "Bạn đã ready, không thể đổi bài.", ttl: 60_000 }, threadId, threadType);
      if (player.swapsLeft <= 0) return api.sendMessage({ msg: "Bạn đã dùng hết lượt đổi bài.", ttl: 60_000 }, threadId, threadType);

      const idx = Math.floor(Math.random() * 3);
      const newCard = useTable.deck.shift();
      player.cards[idx] = newCard;
      player.point = calcPoint(player.cards);
      player.swapsLeft -= 1;

      try {
        await dmHandToPlayer(api, player);
      } catch {}

      try {
        const tag = buildMention(player.name || String(uid));
        const msg = `${tag} vừa bốc 1 lá.`;
        const pos = msg.indexOf(tag);
        return api.sendMessage({ msg, mentions: [{ pos, len: tag.length, uid }], ttl: 60_000 }, useThreadId, useThreadType);
      } catch {
       
      }
    }

    if (sub === "ready") {
      if (!table || !table.started || !table.dealt) return api.sendMessage({ msg: "Chưa thể ready.", ttl: 60_000 }, threadId, threadType);
      const p = table.players.find(x => String(x.uid) === String(uid));
      if (!p) return api.sendMessage({ msg: "Bạn không ở trong bàn này.", ttl: 60_000 }, threadId, threadType);
      if (p.ready) return api.sendMessage({ msg: "Bạn đã ready rồi.", ttl: 60_000 }, threadId, threadType);
      p.ready = true;
      const remaining = table.players.filter(x => !x.ready).length;
      if (remaining > 0) {
        const notReady = table.players.filter(x => !x.ready).map(x => x.name || String(x.uid));
        return api.sendMessage({ msg: [
          `${p.name} đã sẵn sàng. Còn ${remaining} người chưa ready:`,
          notReady.join(", ")
        ].join("\n"), ttl: 60_000 }, threadId, threadType);
      }
      const ranked = [...table.players].sort((a, b) => b.point - a.point);
      const pot = table.bet * table.players.length;
      try { await addBalance(ranked[0].uid, pot); } catch {}
      const icon = (s) => (s === "spades" ? "♠" : s === "hearts" ? "♥" : s === "diamonds" ? "♦" : "♣");
      const lines = ranked.map((r, i) => {
        const str = r.cards.map(c => `${c.value}${icon(c.suit)}`).join(" | ");
        return `${i + 1}. ${r.name}: ${str} => ${r.point} nút`;
      });
      tables.delete(threadId);
      return api.sendMessage({ msg: [
        "Kết quả:\n",
        ...lines,
        "",
        `Người đứng đầu nhận: ${pot.toLocaleString()} coins`,
      ].join("\n"), ttl: 60_000 }, threadId, threadType);
    }

    if (sub === "info") {
      if (!table) return api.sendMessage({ msg: "Không có bàn 3 Cây.", ttl: 60_000 }, threadId, threadType);
      return api.sendMessage(
        { msg: [
          "=== 3 Cây ===",
          `- Chủ bàn: ${table.authorUid}`,
          `- Cược: ${table.bet.toLocaleString()} coins`,
          `- Người chơi: ${table.players.length}`,
          `- Trạng thái: ${table.started ? "Đang chơi" : "Đang chờ"}`,
        ].join("\n"), ttl: 60_000 },
        threadId,
        threadType,
      );
    }

    if (sub === "status" || sub === "nonready") {
      if (!table) return api.sendMessage({ msg: "Không có bàn 3 Cây.", ttl: 60_000 }, threadId, threadType);
      const readyCnt = table.players.filter(p => p.ready).length;
      const list = table.players.filter(p => !p.ready).map(p => p.name || String(p.uid));
      if (!list.length) return api.sendMessage({ msg: `Tất cả đã ready (${readyCnt}/${table.players.length}).`, ttl: 60_000 }, threadId, threadType);
      return api.sendMessage({ msg: [
        `Đang chờ ready: ${table.players.length - readyCnt} người`,
        list.join(", ")
      ].join("\n"), ttl: 60_000 }, threadId, threadType);
    }
  },
};


