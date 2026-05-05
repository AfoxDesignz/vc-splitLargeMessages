/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Luca Beyer
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { MessageObject } from "@api/MessageEvents";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { insertTextIntoChatInputBox } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { DraftType, UserStore } from "@webpack/common";

const settings = definePluginSettings({
    delayMs: {
        type: OptionType.NUMBER,
        description: "Delay before prefilling the next chunk (ms)",
        default: 1000
    },
    byNewlines: {
        type: OptionType.BOOLEAN,
        description: "Split on newlines instead of spaces",
        default: false
    },
    leaveGaps: {
        type: OptionType.BOOLEAN,
        description: "Preserve empty lines when splitting on newlines",
        default: false
    }
});

const DEFAULT_LIMITS = {
    standard: 2000,
    premium: 4000
};
const SAFE_MARGIN = 10;
const NitroUtils = findByPropsLazy("canUseIncreasedMessageLength") as {
    canUseIncreasedMessageLength?: (user: unknown) => boolean;
};

const DraftManager = findByPropsLazy("clearDraft", "saveDraft") as {
    clearDraft?: (channelId: string, draftType: number) => void;
};

const pendingChunks = new Map<string, string[]>();

function getActiveLimit() {
    const user = UserStore.getCurrentUser();
    const canUseIncreased = NitroUtils?.canUseIncreasedMessageLength?.(user) ?? false;
    return canUseIncreased ? DEFAULT_LIMITS.premium : DEFAULT_LIMITS.standard;
}

function getSplitLimit() {
    return Math.max(1, getActiveLimit() - SAFE_MARGIN);
}

function queueNextChunk(channelId: string) {
    const chunks = pendingChunks.get(channelId);
    if (!chunks?.length) {
        pendingChunks.delete(channelId);
        return;
    }

    const nextChunk = chunks.shift();
    if (!chunks.length) pendingChunks.delete(channelId);
    if (!nextChunk) return;

    const delayMs = Math.max(0, settings.store.delayMs ?? 0);
    setTimeout(() => {
        DraftManager?.clearDraft?.(channelId, DraftType.ChannelMessage);
        insertTextIntoChatInputBox(nextChunk);
    }, delayMs);
}

export default definePlugin({
    name: "SplitLargeMessages",
    description: "Splits long messages and automatically places the next part into your chat box so you can send it safely.",
    tags: ["Chat", "Utility"],
    authors: [{ name: "luca.beyer", id: 405090676771127317n }],
    settings,

    patches: [
        {
            find: "Message Too Long Alert",
            replacement: {
                match: /let (\i)=\i\?\i\.\i:\i\.\i;/,
                replace: "let $1=1e9;"
            }
        },
        {
            find: "convertedStringToFile",
            replacement: {
                match: /\.uploadLongMessages\?\i\?\?\i:null/,
                replace: ".uploadLongMessages?null:null"
            }
        },
        {
            find: ".CREATE_FORUM_POST||",
            replacement: {
                match: /(?<=textValue:(\i),editorHeight:\i,channelId:\i\.id\}\)),/,
                replace: ",$self.renderSplitCounter({text:$1}),"
            }
        }
    ],

    renderSplitCounter: ErrorBoundary.wrap(({ text }: { text: string; }) => {
        const limit = getSplitLimit();
        if (!text.length || text.length <= limit) return null;

        const count = splitMessageSafe(text, limit).filter(Boolean).length;
        if (count <= 1) return null;

        return (
            <div className="vc-splitLargeMessages-counter">
                <span>{count}</span>
                <span> Messages</span>
            </div>
        );
    }, { noop: true }),

    stop() {
        pendingChunks.clear();
    },

    onBeforeMessageSend(channelId: string, message: MessageObject) {
        const content = message.content ?? "";
        const limit = getSplitLimit();
        if (pendingChunks.has(channelId)) {
            if (content.length > 0) queueNextChunk(channelId);
            return;
        }

        if (content.length <= limit) return;

        const messageChunks = splitMessageSafe(content, limit).filter(Boolean);
        if (!messageChunks.length) return;

        message.content = messageChunks.shift()!;

        if (messageChunks.length > 0) {
            pendingChunks.set(channelId, messageChunks);
            queueNextChunk(channelId);
        }
    }
});

function splitMessageSafe(text: string, limit: number): string[] {
    if (text.length <= limit) return [text];

    const separator = settings.store.byNewlines ? "\n" : " ";
    return splitBySeparator(text, limit, separator, settings.store.leaveGaps);
}

function splitBySeparator(text: string, limit: number, separator: string, leaveGaps: boolean): string[] {
    text = text.replace(/\t/g, "    ");

    const escapedSeparator = separator === "\n" ? "\\n" : separator;
    const longWordSize = Math.floor(limit * (19 / 20));
    const longWords = text.match(new RegExp(`[^${escapedSeparator}]{${longWordSize},}`, "gm"));

    if (longWords) {
        for (const longWord of longWords) {
            let count = 0;
            const shortWords: string[] = [];

            longWord.split("").forEach(c => {
                if (shortWords[count] && (shortWords[count].length >= longWordSize || (c === "\n" && shortWords[count].length >= longWordSize - 100))) {
                    count++;
                }
                shortWords[count] = shortWords[count] ? shortWords[count] + c : c;
            });

            text = text.replace(longWord, shortWords.join(separator));
        }
    }

    const chunks: string[] = [];
    let idx = 0;
    const splitLimit = Math.floor(limit * (39 / 40));

    text.split(separator).forEach(word => {
        if (chunks[idx] && (chunks[idx] + "" + word).length > splitLimit) idx++;
        chunks[idx] = chunks[idx] ? chunks[idx] + separator + word : word;
    });

    let insertCodeBlock: string | null = null;
    let insertCodeLine: string | null = null;

    for (let i = 0; i < chunks.length; i++) {
        if (insertCodeBlock) {
            chunks[i] = insertCodeBlock + chunks[i];
            insertCodeBlock = null;
        } else if (insertCodeLine) {
            chunks[i] = insertCodeLine + chunks[i];
            insertCodeLine = null;
        } else if (chunks[i].charCodeAt(0) === 10 && separator === "\n" && leaveGaps) {
            chunks[i] = "** **" + chunks[i];
        }

        const codeBlocks = chunks[i].match(/`{3,}[\S]*\n|`{3,}/gm);
        const codeLines = chunks[i].match(/[^`]{0,1}`{1,2}[^`]|[^`]`{1,2}[^`]{0,1}/gm);

        if (codeBlocks && codeBlocks.length % 2 === 1) {
            chunks[i] = chunks[i] + "```";
            insertCodeBlock = codeBlocks[codeBlocks.length - 1] + "\n";
        } else if (codeLines && codeLines.length % 2 === 1) {
            insertCodeLine = codeLines[codeLines.length - 1].replace(/[^`]/g, "");
            chunks[i] = chunks[i] + insertCodeLine;
        } else if (chunks[i].charCodeAt(chunks[i].length - 1) === 10 && separator === "\n" && leaveGaps) {
            chunks[i] = chunks[i] + "** **";
        }
    }

    return chunks.filter(Boolean);
}
