// author @GwenDev
import { handleMessage } from "./HandleMessage.js";
import { handleReaction } from "./HandleReaction.js";
import { handleUndo } from "./HandleUndo.js";
import { handleGroupEvent } from "./HandleGroup.js";


export function init(api) {
   api.listener.on("message", (msg) => handleMessage(msg, api));
    api.listener.on("reaction", handleReaction);
    api.listener.on("undo", handleUndo);
    api.listener.on("group_event", handleGroupEvent);
    api.listener.start();
}
