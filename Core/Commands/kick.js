export default {
  name: "kick",
  description: "Chỉ người có quyền (role ≥ 2) mới được kick thành viên ra khỏi nhóm.",
  usage: ".kick @tag1 @tag2 ...",
  role: 2,
    group: "admin",
   aliases: [
    "hãy kick",
    "kick thằng"
  ],
   noPrefix: true,
  async run({ message, api }) {
    const mentions = message.data.mentions || [];
    const groupId = message.threadId;

    // ⚠️ Không tag ai thì báo
    if (mentions.length === 0) {
      return api.sendMessage({
        msg: "Vui lòng tag người bạn muốn kick.",
        quoteId: message.msgId
      }, groupId, message.type);
    }

    const memberIds = mentions.map(user => user.uid);

    try {
      const res = await api.removeUserFromGroup(memberIds, groupId);

      const failed = res.errorMembers || [];
      const kicked = memberIds.filter(uid => !failed.includes(uid));

      const kickedList = kicked.map(id => `• ${id}`).join("\n");
      const failedList = failed.map(id => `• ${id}`).join("\n");

      let msg = `Đã kick ${kicked.length} thành viên:\n${kickedList || "Không có"}`;
      if (failed.length > 0) {
        msg += `\nKhông thể kick ${failed.length} thành viên:\n${failedList}`;
      }

      return api.sendMessage({
        msg,
        quoteId: message.msgId
      }, groupId, message.type);

    } catch (err) {
      console.error("[KICK_COMMAND] Lỗi khi gọi API kick:", err);
      return api.sendMessage({
        msg: "Đã xảy ra lỗi khi kick thành viên.",
        quoteId: message.msgId
      }, groupId, message.type);
    }
  }
};
