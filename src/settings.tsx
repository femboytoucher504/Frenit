import { React } from "@vendetta/metro/common";
import { useProxy } from "@vendetta/storage";
import { storage } from "@vendetta/plugin";
import { Forms, General } from "@vendetta/ui/components";

import {
    EMOTE_SIZE_KEY, EMOTE_SIZE_DEFAULT,
    FORMAT_TYPE_KEY, FORMAT_TYPE_DEFAULT,
    REALMOJI_KEY, REALMOJI_DEFAULT,
    COMPOUND_SENTENCES_KEY, COMPOUND_SENTENCES_DEFAULT,
    USE_WEBP_KEY, USE_WEBP_DEFAULT,
    FORMAT_URL, FORMAT_EXT_MD, FORMAT_MD,
} from "./constants";

const { ScrollView } = General;
const { FormSection, FormRow, FormSwitch, FormRadioRow, FormInput } = Forms;

function initDefaults() {
    if (storage[EMOTE_SIZE_KEY] === undefined) storage[EMOTE_SIZE_KEY] = EMOTE_SIZE_DEFAULT;
    if (storage[FORMAT_TYPE_KEY] === undefined) storage[FORMAT_TYPE_KEY] = FORMAT_TYPE_DEFAULT;
    if (storage[REALMOJI_KEY] === undefined) storage[REALMOJI_KEY] = REALMOJI_DEFAULT;
    if (storage[COMPOUND_SENTENCES_KEY] === undefined) storage[COMPOUND_SENTENCES_KEY] = COMPOUND_SENTENCES_DEFAULT;
    if (storage[USE_WEBP_KEY] === undefined) storage[USE_WEBP_KEY] = USE_WEBP_DEFAULT;
}

export default function Settings() {
    initDefaults();
    useProxy(storage);

    const formatOptions = [
        { label: "URL only", value: FORMAT_URL },
        { label: "Extended markdown ∶name∶(url)", value: FORMAT_EXT_MD },
        { label: "Markdown [name](url)", value: FORMAT_MD },
    ];

    return (
        <ScrollView>
            <FormSection title="Emoji Size">
                <FormInput
                    title="Fallback emote size"
                    placeholder="48"
                    value={storage[EMOTE_SIZE_KEY]}
                    onChange={(v: string) => {
                        if (/^\d*$/.test(v)) storage[EMOTE_SIZE_KEY] = v;
                    }}
                    keyboardType="numeric"
                />
            </FormSection>

            <FormSection title="Output Format">
                {formatOptions.map(({ label, value }) => (
                    <FormRadioRow
                        key={value}
                        label={label}
                        selected={storage[FORMAT_TYPE_KEY] === value}
                        onPress={() => { storage[FORMAT_TYPE_KEY] = value; }}
                    />
                ))}
            </FormSection>

            <FormSection title="Realmoji">
                <FormRow
                    label="Enable realmojis"
                    subLabel="Makes your Discord client think free Nitro emojis are real Nitro emojis"
                    trailing={
                        <FormSwitch
                            value={storage[REALMOJI_KEY]}
                            onValueChange={(v: boolean) => { storage[REALMOJI_KEY] = v; }}
                        />
                    }
                />
                <FormRow
                    label="Enable realmojis in compound sentences"
                    subLabel="Allows messages like 'hello :sogged: meow' to display properly"
                    trailing={
                        <FormSwitch
                            value={storage[COMPOUND_SENTENCES_KEY]}
                            onValueChange={(v: boolean) => { storage[COMPOUND_SENTENCES_KEY] = v; }}
                        />
                    }
                />
            </FormSection>

            <FormSection title="Format">
                <FormRow
                    label="Use WebP format"
                    subLabel="Use WebP instead of GIF/PNG. Disable if animated emojis don't animate."
                    trailing={
                        <FormSwitch
                            value={storage[USE_WEBP_KEY]}
                            onValueChange={(v: boolean) => { storage[USE_WEBP_KEY] = v; }}
                        />
                    }
                />
            </FormSection>
        </ScrollView>
    );
}
