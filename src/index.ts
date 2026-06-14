/**
 * FreeNitroEmojis — Revenge (Vendetta) port
 *
 * Original Aliucord plugin by nyxiereal.
 * Ported to Revenge's Metro-module patching API.
 *
 * How it works in Revenge:
 *  - We find the emoji-model module via Metro and patch the methods that
 *    decide whether an emoji is usable / what text to insert.
 *  - For realmoji mode we also patch the message-send pipeline so that
 *    our F_-prefixed fake-emoji syntax gets converted to a CDN markdown
 *    link before Discord serialises it, and incoming messages get
 *    converted back to native <a:name:id> syntax so the client renders
 *    the image natively.
 */

import { storage } from "@vendetta/plugin";
import { findByProps, findByName } from "@vendetta/metro";
import { before, after, instead } from "@vendetta/patcher";
import { showToast } from "@vendetta/ui/toasts";

import Settings from "./settings";
import {
    EMOTE_SIZE_KEY, EMOTE_SIZE_DEFAULT,
    FORMAT_TYPE_KEY, FORMAT_TYPE_DEFAULT,
    REALMOJI_KEY, REALMOJI_DEFAULT,
    COMPOUND_SENTENCES_KEY, COMPOUND_SENTENCES_DEFAULT,
    USE_WEBP_KEY, USE_WEBP_DEFAULT,
    FORMAT_URL, FORMAT_EXT_MD, FORMAT_MD,
} from "./constants";

// ─── Helpers ────────────────────────────────────────────────────────────────

function getSetting<T>(key: string, def: T): T {
    const v = storage[key];
    return v === undefined ? def : (v as T);
}

/** Build the CDN URL for a custom emoji. */
function buildEmojiUrl(emojiId: string, emoteName: string, isAnimated: boolean): string {
    const useWebp = getSetting(USE_WEBP_KEY, USE_WEBP_DEFAULT);
    const emoteSize = parseInt(getSetting(EMOTE_SIZE_KEY, EMOTE_SIZE_DEFAULT), 10) || 48;

    let url = `https://cdn.discordapp.com/emojis/${emojiId}`;
    if (useWebp) {
        url += `.webp?name=${emoteName}&lossless=true`;
        if (isAnimated) url += "&animated=true";
    } else {
        url += isAnimated ? ".gif" : ".png";
        url += `?name=${emoteName}`;
    }
    url += `&size=${emoteSize}`;
    return url;
}

/** Format the final string that gets inserted into the chat input. */
function formatOutput(url: string, emoteName: string): string {
    const formatType = getSetting(FORMAT_TYPE_KEY, FORMAT_TYPE_DEFAULT);
    switch (formatType) {
        case FORMAT_EXT_MD:
            return `[\u2236${emoteName}\u2236](${url})`;
        case FORMAT_MD:
            return `[${emoteName}](${url})`;
        default: // FORMAT_URL
            return url;
    }
}

// ─── Regex patterns (same logic as the original) ────────────────────────────

// Matches fake-emoji discord syntax with F_ prefix: <a:F_name:id> or <:F_name:id>
const emojiRegex = /<(a)?:(F_)?([a-zA-Z0-9_]+):(\d+)>/g;

// Matches CDN emoji URLs (both plain and wrapped in markdown) for compound sentences
const markdownRegexCompound = /(?:\[[\u2236\[]?[^\]]*[\u2236\]]?\]\()?(https:\/\/cdn\.discordapp\.com\/emojis\/(\d+)\.(gif|png|webp)[^)\s]*)\)?/g;

// Same but anchored — single emoji only
const markdownRegexSingle = /^(?:\[[\u2236\[]?[^\]]*[\u2236\]]?\]\()?(https:\/\/cdn\.discordapp\.com\/emojis\/(\d+)\.(gif|png|webp)[^)\s]*)\)?$/;

/** Parse a CDN emoji URL back to a Discord emoji mention string. */
function cdnUrlToMention(url: string, emojiId: string, extension: string): string {
    let animated = extension === "gif" ? "a" : "";
    let emojiName = "UNKNOWN_FAKE_EMOJI";

    try {
        const parsed = new URL(url);
        parsed.searchParams.forEach((val, key) => {
            if (key === "name") {
                emojiName = val.replace(/[^a-zA-Z0-9_]/g, "");
            }
            if (key === "animated" && val === "true" && extension === "webp") {
                animated = "a";
            }
        });
    } catch {
        // Ignore URL parse errors
    }

    return `<${animated}:${emojiName}:${emojiId}>`;
}

// ─── Patch bookkeeping ───────────────────────────────────────────────────────

const patches: (() => void)[] = [];

// ─── Plugin entry points ─────────────────────────────────────────────────────

