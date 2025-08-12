import { query } from "../../App/Database.js";
import { ThreadType } from "zca-js";
import { dangKyReply } from "../../Handlers/HandleReply.js";
export default {
  name: "thongbao",
  description: "Gửi thông báo đến tất cả nhóm được lưu trong database.",
  role: 2, 
  cooldown: 0,
  group: "admin",
  aliases: ["thông báo", "tb"],
  noPrefix: false,

  /**
   * @param {{ message: any, api: any, args: string[] }}
   */
  async run({ message, api, args }) {
    const originThreadId = message.threadId;
    const originThreadType = message.type ?? ThreadType.User;

    if (!args || args.length === 0) {
      return api.sendMessage(
        "Vui lòng nhập nội dung thông báo. VD: .thongbao Nội dung muốn gửi.",
        originThreadId,
        originThreadType
      );
    }

    const notifyMsg = args.join(" ").trim();

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

    try {
      const rows = await query("SELECT thread_id, name FROM groups");
      if (!rows || rows.length === 0) {
        return api.sendMessage(
          "Không tìm thấy nhóm nào trong database để gửi thông báo.",
          originThreadId,
          originThreadType
        );
      }

      let success = 0;
      let fail = 0;
      const successGroups = [];

      for (const { thread_id, name: gname } of rows) {
        try {
          const sent = await api.sendMessage(notifyMsg, thread_id, ThreadType.Group);
          success++;
          successGroups.push(gname || thread_id);
          const msgId = sent?.message?.msgId ?? sent?.msgId ?? null;
          const cliMsgId = sent?.message?.cliMsgId ?? sent?.cliMsgId ?? null;
          if (msgId || cliMsgId) {
            dangKyReply({
              msgId,
              cliMsgId,
              threadId: thread_id,
              command: "thongbao",
              ttlMs: 24 * 60 * 60 * 1000,
              data: { originThreadId, originThreadType },
              onReply: async ({ message, api, content, data }) => {
                const uid = message.data?.uidFrom || message.senderId || message.data?.uid;
                const senderName = await getUserDisplayName(uid);
                const groupName = await getGroupName(message.threadId);
                const replyText = `Phản hồi từ nhóm "${groupName}" (${message.threadId})\nNgười dùng ${senderName} (${uid}): ${content}`;
                try {
                  const adminSent = await api.sendMessage(replyText, data.originThreadId, data.originThreadType);

                  const adminMsgId = adminSent?.message?.msgId ?? adminSent?.msgId ?? null;
                  const adminCliMsgId = adminSent?.message?.cliMsgId ?? adminSent?.cliMsgId ?? null;
                  if (adminMsgId || adminCliMsgId) {
                    dangKyReply({
                      msgId: adminMsgId,
                      cliMsgId: adminCliMsgId,
                      threadId: data.originThreadId,
                      command: "thongbao_admin",
                      ttlMs: 24 * 60 * 60 * 1000,
                      data: { targetThreadId: message.threadId, targetThreadType: message.type, targetThreadName: groupName },
                      onReply: async ({ message: adminReply, api, content: adminContent, data: d }) => {
                        try {
                          const prefix = `Tin nhắn từ Admin: `;
                          const groupSent = await api.sendMessage(prefix + adminContent, d.targetThreadId, ThreadType.Group);

                          await api.sendMessage(`Đã gửi tin nhắn tới nhóm \"${d.targetThreadName || d.targetThreadId}\"`, adminReply.threadId, adminReply.type);

                          const gMsgId = groupSent?.message?.msgId ?? groupSent?.msgId ?? null;
                          const gCliMsgId = groupSent?.message?.cliMsgId ?? groupSent?.cliMsgId ?? null;
                          if (gMsgId || gCliMsgId) {
                            dangKyReply({
                              msgId: gMsgId,
                              cliMsgId: gCliMsgId,
                              threadId: d.targetThreadId,
                              command: "thongbao",
                              ttlMs: 24 * 60 * 60 * 1000,
                              data: { originThreadId: adminReply.threadId, originThreadType: adminReply.type },
                              onReply: async ({ message: gReply, api, content: gContent, data: again }) => {
                                const uid2 = gReply.data?.uidFrom || gReply.senderId || gReply.data?.uid;
                                const senderName2 = await getUserDisplayName(uid2);
                                const groupName2 = await getGroupName(gReply.threadId);
                                const replyText2 = `Phản hồi từ nhóm "${groupName2}" (${gReply.threadId})\nNgười dùng ${senderName2} (${uid2}): ${gContent}`;
                                try {
                                  const adminSent2 = await api.sendMessage(replyText2, again.originThreadId, again.originThreadType);
                                   const aMsgId2 = adminSent2?.message?.msgId ?? adminSent2?.msgId ?? null;
                                  const aCliMsgId2 = adminSent2?.message?.cliMsgId ?? adminSent2?.cliMsgId ?? null;
                                  if (aMsgId2 || aCliMsgId2) {
                                    dangKyReply({
                                      msgId: aMsgId2,
                                      cliMsgId: aCliMsgId2,
                                      threadId: again.originThreadId,
                                      command: "thongbao_admin",
                                      ttlMs: 24 * 60 * 60 * 1000,
                                      data: { targetThreadId: gReply.threadId, targetThreadType: gReply.type },
                                      onReply: async ({ message: adminRe2, api, content: aContent2, data: dataX }) => {
                                        try {
                                          const gSent2 = await api.sendMessage(`Tin nhắn từ Admin: ${aContent2}`, dataX.targetThreadId, ThreadType.Group);
                                          await api.sendMessage(`Đã gửi tin nhắn tới nhóm \"${dataX.targetThreadName || dataX.targetThreadId}\"`, adminRe2.threadId, adminRe2.type);

                                          const gMsgId2 = gSent2?.message?.msgId ?? gSent2?.msgId ?? null;
                                          const gCliMsgId2 = gSent2?.message?.cliMsgId ?? gSent2?.cliMsgId ?? null;
                                          if (gMsgId2 || gCliMsgId2) {
                                            dangKyReply({
                                              msgId: gMsgId2,
                                              cliMsgId: gCliMsgId2,
                                              threadId: dataX.targetThreadId,
                                              command: "thongbao",
                                              ttlMs: 24 * 60 * 60 * 1000,
                                              data: { originThreadId: adminRe2.threadId, originThreadType: adminRe2.type },
                                              onReply: async ({ message: gReply2, api, content: gContent2, data: again2 }) => {
                                                const senderName3 = gReply2.data?.senderName || "Người dùng";
                                                const groupName3 = gReply2.threadName || gReply2.threadId;
                                                const replyText3 = `📩 Phản hồi từ nhóm "${groupName3}"\n👤 ${senderName3}: ${gContent2}`;
                                                try {
                                                  const adminSent3 = await api.sendMessage(replyText3, again2.originThreadId, again2.originThreadType);
                                                  const aMsgId3 = adminSent3?.message?.msgId ?? adminSent3?.msgId ?? null;
                                                  const aCliMsgId3 = adminSent3?.message?.cliMsgId ?? adminSent3?.cliMsgId ?? null;
                                                  if (aMsgId3 || aCliMsgId3) {
                                                    dangKyReply({
                                                      msgId: aMsgId3,
                                                      cliMsgId: aCliMsgId3,
                                                      threadId: again2.originThreadId,
                                                      command: "thongbao_admin",
                                                      ttlMs: 24 * 60 * 60 * 1000,
                                                      data: { targetThreadId: gReply2.threadId, targetThreadType: gReply2.type },
                                                      onReply: async ({ message: adminRe3, api, content: aContent3, data: dataY }) => {
                                                        try {
                                                          const gSent3 = await api.sendMessage(`Tin nhắn từ Admin: ${aContent3}`, dataY.targetThreadId, ThreadType.Group);
                                                          await api.sendMessage(`Đã gửi tin nhắn tới nhóm \"${dataY.targetThreadName || dataY.targetThreadId}\"`, adminRe3.threadId, adminRe3.type);
                                                          return { clear: false };
                                                        } catch (e3) {
                                                          console.warn("[thongbao] Không thể gửi phản hồi của admin:", e3?.message || e3);
                                                          return { clear: false };
                                                        }
                                                      }
                                                    });
                                                  }
                                                } catch (e4) {
                                                  console.warn("[thongbao] Không thể chuyển tiếp phản hồi:", e4?.message || e4);
                                                }
                                                return { clear: false };
                                              }
                                            });
                                          }
                                        } catch (e2) {
                                          console.warn("[thongbao] Không thể gửi phản hồi của admin:", e2?.message || e2);
                                        }
                                        return { clear: false };
                                      }
                                    });
                                  }
                                } catch (e4) {
                                  console.warn("[thongbao] Không thể chuyển tiếp phản hồi:", e4?.message || e4);
                                }
                                return { clear: false };
                              }
                            });
                          }
                        } catch (e2) {
                          console.warn("[thongbao] Không thể gửi phản hồi của admin:", e2?.message || e2);
                        }
                        return { clear: false };
                      }
                    });
                  }
                } catch (e) {
                  console.warn("[thongbao] Không thể chuyển tiếp phản hồi:", e?.message || e);
                }
                return { clear: false };
              }
            });
          }
        } catch (err) {
          fail++;
          console.warn(`[thongbao] Không gửi được đến nhóm ${thread_id}:`, err?.message || err);
        }
      }

      const groupListText = successGroups.map((n, idx) => `${idx + 1}. ${n}`).join("\n");
      await api.sendMessage(
        `Đã gửi thông báo đến ${success} nhóm:\n${groupListText}\n\nKhông gửi được đến ${fail} nhóm.`,
        originThreadId,
        originThreadType
      );
    } catch (err) {
      console.error("[thongbao] Lỗi khi gửi thông báo:", err);
      return api.sendMessage(
        "Đã xảy ra lỗi khi gửi thông báo!",
        originThreadId,
        originThreadType
      );
    }
  },
};
