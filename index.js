import { findByProps } from "@revenge-mod/modules/finders";
import { instead, before } from "@revenge-mod/patcher";
import { createStorage } from "@revenge-mod/storage";

const storage = createStorage("free-nitro-emojis");

const EMOTE_SIZE_KEY = "emote_size";
const FORMAT_TYPE_KEY = "format_type";
const REALMOJI_KEY = "realmoji";
const COMPOUND_SENTENCES_KEY = "compound_sentences";
const USE_WEBP_KEY = "use_webp";

const EMOTE_SIZE_DEFAULT = "48";
const FORMAT_TYPE_DEFAULT = "markdown";
const REALMOJI_DEFAULT = false;
const COMPOUND_SENTENCES_DEFAULT = false;
const USE_WEBP_DEFAULT = false;

const FORMAT_EXT_MD = "markdown_ext";
const FORMAT_MD = "markdown";

function getSetting(key, def) {
    const v = storage[key];
    return v === undefined ? def : v;
}

function buildEmojiUrl(emojiId, emoteName, isAnimated) {
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

function formatOutput(url, emoteName) {
    const fmt = getSetting(FORMAT_TYPE_KEY, FORMAT_TYPE_DEFAULT);
    if (fmt === FORMAT_EXT_MD) return `[\u2236${emoteName}\u2236](${url})`;
    if (fmt === FORMAT_MD) return `[${emoteName}](${url})`;
    return url;
}

const emojiRegex = /<(a)?:(F_)?([a-zA-Z0-9_]+):(\d+)>/g;
const markdownRegexCompound = /(?:\[[\u2236\[]?[^\]]*[\u2236\]]?\]\()?(https:\/\/cdn\.discordapp\.com\/emojis\/(\d+)\.(gif|png|webp)[^)\s]*)\)?/g;
const markdownRegexSingle = /^(?:\[[\u2236\[]?[^\]]*[\u2236\]]?\]\()?(https:\/\/cdn\.discordapp\.com\/emojis\/(\d+)\.(gif|png|webp)[^)\s]*)\)?$/;

function cdnUrlToMention(url, emojiId, extension) {
    let animated = extension === "gif" ? "a" : "";
    let emojiName = "UNKNOWN_FAKE_EMOJI";
    try {
        new URL(url).searchParams.forEach((val, key) => {
            if (key === "name") emojiName = val.replace(/[^a-zA-Z0-9_]/g, "");
            if (key === "animated" && val === "true" && extension === "webp") animated = "a";
        });
    } catch {}
    return `<${animated}:${emojiName}:${emojiId}>`;
}

const patches = [];

export default {
    onLoad() {
        const EmojiUtils = findByProps("isEmojiUsable", "getEmojiUrl")
            ?? findByProps("isUsableEmoji", "getCustomEmojiURL")
            ?? findByProps("isEmojiUsable");

        if (EmojiUtils) {
            const usableKey = "isEmojiUsable" in EmojiUtils ? "isEmojiUsable" : "isUsableEmoji";
            patches.push(instead(usableKey, EmojiUtils, () => true));
            if ("canUseEmoji" in EmojiUtils) {
                patches.push(instead("canUseEmoji", EmojiUtils, () => true));
            }
        }

        const EmojiInfo = findByProps("getChatInputText")
            ?? findByProps("getEmojiChatInputText");

        if (EmojiInfo) {
            const chatKey = "getChatInputText" in EmojiInfo
                ? "getChatInputText"
                : "getEmojiChatInputText";

            const patchFn = (args, orig) => {
                const emoji = args[0];
                if (!emoji) return orig(...args);
                if (emoji.available && emoji.isUsable) return orig(...args);
                const emojiId = emoji.id ?? emoji.idStr ?? "";
                const emoteName = emoji.name ?? "";
                const isAnimated = emoji.animated ?? emoji.isAnimated ?? false;
                if (!emojiId) return orig(...args);
                if (getSetting(REALMOJI_KEY, REALMOJI_DEFAULT)) {
                    return `<${isAnimated ? "a" : ""}:F_${emoteName}:${emojiId}>`;
                }
                return formatOutput(buildEmojiUrl(emojiId, emoteName, isAnimated), emoteName);
            };

            patches.push(instead(chatKey, EmojiInfo, patchFn));
            if ("getMessageContentReplacement" in EmojiInfo) {
                patches.push(instead("getMessageContentReplacement", EmojiInfo, patchFn));
            }
        }

        if (getSetting(REALMOJI_KEY, REALMOJI_DEFAULT)) {
            const MessageStore = findByProps("receiveMessage", "getMessage");
            if (MessageStore) {
                patches.push(before("receiveMessage", MessageStore, (args) => {
                    const msg = args[1] ?? args[0];
                    if (!msg || typeof msg.content !== "string") return;
                    if (getSetting(COMPOUND_SENTENCES_KEY, COMPOUND_SENTENCES_DEFAULT)) {
                        msg.content = msg.content.replace(markdownRegexCompound,
                            (_, url, id, ext) => cdnUrlToMention(url, id, ext));
                    } else {
                        const m = msg.content.match(markdownRegexSingle);
                        if (m) msg.content = cdnUrlToMention(m[1], m[2], m[3]);
                    }
                }));
            }

            const RestAPI = findByProps("sendMessage", "editMessage");
            if (RestAPI) {
                patches.push(before("sendMessage", RestAPI, (args) => {
                    const msgObj = args[1];
                    if (!msgObj || typeof msgObj.content !== "string") return;
                    msgObj.content = msgObj.content.replace(emojiRegex,
                        (full, anim, fake, name, id) => {
                            if (fake !== "F_") return full;
                            return `[${name}](${buildEmojiUrl(id, name, anim === "a")})`;
                        });
                }));
            }
        }
    },

    onUnload() {
        for (const unpatch of patches) unpatch();
        patches.length = 0;
    }
};
