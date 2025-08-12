// Unified Caro API: prompts, Gemini helpers, and learning/storage
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { settings } from "../App/Settings.js";

// ===== Prompts (from CaroPrompt.js) =====
const BASE_HEADER = `
QUY TẮC XUẤT RA BẮT BUỘC:
- Chỉ trả về MỘT số nguyên duy nhất ứng với ô cần đánh (1..S*S).
- KHÔNG in giải thích, KHÔNG dấu chấm, KHÔNG ghi kèm ký tự nào khác.

MÔ HÌNH BÀN CỜ & CHỈ SỐ:
- Bàn cờ kích thước SxS. Ô được đánh số 1..S*S theo hàng (row-major):
  • Hàng 1: 1..S
  • Hàng 2: S+1..2S
  • ...
- Ký hiệu: X và O; '.' thể hiện ô trống.
- Bạn đánh với ký hiệu 'myMark'.
- Điều kiện thắng: có chuỗi liên tiếp 'need' quân theo hàng, cột hoặc chéo.

RÀNG BUỘC HỢP LỆ:
- TUYỆT ĐỐI không chọn ô đã bị chiếm (khác '.').
- Nếu không tìm thấy nước “rất tốt”, vẫn phải trả về MỘT ô trống hợp lệ (1..S*S).
- Không bao giờ trả về 0, số âm, hoặc số > S*S.
`;

const PATTERN_CATALOG = `
TỪ ĐIỂN MẪU HÌNH & KHÁI NIỆM:
- Five (len=need): chuỗi thắng. Nếu tạo được ngay => CHỌN NGAY.
- Open four: chuỗi dài (need-1) với 2 đầu mở. Nếu tạo được => gần như thắng cưỡng bức.
- Closed four: chuỗi dài (need-1) với 1 đầu mở. Vẫn rất mạnh, buộc đối thủ phải chặn ngay.
- Open three: chuỗi (need-2) với 2 đầu mở. Tạo đe doạ kép “4 mở” trong một nước.
- Closed three: chuỗi (need-2) với 1 đầu mở. Giá trị thấp hơn “open three”.
- Open two / Closed two: đà phát triển, ưu tiên khi gần trung tâm/đường chiến lược.
- Broken four: dạng bị ngắt một ô nhưng có thể thành 4/5 sau một nước.
- Double-threat (đòn kép): một nước đi tạo ra ít nhất HAI đường thắng trong lượt tiếp theo.
- VCF / VCT: chuỗi ép buộc bằng việc tạo/ép đối thủ chặn các “4 mở/3 mở”, cuối cùng dẫn tới thắng.
`;

const POSITIONAL_RULES = `
NGUYÊN TẮC VỊ TRÍ & GIAI ĐOẠN VÁN:
- Mở ván: nếu trung tâm trống => ƯU TIÊN trung tâm. Sau đó là các ô ở “vành trung tâm” (Manhattan ≤ 2..3).
- Kiểm soát trục & chéo trung tâm: đặt quân dọc theo đường trung tâm để tối đa hoá số đường thắng giao nhau.
- Tránh mép/góc khi nước đi không mở chuỗi/đe doạ hữu ích.
- Ưu tiên “gần giao tranh”: chọn ô quanh các nhóm quân đang tương tác (bán kính 2..3 ô).
- Nối dài chuỗi hiện có theo hướng có nhiều đầu mở hơn.
`;

const CANDIDATE_WINDOW = `
CỬA SỔ ỨNG VIÊN (Candidate Moves):
- Chỉ xét các ô trống:
  • Gần quân trên bàn (bán kính 2..3) hoặc trong vành trung tâm (Manhattan ≤ 2..3).
  • Gần nước vừa đi (của ta hoặc đối thủ) để duy trì áp lực.
- Loại bỏ các ô biên/góc nếu không tăng đe doạ hoặc phòng thủ.
`;

const PRIORITIES = `
THỨ TỰ ƯU TIÊN (TẤN CÔNG > PHÒNG THỦ):
1) Nếu ta có nước thắng ngay => CHỌN NGAY.
2) Nếu đối thủ có nước thắng ngay => CHẶN NGAY.
3) Tạo đòn kép (double-threat) => ƯU TIÊN.
4) Tạo “open four”, kế đến “closed four”.
5) Tạo “open three” (để đẩy vào 4 mở) > chặn “open three” của đối thủ.
6) Nối dài chuỗi theo hướng tăng số đầu mở; ưu tiên gần trung tâm/trục/chéo trung tâm.
7) Nếu các lựa chọn tương đương: chọn ô gần trung tâm hơn.
`;