export default {
    onLoad() {
        // ── 1. Find the emoji model module ──────────────────────────────────
        //
        // In Revenge's Metro bundle the custom emoji model exposes helper
        // methods. We look for the module that has both `isEmojiUsable` and
        // `getEmojiUrl` (names vary by Discord version; we try several).
        const EmojiUtils = findByProps("isEmojiUsable", "getEmojiUrl")
            ?? findByProps("isUsableEmoji", "getCustomEmojiURL");

        if (!EmojiUtils) {
            console.warn("[FreeNitroEmojis] Could not find EmojiUtils module — emoji unlock may not work.");
        }

        // ── 2. Make every emoji "usable" ────────────────────────────────────
        if (EmojiUtils) {
            const usableKey = "isEmojiUsable" in EmojiUtils ? "isEmojiUsable" : "isUsableEmoji";
            patches.push(
                instead(usableKey, EmojiUtils, () => true)
            );

            // Some builds also have a separate `canUseEmoji` guard
            if ("canUseEmoji" in EmojiUtils) {
                patches.push(instead("canUseEmoji", EmojiUtils, () => true));
            }
        }

        // ── 3. Patch the "what text goes in the input?" function ─────────────
        //
        // `getChatInputText` / `getMessageContentReplacement` live on the
        // emoji-info module. We replace their return value with our URL/MD.
        const EmojiInfo = findByProps("getChatInputText")
            ?? findByProps("getEmojiChatInputText");

        if (EmojiInfo) {
            const chatInputKey = "getChatInputText" in EmojiInfo
                ? "getChatInputText"
                : "getEmojiChatInputText";

            const patchEmoji = (args: any[], originalFn: (...a: any[]) => any) => {
                const emoji = args[0];
                if (!emoji) return originalFn(...args);

                const isNitroEmoji = emoji.available && emoji.isUsable;
                if (isNitroEmoji) return originalFn(...args); // leave real Nitro emojis alone

                const emojiId: string = emoji.id ?? emoji.idStr ?? "";
                const emoteName: string = emoji.name ?? "";
                const isAnimated: boolean = emoji.animated ?? emoji.isAnimated ?? false;

                if (!emojiId) return originalFn(...args);

                // Realmoji mode: insert fake Discord mention
                if (getSetting(REALMOJI_KEY, REALMOJI_DEFAULT)) {
                    const a = isAnimated ? "a" : "";
                    return `<${a}:F_${emoteName}:${emojiId}>`;
                }

                const url = buildEmojiUrl(emojiId, emoteName, isAnimated);
                return formatOutput(url, emoteName);
            };

            patches.push(
                instead(chatInputKey, EmojiInfo, patchEmoji)
            );

            if ("getMessageContentReplacement" in EmojiInfo) {
                patches.push(
                    instead("getMessageContentReplacement", EmojiInfo, patchEmoji)
                );
            }
        }

        // ── 4. Autocomplete upsell suppression ───────────────────────────────
        //
        // The Nitro upsell experiment flag lives in a different module in RN.
        const ExperimentStore = findByProps("setOverride", "getGuildExperiments")
            ?? findByProps("setSerializedOverride");
        if (ExperimentStore) {
            try {
                ExperimentStore.setOverride?.("2021-03_nitro_emoji_autocomplete_upsell_android", 1);
            } catch { /* non-fatal */ }
        }

        // ── 5. Realmoji incoming message conversion ──────────────────────────
        //
        // When realmoji is enabled, outgoing messages contain plain markdown
        // CDN links. Incoming messages (from the server) need those links
        // turned back into <animated:name:id> syntax so Discord renders them.
        if (getSetting(REALMOJI_KEY, REALMOJI_DEFAULT)) {
            const MessageStore = findByProps("receiveMessage", "getMessage");
            if (MessageStore) {
                patches.push(
                    before("receiveMessage", MessageStore, (args) => {
                        const msg = args[1] ?? args[0];
                        if (!msg || typeof msg.content !== "string") return;

                        const useCompound = getSetting(COMPOUND_SENTENCES_KEY, COMPOUND_SENTENCES_DEFAULT);
                        if (useCompound) {
                            msg.content = msg.content.replace(
                                markdownRegexCompound,
                                (_match: string, url: string, emojiId: string, ext: string) =>
                                    cdnUrlToMention(url, emojiId, ext)
                            );
                        } else {
                            const singleMatch = msg.content.match(markdownRegexSingle);
                            if (singleMatch) {
                                msg.content = cdnUrlToMention(singleMatch[1], singleMatch[2], singleMatch[3]);
                            }
                        }
                    })
                );
            }

            // ── 6. Outgoing message: convert F_ mentions to CDN markdown ────
            //
            // Before the REST call is made, swap <a:F_name:id> → [name](url)
            const RestAPI = findByProps("sendMessage", "editMessage")
                ?? findByProps("_sendMessage");
            if (RestAPI) {
                const sendKey = "sendMessage" in RestAPI ? "sendMessage" : "_sendMessage";
                patches.push(
                    before(sendKey, RestAPI, (args) => {
                        // args[1] is the message object { content, ... }
                        const msgObj = args[1];
                        if (!msgObj || typeof msgObj.content !== "string") return;

                        msgObj.content = msgObj.content.replace(
                            emojiRegex,
                            (
                                fullMatch: string,
                                animatedFlag: string,
                                fakeFlag: string,
                                emojiName: string,
                                emojiId: string
                            ) => {
                                if (fakeFlag !== "F_") return fullMatch; // leave real emojis alone
                                const isAnimated = animatedFlag === "a";
                                const url = buildEmojiUrl(emojiId, emojiName, isAnimated);
                                return `[${emojiName}](${url})`;
                            }
                        );
                    })
                );
            }
        }
    },

    onUnload() {
        // Unpatch everything
        for (const unpatch of patches) unpatch();
        patches.length = 0;

        // Reset experiment override
        try {
            const ExperimentStore = findByProps("setOverride", "getGuildExperiments")
                ?? findByProps("setSerializedOverride");
            ExperimentStore?.setOverride?.("2021-03_nitro_emoji_autocomplete_upsell_android", 0);
        } catch { /* non-fatal */ }
    },

    settings: Settings,
};
