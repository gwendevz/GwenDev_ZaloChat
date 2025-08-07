import { GroupEventType } from "zca-js";
import { group } from "../Database/Group.js";

export async function handleGroupEvent(event) {
    switch (event.type) {
        case GroupEventType.JOIN_REQUEST:
        case GroupEventType.JOIN:
        case GroupEventType.LEAVE:
        case GroupEventType.REMOVE_MEMBER:
        case GroupEventType.BLOCK_MEMBER:
        case GroupEventType.UPDATE_SETTING:
        case GroupEventType.UPDATE:
        case GroupEventType.NEW_LINK:
        case GroupEventType.ADD_ADMIN:
        case GroupEventType.REMOVE_ADMIN:
        case GroupEventType.NEW_PIN_TOPIC:
        case GroupEventType.UPDATE_PIN_TOPIC:
        case GroupEventType.REORDER_PIN_TOPIC:
        case GroupEventType.UPDATE_BOARD:
        case GroupEventType.REMOVE_BOARD:
        case GroupEventType.UPDATE_TOPIC:
        case GroupEventType.UNPIN_TOPIC:
        case GroupEventType.REMOVE_TOPIC:
        case GroupEventType.ACCEPT_REMIND:
        case GroupEventType.REJECT_REMIND:
        case GroupEventType.REMIND_TOPIC:
        case GroupEventType.UNKNOWN:
            const threadId = event.threadId;
            const name = event.data.groupName;
            await group(threadId, name);
            break;

        default:
            break;
    }
}