const DEFENSE_RULES = `
PHÒNG THỦ CHIẾN LƯỢC:
- Chặn ngay khi đối thủ có “win-in-one”.
- Nếu đối thủ có khả năng tạo đòn kép ở lượt tới, chọn nước làm GIẢM TỐI ĐA số “win-in-one” của họ ở lượt sau.
- Nếu bắt buộc chọn giữa nhiều nước phòng thủ tương đương, ưu tiên ô gần trung tâm/đường chiến lược.
`;

const OUTPUT_DISCIPLINE = `
KỶ LUẬT XUẤT RA (RẤT QUAN TRỌNG):
- Sau khi phân tích, chỉ in MỘT SỐ DUY NHẤT (1..S*S) của ô trống tốt nhất.
- KHÔNG giải thích, KHÔNG xuống dòng thêm, KHÔNG kèm văn bản.
`;

const EASY = `${BASE_HEADER}
${PATTERN_CATALOG}
${POSITIONAL_RULES}
${CANDIDATE_WINDOW}
${PRIORITIES}
${DEFENSE_RULES}
${OUTPUT_DISCIPLINE}

ĐIỀU CHỈNH CHO EASY:
- Ưu tiên an toàn, tránh lỗi.
- Khi không rõ ràng: chọn gần trung tâm.
`;

const NORMAL = `${BASE_HEADER}
${PATTERN_CATALOG}
${POSITIONAL_RULES}
${CANDIDATE_WINDOW}
${PRIORITIES}
${DEFENSE_RULES}
${OUTPUT_DISCIPLINE}

ĐIỀU CHỈNH CHO NORMAL:
- Cân bằng công/thủ, ưu tiên 3 mở nếu chưa có 4 mở.
- Giữ ưu tiên trung tâm và tránh biên vô nghĩa.
`;

const HARD = `${BASE_HEADER}
${PATTERN_CATALOG}
${POSITIONAL_RULES}
${CANDIDATE_WINDOW}
${PRIORITIES}
${DEFENSE_RULES}
${OUTPUT_DISCIPLINE}

ĐIỀU CHỈNH CHO HARD:
- Ưu tiên tạo/duy trì đòn kép; phá đòn kép của đối thủ ngay khi có thể.
- Ưu tiên chuỗi mở 3/4 trên trục/chéo trung tâm.
- Không đi góc/biên nếu không gia tăng đe doạ hoặc ngăn đe doạ.
`;

const SUPER_HARD = `${BASE_HEADER}
${PATTERN_CATALOG}
${POSITIONAL_RULES}
${CANDIDATE_WINDOW}
${PRIORITIES}
${DEFENSE_RULES}
${OUTPUT_DISCIPLINE}

ĐIỀU CHỈNH CHO SUPER HARD (ưu tiên ép thắng):
- Nếu có chuỗi ép buộc kiểu VCF/VCT ngắn => CHỌN.
- Tạo double-threat > mọi lựa chọn khác; nếu đối thủ có thể tạo đòn kép => vô hiệu hoá ngay.
- Ưu tiên nối dài chuỗi theo hướng gia tăng số đầu mở; giữ trung tâm mạnh.
- Phòng thủ: chọn ô làm GIẢM TỐI ĐA số win-in-one của đối thủ ở lượt kế.
- Phân giải hoà: ưu tiên ô gần trung tâm/trục/chéo trung tâm.
`;

export const caroPrompts = {
  1: EASY,
  2: NORMAL,
  3: HARD,
  4: SUPER_HARD,
};

export function buildSystemPrompt(mode = 1) {
  return caroPrompts[mode] || caroPrompts[4];
}

// ===== Gemini helpers (from GeminiCore.js) =====
function toGeminiContents(messages) {
  return (messages || []).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "") }],
  }));
}

