// apps/web/hooks/useMessageTree.ts
import { useMemo } from "react";

export function useMessageTree(allMessages: any, activeLeafId: string | null) {

    // useMemo is used for cacheing it
    return useMemo(() => {
        const msgMap = new Map();
        const childrenMap = new Map<string | null, string[]>();

        allMessages.forEach((msg: any) => {
            msgMap.set(msg.id, msg);
            const siblings = childrenMap.get(msg.parentId) || [];
            siblings.push(msg.id);
            childrenMap.set(msg.parentId, siblings);
        });

        // Determine the active leaf. If not set, find the newest message.
        let leaf = activeLeafId;
        if (!leaf && allMessages.length > 0) {
            leaf = allMessages[allMessages.length - 1].id;
        }

        // Traverse up from the leaf to the root to build the linear thread
        const thread = [];
        let currentId = leaf;
        while (currentId && msgMap.has(currentId)) {
            const msg = msgMap.get(currentId)!;
            thread.unshift(msg);
            currentId = msg.parentId;
        }

        return { thread, childrenMap, msgMap, activeLeafId: leaf };
    }, [allMessages, activeLeafId]);
}