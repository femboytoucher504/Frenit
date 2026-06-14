(function() {
    const storage = revenge.storage.createProxy("free-nitro-emojis");

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

    const FORMAT_URL = "url";
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
        const formatType = getSetting(FORMAT_TYPE_KEY, FORMAT_TYPE_DEFAULT);
        if (formatType === FORMAT_EXT_MD) return `[\u2236${emoteName}\u2236](${url})`;
        if (formatType === FORMAT_MD) return `[${emoteName}](${url})`;
        return url;
    }

    const emojiRegex = /<(a)?:(F_)?([a-zA-Z0-9_]+):(\d+)>/g;
    const markdownRegexCompound = /(?:\[[\u2236\[]?[^\]]*[\u2236\]]?\]\()?(https:\/\/cdn\.discordapp\.com\/emojis\/(\d+)\.(gif|png|webp)[^)\s]*)\)?/g;
    const markdownRegexSingle = /^(?:\[[\u2236\[]?[^\]]*[\u2236\]]?\]\()?(https:\/\/cdn\.discordapp\.com\/emojis\/(\d+)\.(gif|png|webp)[^)\s]*)\)?$/;

    function cdnUrlToMention(url, emojiId, extension) {
        let animated = extension === "gif" ? "a" : "";
        let emojiName = "UNKNOWN_FAKE_EMOJI";
        try {
            const parsed = new URL(url);
            parsed.searchParams.forEach((val, key) => {
                if (key === "name") emojiName = val.replace(/[^a-zA-Z0-9_]/g, "");
                if (key === "animated" && val === "true" && extension === "webp") animated = "a";
            });
        } catch {}
        return `<${animated}:${emojiName}:${emojiId}>`;
    }

    const patches = [];

    function patchEmoji(args, originalFn) {
        const emoji = args[0];
        if (!emoji) return originalFn(...args);
        if (emoji.available && emoji.isUsable) return originalFn(...args);

        const emojiId = emoji.id ?? emoji.idStr ?? "";
        const emoteName = emoji.name ?? "";
        cons
