import { user, findUserByNameInThread } from "../Database/User.js";
import { role } from "../Database/Admin.js";
import { query } from "../App/Database.js";
import { handleCommands } from "./HandleCommands.js";
import { ThreadType } from "zca-js";
import { askChatGPT } from "../Api/ChatGPT.js";

function removeVietnamese(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getExistingUIDsInThread(threadId) {
  const rows = await query(`SELECT uid FROM users WHERE thread_id = ?`, [threadId]);
  return new Set(rows.map(r => r.uid));
}

async function getGroupMembers(api, groupData, threadId) {
  let members = groupData?.currentMems || [];
  if (members.length > 0) return members;

  let uids = [];

  if (Array.isArray(groupData.memberIds) && groupData.memberIds.length > 0) {
    uids = groupData.memberIds;
  } else if (Array.isArray(groupData.memVerList)) {
    uids = groupData.memVerList.map(e => e.split("_")[0]);
  }

  const existingUIDs = await getExistingUIDsInThread(threadId);
  const filteredUIDs = uids.filter(uid => !existingUIDs.has(uid));

  const results = [];
  const fetchedThisRun = new Set();
  const batchSize = 50;

  for (let i = 0; i < filteredUIDs.length; i += batchSize) {
    const batch = filteredUIDs.slice(i, i + batchSize);
    const batchPromises = batch.map(async id => {
      if (fetchedThisRun.has(id)) return null;

      try {
        const userInfo = await api.getUserInfo(id);
        const profile = userInfo.changed_profiles?.[id] || {};
        const fullName = profile.displayName || profile.zaloName || profile.username || "Không tên";
        await user(id, fullName, threadId, groupData.name || "Không tên");
        fetchedThisRun.add(id);
        return { uid: id, name: fullName };
      } catch {
        return null;
      }
    });

    const resultsBatch = await Promise.all(batchPromises);
    results.push(...resultsBatch.filter(Boolean));
    await sleep(5000);
  }

  return results;
}

function randomReply(array) {
  return array[Math.floor(Math.random() * array.length)];
}

export async function handleMessage(message, api) {
  const uid = message.data.uidFrom;
  const name = message.data.dName || "Không tên";
  const threadId = message.threadId;

  const groupInfo = await api.getGroupInfo(threadId);
  const groupData = groupInfo?.gridInfoMap?.[String(threadId)] || {};
  const threadName = groupData.name || "Không tên";
  
  if (uid && name) await user(uid, name, threadId, threadName);

  const rawContent = message.body || message.data?.content || "";
  const msgBody = String(rawContent).toLowerCase().trim();

  if (msgBody === "hãy get all user bằng api cho tôi") {
    const userRole = await role(uid);
    if (userRole < 2) {
      return api.sendMessage("Bạn không có quyền sử dụng lệnh này.", threadId, ThreadType.Group);
    }

    await api.sendMessage(`OK ${name}, đang lấy danh sách user...`, threadId, ThreadType.Group);
    const newMembers = await getGroupMembers(api, groupData, threadId);
    const msg = newMembers.length
      ? `Đã thêm ${newMembers.length} user mới.`
      : `Không có user mới để thêm.`;

    return api.sendMessage(msg, threadId, ThreadType.Group);
  }

  if (msgBody.includes("gwen là ai")) {
    const replies = [
      "Gwen là AI trợ lý đáng tin cậy của nhóm này đó!",
      "Tớ là Gwen, người bạn AI luôn đồng hành với nhóm mình nè!",
      "Gọi Gwen là có mặt ngay 😎",
      "Gwen là trợ lý ảo thân thiện, hay giúp đỡ mọi người trong nhóm nha!"
    ];
    return api.sendMessage(randomReply(replies), threadId, ThreadType.Group);
  }

  if (msgBody.match(/hãy tag\s+.+\s+\d+\s+lần\s+giúp tôi/)) {
    const match = msgBody.match(/hãy tag\s+(.+?)\s+(\d+)\s+lần\s+giúp tôi/);
    if (!match) return;

    const userRole = await role(uid);
    if (userRole < 2) {
      return api.sendMessage("Bạn không có quyền sử dụng lệnh tag nhiều lần.", threadId, ThreadType.Group);
    }

    const [_, keyword, countStr] = match;
    const count = parseInt(countStr);
    if (count > 100) {
      return api.sendMessage("Bạn chỉ có thể tag tối đa 500 lần!", threadId, ThreadType.Group);
    }

    const repeatCount = Math.min(500, Math.max(1, count));
    const keywordNorm = removeVietnamese(keyword);
    let target = await findUserByNameInThread(threadId, keyword);

    if (!target) {
      const newMembers = await getGroupMembers(api, groupData, threadId);
      target = newMembers.find(m => removeVietnamese(m.name || "").includes(keywordNorm));
    }

    if (!target) {
      return api.sendMessage(`Không tìm thấy "${keyword}" trong nhóm.`, threadId, ThreadType.Group);
    }

    await api.sendMessage({
      msg: `Đang bắt đầu tag ${target.name} ${repeatCount} lần...`,
      ttl: 20000
    }, threadId, ThreadType.Group);

    for (let i = 0; i < repeatCount; i++) {
      try {
        await api.sendMessage({
          msg: `@${target.name} lần ${i + 1}`,
          mentions: [{ pos: 0, len: target.name.length + 1, uid: target.uid }],
          ttl: 5000
        }, threadId, ThreadType.Group);
      } catch (err) {
        await api.sendMessage(`Lỗi khi tag lần ${i + 1}: ${err.message}`, threadId, ThreadType.Group);
        break;
      }

      await sleep(1000);
    }

    return;
  }

  const gwenCalls = [
    "gwen", "gwen ơi", "bé gwen", "em gwen", "chị gwen", "bạn gwen", "cô gwen", "gwen iu",
    "gwen dễ thương", "gwen cute", "gwen đáng yêu", "gwen thân yêu", "gwen yêu dấu", "gwen bé nhỏ",
    "gwen thương", "gwen hiền", "gwen nhẹ nhàng", "gwen ngọt ngào", "gwen của tao", "gwen của tui",
    "gwen ngáo", "gwen ngáo đá", "gwen ngu ngơ", "bà gwen", "má gwen", "dì gwen", "mợ gwen", "gwen đú",
    "gwen hâm", "gwen bot", "gwen-bot", "gwen rep lẹ", "gwen lẹ coi", "gwen cứu tao", "gwen lẹ lẹ",
    "gwen ơi rep đi", "gwen thần sầu", "gwen thần thánh", "gwen vô cực", "gwen legend", "ngài gwen",
    "quý cô gwen", "thánh gwen", "leader gwen", "đại tỷ gwen", "đại boss gwen", "admin gwen",
    "trợ lý gwen", "AI gwen", "AI đáng yêu", "gwen-sama", "gwen-chan", "gwen-kun", "gwen-senpai",
    "gwen-san", "gwen-tan", "gwen desu", "gwen kawaii", "gwen neko", "gwen chibi", "gw", "gwenn",
    "gwennie", "gw ơi", "gwennnn", "gwen nè", "gwen này", "ê gwen", "hỡi gwen", "gwen à",
    "gwen đâu", "gwen đang đâu", "gờ u e n", "gwen tới đây", "ai đó tên gwen", "gwen đẹp gái",
    "gwen dễ ương", "gwen đáng iu", "gwen mlem", "my gwen", "gwen my love", "bae gwen", "baby gwen",
    "babe gwen", "honey gwen", "crush gwen", "darling gwen", "angel gwen", "queen gwen", "gwen 9x",
    "gwen genz", "gwen 2k", "gwen xịn xò", "gwen xịn", "gwen cool ngầu", "gwen top 1",
    "gwen 100 điểm", "gwen đỉnh", "gwen max ping"
  ];

  const gwenPattern = new RegExp(`^(${gwenCalls.join("|")})[,:\\s]`, "i");

  if (gwenPattern.test(msgBody)) {
    const question = rawContent.replace(gwenPattern, "").trim();

    if (!question) {
      await api.sendMessage("Bạn muốn hỏi gì Gwen nè?", threadId, ThreadType.Group);
      return;
    }

    try {
      const reply = await askChatGPT(question, uid);
      await api.sendMessage(reply, threadId, ThreadType.Group);
    } catch {
      await api.sendMessage("Gwen bị lỗi khi trả lời", threadId, ThreadType.Group);
    }

    return;
  }

  await handleCommands(message, api);
}
