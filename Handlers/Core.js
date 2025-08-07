import { handleMessage } from "./HandleMessage.js";
import { handleReaction } from "./HandleReaction.js";
import { handleUndo } from "./HandleUndo.js";
import { handleGroupEvent } from "./HandleGroup.js";

/**
 * Khởi tạo các listener cần thiết cho API
 * @param {Object} api - Đối tượng API từ Zalo
 */
export function init(api) {
   api.listener.on("message", (msg) => handleMessage(msg, api));
    api.listener.on("reaction", handleReaction);
    api.listener.on("undo", handleUndo);
    api.listener.on("group_event", handleGroupEvent);
    api.listener.start();
}
