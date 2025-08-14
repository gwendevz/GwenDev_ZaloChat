// author @GwenDev
import { query } from "../../App/Database.js";
import { ThreadType } from "zca-js";
import { dangKyReply } from "../../Handlers/HandleReply.js";

export default {
  name: "ketnoinhom",
  description: "Kết nối trò chuyện giữa admin và một nhóm bất kỳ.",
  role: 2,
  cooldown: 0,
  group: "admin",
  aliases: ["kết nối nhóm", "ket noi nhom"],
  noPrefix: false,

  async run({ message, api }) {
    const adminThreadId = message.threadId;
    const adminThreadType = message.type ?? ThreadType.User;
    const adminUid = message.data?.uidFrom;

    const getUserDisplayName = async (uid) => {
      if (!uid) return "Người dùng";
      try {
        const info = await api.getUserInfo(uid);
        const profile = info?.changed_profiles?.[uid] || info?.[uid] || {};
        return (
          profile.displayName || profile.zaloName || profile.username || profile.name || String(uid)
        );
      } catch {
        return String(uid);
      }
    };

    const getGroupName = async (tid) => {
      if (!tid || String(tid).length <= 10) return String(tid);
      try {
        const info = await api.getGroupInfo(tid);
        const g = info.gridInfoMap?.[tid];
        return g?.name || String(tid);
      } catch {
        return String(tid);
      }
    };

    const registerBridge = ({
      srcMsgId,
      srcCliMsgId,
      srcThreadId,
      srcThreadType,
      destThreadId,
      destThreadType,
      destName,
    }) => {
      if (!srcMsgId && !srcCliMsgId) return;
      dangKyReply({
        msgId: srcMsgId,
        cliMsgId: srcCliMsgId,
        threadId: srcThreadId,
        command: "ketnoinhom_bridge",
        ttlMs: 12 * 60 * 60 * 1000,
        data: { destThreadId, destThreadType, destName },
        onReply: async ({ message: srcReply, api, content: srcContent, data }) => {
          try {
            const uid = srcReply.data?.uidFrom || srcReply.senderId || srcReply.data?.uid;
            const senderName = await getUserDisplayName(uid);
            const prefix = srcThreadType === ThreadType.Group ? `${senderName}: ` : "Admin: ";
            const sent = await api.sendMessage(prefix + srcContent, data.destThreadId, data.destThreadType);
            const nMsgId = sent?.message?.msgId ?? sent?.msgId ?? null;
            const nCliMsgId = sent?.message?.cliMsgId ?? sent?.cliMsgId ?? null;
            if (nMsgId || nCliMsgId) {
              registerBridge({
                srcMsgId: nMsgId,
                srcCliMsgId: nCliMsgId,
                srcThreadId: data.destThreadId,
                srcThreadType: data.destThreadType,
                destThreadId: srcReply.threadId,
                destThreadType: srcReply.type ?? ThreadType.User,
                destName: "",
              });
            }
          } catch (err) {
            console.warn("[ketnoinhom] bridge error:", err?.message || err);
          }
          return { clear: false };
        },
      });
    };
    const rows = await query("SELECT thread_id, name FROM groups");
    if (!rows || rows.length === 0) {
      return api.sendMessage("Không tìm thấy nhóm nào trong database.", adminThreadId, adminThreadType);
    }

    const groupLines = rows
      .map((r, idx) => `${idx + 1}. ${r.name || r.thread_id}`)
      .join("\n");

    const promptMsg = await api.sendMessage(
      { msg: `Danh sách nhóm hiện có:\n${groupLines}\n\nReply bằng số thứ tự để chọn nhóm cần kết nối.`, ttl: 30*60_000 },
      adminThreadId,
      adminThreadType
    );

    const promptMsgId = promptMsg?.message?.msgId ?? promptMsg?.msgId ?? null;
    const promptCliMsgId = promptMsg?.message?.cliMsgId ?? promptMsg?.cliMsgId ?? null;

    if (!promptMsgId && !promptCliMsgId) return;

    dangKyReply({
      msgId: promptMsgId,
      cliMsgId: promptCliMsgId,
      threadId: adminThreadId,
      authorId: adminUid,
      command: "ketnoinhom_select",
      ttlMs: 5 * 60 * 1000,
      data: { groups: rows },
      onReply: async ({ message: selectMsg, api, content, data }) => {
        const idx = parseInt(String(content).trim());
        if (isNaN(idx) || idx < 1 || idx > data.groups.length) {
          await api.sendMessage("Số thứ tự không hợp lệ. Hủy.", selectMsg.threadId, selectMsg.type);
          return { clear: true };
        }
        const target = data.groups[idx - 1];
        const targetThreadId = target.thread_id;
        const targetThreadType = ThreadType.Group;
        const targetName = await getGroupName(targetThreadId);

        const connectMsg = await api.sendMessage(
          { msg: `Quản trị viên muốn kết nối trò chuyện với nhóm "${targetName}".\nNếu đồng ý, reply "có". Nếu từ chối, reply "không".`, ttl: 30*60_000 },
          targetThreadId,
          targetThreadType
        );

        const cMsgId = connectMsg?.message?.msgId ?? connectMsg?.msgId ?? null;
        const cCliMsgId = connectMsg?.message?.cliMsgId ?? connectMsg?.cliMsgId ?? null;
        if (!cMsgId && !cCliMsgId) {
          await api.sendMessage("Không thể gửi yêu cầu kết nối tới nhóm.", adminThreadId, adminThreadType);
          return { clear: true };
        }

        dangKyReply({
          msgId: cMsgId,
          cliMsgId: cCliMsgId,
          threadId: targetThreadId,
          command: "ketnoinhom_confirm",
          ttlMs: 5 * 60 * 1000,
          data: { adminThreadId, adminThreadType, targetThreadId, targetThreadType, targetName },
          onReply: async ({ message: confirmMsg, api, content: confirmContent, data: d }) => {
            const text = String(confirmContent).trim().toLowerCase();
            if (text !== "có" && text !== "co" && text !== "không" && text !== "khong") {
              return { clear: false }; // ignore other messages
            }
            if (text === "không" || text === "khong") {
              await api.sendMessage({ msg: "Nhóm đã từ chối kết nối.", ttl: 30*60_000 }, d.adminThreadId, d.adminThreadType);
              await api.sendMessage({ msg: "Đã từ chối kết nối với quản trị viên.", ttl: 30*60_000 }, d.targetThreadId, d.targetThreadType);
              return { clear: true };
            }
            await api.sendMessage(
              { msg: `Nhóm "${d.targetName}" đã đồng ý kết nối. Reply tin nhắn này để trò chuyện.`, ttl: 30*60_000 },
              d.adminThreadId,
              d.adminThreadType
            ).then((admSent) => {
              const aMsgId = admSent?.message?.msgId ?? admSent?.msgId ?? null;
              const aCliMsgId = admSent?.message?.cliMsgId ?? admSent?.cliMsgId ?? null;
              if (aMsgId || aCliMsgId) {
                registerBridge({
                  srcMsgId: aMsgId,
                  srcCliMsgId: aCliMsgId,
                  srcThreadId: d.adminThreadId,
                  srcThreadType: d.adminThreadType,
                  destThreadId: d.targetThreadId,
                  destThreadType: d.targetThreadType,
                  destName: d.targetName,
                });
              }
            });

            await api.sendMessage(
              { msg: `Đã kết nối với quản trị viên. Reply tin nhắn này để trò chuyện.`, ttl: 30*60_000 },
              d.targetThreadId,
              d.targetThreadType
            ).then((grpSent) => {
              const gMsgId = grpSent?.message?.msgId ?? grpSent?.msgId ?? null;
              const gCliMsgId = grpSent?.message?.cliMsgId ?? grpSent?.cliMsgId ?? null;
              if (gMsgId || gCliMsgId) {
                registerBridge({
                  srcMsgId: gMsgId,
                  srcCliMsgId: gCliMsgId,
                  srcThreadId: d.targetThreadId,
                  srcThreadType: d.targetThreadType,
                  destThreadId: d.adminThreadId,
                  destThreadType: d.adminThreadType,
                  destName: "Admin",
                });
              }
            });

            return { clear: true };
          },
        });

        await api.sendMessage(
          { msg: `Đã gửi yêu cầu kết nối đến nhóm "${targetName}". Đợi họ phản hồi...`, ttl: 30*60_000 },
          adminThreadId,
          adminThreadType
        );

        return { clear: true };
      },
    });
  },
};
