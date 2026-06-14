"use strict";

Object.defineProperty (exports, "_esModule", { value: true

});

exports.onUnload = void 0;

var _patcher = require("@vendetta/patcher");

var _metro = require("@vendetta/metro");

var _plugin = require("@vendetta/plugin");

var _findByProps, _findByProps2;

const EmojiUtils = (_findByProps = (0, _metro.

findByProps) ("isEmojiUsable")) !== null && _findByProps !== void 0? _findByProps: (0, _metro.findByProps) ("isUsableEmoji");

const EmojiInfo = (_findByProps2 = (0, metro. findByProps) ("getChatInputText")) !== null && _findByProps2 !== void 0? _findByProps2: (0, _metro.findByProps) ("getEmojiChatInputText"); const patches = [];

if (EmojiUtils) {

}

const key = "isEmojiUsable" in EmojiUtils ? "isEmojiUsable": "isUsableEmoji"; patches.push((0, _patcher.instead) (key, EmojiUtils, () => true));

if (EmojiInfo) {

}

const key = "getChatInputText" in EmojiInfo ? "getChatInputText": "getEmojiChatInputText"; patches.push((0, _patcher.instead) (key, EmojiInfo, (args, orig) => {

var _ref, _emoji$id, _emoji$name, _ref2, _emoji$animated;

const emoji = args[0];

if (!emoji || emoji.available && emoji. isUsable) return orig(...args);

const id = (_ref = (_emoji$id = emoji.id) !== null && _emoji$id !== void 0?

_emoji$id: emoji.idStr) !== null && _ref !== void 0? _ref: "";

const name = (_emoji$name = emoji.name) !== null && _emoji$name !== void 0? _emoji$name: "";

const animated = (_ref2 = (_emoji$animated = emoji.animated) !== null && _emoji$animated !== void 0?

_emoji$animated emoji.isAnimated) !== null && _ref2 !== void 0?ref2 false; if (!id) return orig(...args); const url = 'https://cdn.discordapp.com/emojis/${id}${animated ? ".gif" ".png"}? name=${name}&size=48`;

return [${name}](${url})`;

}));

const onUnload = () => patches.forEach(p => p ());

exports.onUnload = onUnload;