async function chatGemini(messages, systemPrompt) {
  const apiKey = settings.geminiApiKey;
  const model = settings.geminiModel || "gemini-2.5-flash";
  if (!apiKey) throw new Error("Missing settings.geminiApiKey (set in App/Settings.js or env GEMINI_API_KEY)");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: toGeminiContents(messages),
    systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    generationConfig: { temperature: 0.6, maxOutputTokens: 4096 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini error: ${await res.text()}`);
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || "").join("").trim();
  return text;
}

export async function askChatGPT(prompt, userId = "user", systemPrompt = "") {
  const messages = [{ role: "user", content: prompt }];
  return await chatGemini(messages, systemPrompt || undefined);
}

export async function suggestMove({ board, size, need, myMark, mode = 4, timeoutMs = 1200 }) {
  const render = () => {
    const out = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) {
        const idx = r * size + c;
        row.push(board[idx] || ".");
      }
      out.push(row.join(" "));
    }
    return out.join("\n");
  };
  const system = buildSystemPrompt(mode);
  const prompt = [
    `S = ${size}`,
    `need = ${need}`,
    `myMark = ${myMark}`,
    "Board ('.' là trống):",
    render(),
    "Yêu cầu: chỉ trả về MỘT số hợp lệ (1..S*S) là ô TRỐNG tốt nhất cho 'myMark'."
  ].join("\n");

  const reply = await Promise.race([
    askChatGPT(prompt, "caro-bot", system),
    new Promise((resolve) => setTimeout(() => resolve(""), Math.max(300, timeoutMs)))
  ]);
  const match = String(reply || "").match(/\d+/);
  if (!match) return -1;
  const pos = parseInt(match[0], 10) - 1;
  return Number.isInteger(pos) ? pos : -1;
}

// ===== Learning & logs (from CaroLearn.js) =====
const DATA_DIR = path.resolve("Data", "Caro");
const LEARN_FILE = path.join(DATA_DIR, "learn.json");
const LOG_DIR = path.join(DATA_DIR, "Logs");

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function defaultConfig() {
  return {
    modes: {
      1: { centerWeight: 1.0, vcfDepth: 1, vcfNodes: 500, patternScale: 1.0 },
      2: { centerWeight: 1.2, vcfDepth: 2, vcfNodes: 1200, patternScale: 1.0 },
      3: { centerWeight: 1.6, vcfDepth: 3, vcfNodes: 2500, patternScale: 1.1 },
      4: { centerWeight: 2.5, vcfDepth: 4, vcfNodes: 5000, patternScale: 1.2 }
    },
    history: []
  };
}

export async function loadLearnConfig(mode) {
  try {
    ensureDirs();
    if (!fs.existsSync(LEARN_FILE)) {
      fs.writeFileSync(LEARN_FILE, JSON.stringify(defaultConfig(), null, 2));
    }
    const raw = JSON.parse(fs.readFileSync(LEARN_FILE, "utf-8"));
    const m = raw?.modes?.[mode] || {};
    return { ...m };
  } catch {
    return {};
  }
}

export async function openGameLog({ mode, size }) {
  try {
    ensureDirs();
    const file = path.join(LOG_DIR, `game_${Date.now()}_m${mode}_s${size}.log`);
    fs.writeFileSync(file, "");
    return file;
  } catch {
    return null;
  }
}

export function appendGameLog(file, record) {
  try {
    if (!file) return;
    const line = JSON.stringify({ time: Date.now(), ...record });
    fs.appendFileSync(file, line + "\n");
  } catch {}
}

export async function learnFromOutcome({ mode, result }) {
  try {
    ensureDirs();
    const raw = fs.existsSync(LEARN_FILE)
      ? JSON.parse(fs.readFileSync(LEARN_FILE, "utf-8"))
      : defaultConfig();
    const m = raw.modes?.[mode] || {};
    // Simple heuristic updates
    if (result === "bot_lose") {
      m.centerWeight = Math.min(3.0, (m.centerWeight || 1.5) + 0.1);
      m.vcfDepth = Math.min(6, (m.vcfDepth || 3) + 1);
      m.vcfNodes = Math.min(12000, (m.vcfNodes || 3000) + 1000);
      m.patternScale = Math.min(2.0, (m.patternScale || 1.1) + 0.05);
    } else if (result === "bot_win") {
      m.centerWeight = Math.max(0.8, (m.centerWeight || 1.5) - 0.05);
      m.patternScale = Math.max(1.0, (m.patternScale || 1.1) - 0.02);
    }
    raw.modes[mode] = m;
    raw.history.push({ t: Date.now(), mode, result });
    while (raw.history.length > 200) raw.history.shift();
    fs.writeFileSync(LEARN_FILE, JSON.stringify(raw, null, 2));
  } catch {}
}


