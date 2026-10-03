"use strict";

// ============================================================
// HUNTING.JS
// Prefixless Hunting
// 2 Admins
// Self Reaction
// Abbreviation
// Casual Mimicker
// Duplicate Suppression
// Per-user Cooldown
// Typing Indicator
// Count Engine
// GC Name Lock
// Nickname
// ============================================================

module.exports.config = {
    name: "hunting",
    version: "8.1.0",
    hasPermission: 2,
    credits: "User",
    description:
        "Prefixless Hunting + Self Reaction + Mimicker + Count + GC Lock + Nickname",
    usePrefix: false,
    commandCategory: "system",
    usages:
        "hunting start | hunting stop | hunting count | hunting count off | hunting lock [name] | hunting unlock | hunting set [name] | hunting status",
    cooldowns: 0
};

// ============================================================
// ADMINS
// ============================================================

const ADMIN_IDS = [
    "61594616562680",
    "61594981323552"
];

function isAdmin(event) {
    if (!event || !event.senderID) {
        return false;
    }

    return ADMIN_IDS.includes(
        String(event.senderID)
    );
}

// ============================================================
// GLOBAL STATE
// ============================================================

global.huntingState =
    global.huntingState || false;

global.countEngineState =
    global.countEngineState || false;

global.huntingReplyState =
    global.huntingReplyState || new Map();

global.activeSendingState =
    global.activeSendingState || new Map();

global.huntingDuplicateState =
    global.huntingDuplicateState || new Map();

global.huntingUsedReplies =
    global.huntingUsedReplies || [];

global.huntingStats =
    global.huntingStats || {
        replies: 0,
        reactions: 0,
        suppressed: 0,
        started: Date.now()
    };

global.gcNameLockState =
    global.gcNameLockState || new Map();

global.nicknameState =
    global.nicknameState || new Map();

global.countStartState =
    global.countStartState || new Map();

global.countRunState =
    global.countRunState || new Map();

// ============================================================
// SETTINGS
// ============================================================

const REPLY_INTERVAL = 10000;

const DUPLICATE_WINDOW = 4500;

const MIN_TYPING_DELAY = 1500;

const MAX_TYPING_DELAY = 3500;

const MAX_COUNT = 50;

const COUNT_INTERVAL = 1000;

// ============================================================
// REACTIONS
// ============================================================

const SELF_REACTIONS = [
    "😂",
    "😭",
    "🤣",
    "😹",
    "😆",
    "😎",
    "😏",
    "🤨",
    "🙄",
    "💀",
    "🔥",
    "❤️",
    "👍",
    "👏",
    "😮"
];

// ============================================================
// HUNTING REPLIES
// ============================================================

const massiveTaunts = [

    "ano na pre",
    "ayan nanaman",
    "eto na naman banat mo",
    "wala ka bang ibang sagot",
    "parang familiar yan ah",
    "narinig ko na yan",
    "may bago sana",
    "di pa rin convincing",
    "kulang pa",
    "bitin yung punto",
    "asan yung explanation",
    "di mo nasagot",
    "naiwan mo yung tanong",
    "balik muna sa topic",
    "focus sa sinabi mo",
    "check mo ulit",
    "basahin mo maigi",
    "parang may mali",
    "may na-miss ka",
    "may kulang sa sagot",
    "di tugma pre",
    "hindi nagtutugma",
    "contradicting naman",
    "kanina iba sinabi mo",
    "alin ba talaga",
    "decide ka muna",
    "isang sagot lang",
    "wag dalawang version",
    "consistent sana",
    "keep it simple",
    "diretso na lang",
    "wag na paikot",
    "straight to the point",
    "ano talaga punto mo",
    "saan papunta yan",
    "lost ka na naman",
    "naligaw na yung sagot",
    "napunta sa ibang topic",
    "change topic nanaman",
    "nice try pre",
    "good attempt",
    "close enough",
    "try again",
    "next attempt",
    "pwede pa yan",
    "ulitin mo",
    "restart answer",
    "back to zero",
    "reset muna",
    "loading pa rin",
    "buffering nanaman",
    "nag timeout ka ba",
    "late reaction",
    "finally",
    "ayan lumabas din",
    "yun lang pala",
    "yun na yun",
    "ganun lang",
    "simple lang sana",
    "pinahirap mo pa",
    "ang dali lang ng tanong",
    "basic lang yan",
    "wag complicate",
    "wag overthink",
    "isip muna",
    "pause muna",
    "read muna",
    "understand muna",
    "chill muna",
    "relax ka lang",
    "kalma keyboard",
    "hinay hinay",
    "wag gigil",
    "easy lang",
    "slow down",
    "one step at a time",
    "wag sabay sabay",
    "isa isa lang",
    "focus pre",
    "stay on topic",
    "topic muna",
    "question muna",
    "answer muna",
    "explain mo",
    "linawin mo",
    "ayusin mo",
    "buoin mo muna",
    "complete mo",
    "kulang yung thought",
    "bitin yung sentence",
    "bitin yung point",
    "may continuation pa ba",
    "tapos na ba yan",
    "yun na ba",
    "sure ka na",
    "final na talaga",
    "panindigan mo",
    "wag magpalit",
    "wag bawiin",
    "kanina kasi",
    "balikan natin",
    "scroll up",
    "nasa taas yung sagot",
    "check history",
    "chat history muna",
    "proof muna",
    "context muna",
    "may context tayo",
    "wag kalimutan",
    "ikaw mismo nagsabi",
    "galing sayo yan",
    "sarili mong salita yan",
    "balikan mo sarili mo",
    "oops",
    "ayan na",
    "hala",
    "oh no",
    "nice one",
    "good one",
    "interesting",
    "okay pre",
    "sige pre",
    "go lang",
    "continue",
    "next line",
    "next excuse",
    "next reason",
    "next answer",
    "ano pa",
    "may bonus pa ba",
    "dagdagan mo",
    "labas pa",
    "sige pa",
    "continue mo",
    "go again",
    "another one",
    "isa pa",
    "ulit pa",
    "again",
    "round two",
    "next round",
    "eto na naman tayo",
    "same cycle",
    "same pattern",
    "same routine",
    "same response",
    "same story",
    "same excuse",
    "same direction",
    "walang bago",
    "nothing new",
    "nothing changed",
    "still the same",
    "same energy",
    "same behavior",
    "same answer",
    "same point",
    "same mistake",
    "ulit ulit",
    "replay nanaman",
    "repeat nanaman",
    "loop detected",
    "stuck sa loop",
    "naka repeat ka",
    "repeating again",
    "di matapos tapos",
    "walang ending",
    "endless excuse",
    "endless story",
    "mahaba pa ba",
    "may katapusan ba",
    "tapos na sana",
    "close na sana",
    "almost there",
    "malapit na",
    "konti na lang",
    "last na sana",
    "pero eto pa rin",
    "andito pa rin tayo",
    "back to same topic",
    "round and round",
    "ikot nanaman",
    "ikot nang ikot",
    "walang progress",
    "no progress",
    "stuck ka talaga",
    "di umaandar",
    "pause ka muna",
    "resume later",
    "take five",
    "break muna",
    "hinga muna pre",
    "tubig muna",
    "kape muna",
    "rest muna",
    "chill lang",
    "wag seryosohin",
    "chat lang naman",
    "easy easy",
    "kalma lang",
    "okay lang yan",
    "try ulit",
    "maybe next time",
    "bawi ka",
    "practice pa",
    "practice muna",
    "needs revision",
    "edit mo muna",
    "draft muna",
    "finalize mo",
    "proofread muna",
    "check grammar",
    "check logic",
    "check context",
    "double check",
    "think twice",
    "read twice",
    "send once",
    "wag spam",
    "one message at a time",
    "dahan dahan lang",
    "wag magmadali",
    "take your time",
    "answer the question",
    "balik sa tanong",
    "wag umiwas",
    "wag lumiko",
    "wag tumalon topic",
    "stay focused",
    "focus lang",
    "concentrate muna",
    "sagot lang kailangan",
    "simple answer lang",
    "short answer sana",
    "less talk",
    "more point",
    "point muna",
    "substance muna",
    "may laman ba",
    "asan yung laman",
    "asan yung point",
    "point missing",
    "context missing",
    "logic missing",
    "answer missing",
    "explanation missing",
    "still waiting",
    "waiting pa rin",
    "hintay kami",
    "sagot kapag ready",
    "no pressure",
    "pero wag kalimutan yung tanong",
    "ayan na naman excuse",
    "excuse detected",
    "reason detected",
    "topic change detected",
    "repetition detected",
    "same line detected",
    "same script detected",
    "pattern detected",
    "interesting pattern",
    "familiar pattern",
    "we've seen this before",
    "nothing new here",
    "same thing again",
    "again and again",
    "ulit na naman",
    "another repeat",
    "paulit ulit talaga",
    "di ka nagsasawa",
    "di ka nauubusan",
    "ang tiyaga mo",
    "persistent ah",
    "consistent talaga",
    "at least consistent",
    "okay next",
    "moving on",
    "next topic",
    "next response",
    "next move",
    "your turn",
    "sige ikaw naman",
    "go ahead",
    "keep going",
    "show me",
    "explain yourself",
    "clarify muna",
    "linaw muna",
    "define mo muna",
    "specific naman",
    "be specific",
    "details naman",
    "asan details",
    "wag vague",
    "wag general",
    "diretso lang pre",
    "specific answer",
    "clear answer",
    "clear point",
    "make sense muna",
    "connect the dots",
    "may connection ba",
    "asan connection",
    "parang wala",
    "wala talaga",
    "still no point",
    "point still missing",
    "answer still missing",
    "same result",
    "same outcome",
    "same conclusion",
    "back again",
    "here we go again",
    "eto na naman",
    "again pre",
    "ulit tayo",
    "one more time",
    "last try",
    "final try",
    "final na talaga?",
    "sure ka na talaga?",
    "yan na ba talaga?"
];

// ============================================================
// ABBREVIATIONS
// ============================================================

const ABBREVIATIONS = {

    "ano na pre": [
        "ano n pre",
        "ano nmn pre",
        "ano n p"
    ],

    "sige pre": [
        "sge pre",
        "sige p",
        "sge p",
        "g pre"
    ],

    "okay pre": [
        "ok pre",
        "oks pre",
        "okay p",
        "ok p"
    ],

    "balik sa topic": [
        "balik topic",
        "b2 topic",
        "back topic"
    ],

    "wag ka muna": [
        "wag k muna",
        "wag k mna",
        "wag muna"
    ],

    "hindi nagtutugma": [
        "di tugma",
        "d tugma",
        "hnd tugma"
    ],

    "wala namang bago": [
        "wla nmn bago",
        "wla bago",
        "same lng"
    ],

    "ulit ulit": [
        "ulit2",
        "u2",
        "repeat2"
    ],

    "isa pa": [
        "1 pa",
        "isa p",
        "1p"
    ],

    "tapos na ba": [
        "tpos n b",
        "tapos n?",
        "tnb"
    ],

    "sure ka": [
        "sure k",
        "sure ka?",
        "sk"
    ],

    "hintay lang": [
        "wait lng",
        "w8 lng",
        "hynty lng"
    ]
};

// ============================================================
// RANDOM
// ============================================================

function randomItem(array) {

    return array[
        Math.floor(
            Math.random() * array.length
        )
    ];
}

function randomNumber(min, max) {

    return Math.floor(
        Math.random() *
        (max - min + 1)
    ) + min;
}

// ============================================================
// UNIQUE REPLY
// ============================================================

function getUniqueTaunt() {

    let available =
        massiveTaunts.filter(
            reply =>
                !global.huntingUsedReplies.includes(
                    reply
                )
        );

    if (
        available.length === 0
    ) {

        global.huntingUsedReplies = [];

        available =
            massiveTaunts.slice();
    }

    const selected =
        randomItem(available);

    global.huntingUsedReplies.push(
        selected
    );

    if (
        global.huntingUsedReplies.length >
        100
    ) {

        global.huntingUsedReplies.shift();
    }

    return selected;
}

// ============================================================
// ABBREVIATION
// ============================================================

function applyAbbreviation(text) {

    if (!text) {
        return text;
    }

    const key =
        text
            .toLowerCase()
            .trim();

    if (
        ABBREVIATIONS[key] &&
        Math.random() < 0.45
    ) {

        return randomItem(
            ABBREVIATIONS[key]
        );
    }

    return text;
}

// ============================================================
// CASUAL MIMICKER
// ============================================================

function mimicText(text) {

    if (
        !text ||
        typeof text !== "string"
    ) {
        return text;
    }

    let result =
        text.trim();

    if (
        result.length <= 3
    ) {
        return result;
    }

    // Lowercase variation
    if (
        Math.random() < 0.65
    ) {

        result =
            result.toLowerCase();
    }

    // Remove ending punctuation sometimes
    if (
        Math.random() < 0.35
    ) {

        result =
            result.replace(
                /[!?.,]+$/g,
                ""
            );
    }

    // Casual replacements
    if (
        Math.random() < 0.30
    ) {

        result =
            result
                .replace(
                    /\bhindi naman\b/gi,
                    "di nmn"
                )
                .replace(
                    /\bhindi\b/gi,
                    "di"
                )
                .replace(
                    /\bnamang\b/gi,
                    "nmn"
                )
                .replace(
                    /\bnaman\b/gi,
                    "nmn"
                )
                .replace(
                    /\bwala\b/gi,
                    "wla"
                )
                .replace(
                    /\btapos\b/gi,
                    "tpos"
                )
                .replace(
                    /\biyon\b/gi,
                    "yon"
                )
                .replace(
                    /\bito\b/gi,
                    "to"
                )
                .replace(
                    /\bmuna\b/gi,
                    "mna"
                );
    }

    // Casual suffix
    if (
        Math.random() < 0.18
    ) {

        result += randomItem([
            " pre",
            " bro",
            " ah",
            " e",
            " haha"
        ]);
    }

    return result;
}

// ============================================================
// FINAL REPLY PROCESSOR
// ============================================================

function humanizeHuntingReply(text) {

    let result = text;

    result =
        applyAbbreviation(result);

    result =
        mimicText(result);

    return result;
}

// ============================================================
// SELF REACTION
// ============================================================

function selfReact(api, messageID) {

    return new Promise(resolve => {

        if (
            !api ||
            !messageID ||
            typeof api.setMessageReaction !==
            "function"
        ) {

            return resolve(false);
        }

        const reaction =
            randomItem(
                SELF_REACTIONS
            );

        try {

            /*
             * 3-argument FCA call.
             *
             * The account currently logged into
             * the API performs the reaction.
             */

            api.setMessageReaction(
                reaction,
                messageID,
                err => {

                    if (err) {
                        return resolve(false);
                    }

                    global.huntingStats.reactions++;

                    resolve(true);
                }
            );

        } catch (error) {

            resolve(false);
        }
    });
}

// ============================================================
// SAFE SEND
// ============================================================

function sendMessageSafe(
    api,
    message,
    threadID
) {

    return new Promise(resolve => {

        if (
            !api ||
            !threadID ||
            typeof api.sendMessage !==
            "function"
        ) {

            return resolve(false);
        }

        try {

            api.sendMessage(
                message,
                threadID,
                err => {

                    if (err) {
                        return resolve(false);
                    }

                    global.huntingStats.replies++;

                    resolve(true);
                }
            );

        } catch (error) {

            resolve(false);
        }
    });
}

// ============================================================
// TYPING
// ============================================================

function sendTyping(
    api,
    threadID
) {

    try {

        if (
            api &&
            typeof api.sendTypingIndicator ===
            "function"
        ) {

            api.sendTypingIndicator(
                threadID,
                () => {}
            );
        }

    } catch (error) {
        // Optional API.
    }
}

// ============================================================
// THREAD INFO
// ============================================================

function getThreadInfoSafe(
    api,
    threadID
) {

    return new Promise(resolve => {

        if (
            !api ||
            typeof api.getThreadInfo !==
            "function"
        ) {

            return resolve(null);
        }

        try {

            api.getThreadInfo(
                threadID,
                (err, info) => {

                    if (err) {
                        return resolve(null);
                    }

                    resolve(info);
                }
            );

        } catch (error) {

            resolve(null);
        }
    });
}

// ============================================================
// NICKNAME
// ============================================================

function setNicknameSafe(
    api,
    threadID,
    userID,
    nickname
) {

    return new Promise(resolve => {

        if (
            !api ||
            typeof api.changeNickname !==
            "function"
        ) {

            return resolve(false);
        }

        try {

            api.changeNickname(
                nickname,
                threadID,
                userID,
                err => {

                    resolve(!err);
                }
            );

        } catch (error) {

            resolve(false);
        }
    });
}

// ============================================================
// GC NAME LOCK
// ============================================================

async function applyThreadNameLock(
    api,
    threadID
) {

    const lock =
        global.gcNameLockState.get(
            threadID
        );

    if (!lock) {
        return;
    }

    try {

        const info =
            await getThreadInfoSafe(
                api,
                threadID
            );

        if (!info) {
            return;
        }

        if (
            info.threadName !== lock.name &&
            typeof api.setTitle ===
            "function"
        ) {

            api.setTitle(
                lock.name,
                threadID,
                () => {}
            );
        }

    } catch (error) {}
}

// ============================================================
// STATUS
// ============================================================

function getStatus() {

    const uptime =
        Date.now() -
        global.huntingStats.started;

    const seconds =
        Math.floor(
            uptime / 1000
        );

    return [
        "╭─── HUNTING STATUS ───╮",
        `│ Hunting: ${
            global.huntingState
                ? "ON"
                : "OFF"
        }`,
        `│ Count: ${
            global.countEngineState
                ? "ON"
                : "OFF"
        }`,
        `│ Replies: ${
            global.huntingStats.replies
        }`,
        `│ Reactions: ${
            global.huntingStats.reactions
        }`,
        `│ Suppressed: ${
            global.huntingStats.suppressed
        }`,
        `│ Admins: ${ADMIN_IDS.length}`,
        `│ Uptime: ${seconds}s`,
        "╰──────────────────────╯"
    ].join("\n");
}

// ============================================================
// COUNT ENGINE
// ============================================================

async function startCountEngine(
    api,
    threadID
) {

    if (
        global.countRunState.get(
            threadID
        )
    ) {
        return;
    }

    global.countRunState.set(
        threadID,
        true
    );

    global.countStartState.set(
        threadID,
        Date.now()
    );

    for (
        let count = 1;
        count <= MAX_COUNT;
        count++
    ) {

        if (
            !global.countEngineState ||
            !global.countRunState.get(
                threadID
            )
        ) {
            break;
        }

        await sendMessageSafe(
            api,
            String(count),
            threadID
        );

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    COUNT_INTERVAL
                )
        );
    }

    global.countRunState.delete(
        threadID
    );
}

// ============================================================
// ADMIN COMMAND DETECTOR
// ============================================================

function isHuntingCommand(body) {

    if (!body) {
        return false;
    }

    const text =
        body
            .trim()
            .toLowerCase();

    return (
        text === "hunting" ||
        text === "hunting start" ||
        text === "hunting on" ||
        text === "hunting stop" ||
        text === "hunting off" ||
        text === "hunting count" ||
        text === "hunting count off" ||
        text === "hunting status" ||
        text === "hunting unlock" ||
        text.startsWith("hunting lock ") ||
        text.startsWith("hunting set ")
    );
}

// ============================================================
// ADMIN COMMAND HANDLER
// ============================================================

async function handleAdminCommand(
    api,
    event,
    body
) {

    if (!isAdmin(event)) {
        return false;
    }

    if (!isHuntingCommand(body)) {
        return false;
    }

    const parts =
        body
            .trim()
            .split(/\s+/);

    parts.shift();

    const command =
        parts
            .join(" ")
            .trim()
            .toLowerCase();

    const threadID =
        event.threadID;

    // ========================================================
    // START
    // ========================================================

    if (
        command === "start" ||
        command === "on"
    ) {

        global.huntingState = true;

        await sendMessageSafe(
            api,
            "HUNTING: ON",
            threadID
        );

        return true;
    }

    // ========================================================
    // STOP
    // ========================================================

    if (
        command === "stop" ||
        command === "off"
    ) {

        global.huntingState = false;

        await sendMessageSafe(
            api,
            "HUNTING: OFF",
            threadID
        );

        return true;
    }

    // ========================================================
    // COUNT
    // ========================================================

    if (
        command === "count"
    ) {

        global.countEngineState = true;

        await sendMessageSafe(
            api,
            "COUNT: ON",
            threadID
        );

        startCountEngine(
            api,
            threadID
        );

        return true;
    }

    // ========================================================
    // COUNT OFF
    // ========================================================

    if (
        command === "count off"
    ) {

        global.countEngineState = false;

        global.countRunState.delete(
            threadID
        );

        await sendMessageSafe(
            api,
            "COUNT: OFF",
            threadID
        );

        return true;
    }

    // ========================================================
    // STATUS
    // ========================================================

    if (
        command === "status"
    ) {

        await sendMessageSafe(
            api,
            getStatus(),
            threadID
        );

        return true;
    }

    // ========================================================
    // LOCK
    // ========================================================

    if (
        command.startsWith("lock ")
    ) {

        const name =
            command
                .substring(5)
                .trim();

        if (!name) {
            return true;
        }

        global.gcNameLockState.set(
            threadID,
            {
                name
            }
        );

        try {

            if (
                typeof api.setTitle ===
                "function"
            ) {

                api.setTitle(
                    name,
                    threadID,
                    () => {}
                );
            }

        } catch (error) {}

        await sendMessageSafe(
            api,
            `GC LOCK: ${name}`,
            threadID
        );

        return true;
    }

    // ========================================================
    // UNLOCK
    // ========================================================

    if (
        command === "unlock"
    ) {

        global.gcNameLockState.delete(
            threadID
        );

        await sendMessageSafe(
            api,
            "GC LOCK: OFF",
            threadID
        );

        return true;
    }

    // ========================================================
    // SET NICKNAME
    // ========================================================

    if (
        command.startsWith("set ")
    ) {

        const nickname =
            body
                .trim()
                .substring(
                    "hunting set ".length
                )
                .trim();

        if (!nickname) {
            return true;
        }

        global.nicknameState.set(
            threadID,
            nickname
        );

        /*
         * Uses the admin who issued the command.
         * This means either admin can set their own
         * nickname without needing a single ADMIN_ID.
         */

        const success =
            await setNicknameSafe(
                api,
                threadID,
                event.senderID,
                nickname
            );

        await sendMessageSafe(
            api,
            success
                ? `NICKNAME: ${nickname}`
                : "NICKNAME: failed",
            threadID
        );

        return true;
    }

    return true;
}

// ============================================================
// RUN
// ============================================================

module.exports.run = async function ({
    api,
    event,
    args
}) {

    if (!event) {
        return;
    }

    if (!isAdmin(event)) {
        return;
    }

    const command =
        (args || [])
            .join(" ")
            .trim();

    if (!command) {
        await sendMessageSafe(
            api,
            [
                "HUNTING COMMANDS:",
                "hunting start",
                "hunting stop",
                "hunting count",
                "hunting count off",
                "hunting status",
                "hunting lock [name]",
                "hunting unlock",
                "hunting set [name]"
            ].join("\n"),
            event.threadID
        );

        return;
    }

    await handleAdminCommand(
        api,
        event,
        `hunting ${command}`
    );
};

// ============================================================
// HANDLE EVENT
// ============================================================

module.exports.handleEvent = async function ({
    api,
    event
}) {

    if (!event) {
        return;
    }

    const threadID =
        event.threadID;

    const senderID =
        event.senderID;

    if (!threadID) {
        return;
    }

    const body =
        typeof event.body === "string"
            ? event.body.trim()
            : "";

    // ========================================================
    // IGNORE BOT OWN MESSAGE
    // ========================================================

    try {

        if (
            typeof api.getCurrentUserID ===
            "function"
        ) {

            const botID =
                api.getCurrentUserID();

            if (
                String(senderID) ===
                String(botID)
            ) {
                return;
            }
        }

    } catch (error) {}

    // ========================================================
    // GC LOCK
    // ========================================================

    if (
        global.gcNameLockState.has(
            threadID
        )
    ) {

        await applyThreadNameLock(
            api,
            threadID
        );
    }

    // ========================================================
    // ADMIN COMMAND
    // ========================================================

    if (
        isAdmin(event) &&
        isHuntingCommand(body)
    ) {

        await handleAdminCommand(
            api,
            event,
            body
        );

        return;
    }

    // ========================================================
    // HUNTING OFF
    // ========================================================

    if (
        !global.huntingState
    ) {
        return;
    }

    // ========================================================
    // IGNORE COMMAND-LIKE MESSAGE
    // ========================================================

    if (
        body.startsWith("/") ||
        body.startsWith("!")
    ) {
        return;
    }

    // ========================================================
    // IGNORE EMPTY MESSAGE
    // ========================================================

    if (!body) {
        return;
    }

    // ========================================================
    // DUPLICATE KEY
    // ========================================================

    const duplicateKey =
        `${threadID}:${senderID}:${body.toLowerCase()}`;

    const now =
        Date.now();

    const lastDuplicate =
        global.huntingDuplicateState.get(
            duplicateKey
        );

    if (
        lastDuplicate &&
        now - lastDuplicate <
        DUPLICATE_WINDOW
    ) {

        global.huntingStats.suppressed++;

        return;
    }

    global.huntingDuplicateState.set(
        duplicateKey,
        now
    );

    // ========================================================
    // USER KEY
    // ========================================================

    const userKey =
        `${threadID}:${senderID}`;

    const lastReply =
        global.huntingReplyState.get(
            userKey
        );

    // ========================================================
    // COOLDOWN
    // ========================================================

    if (
        lastReply &&
        now - lastReply <
        REPLY_INTERVAL
    ) {

        global.huntingStats.suppressed++;

        return;
    }

    // ========================================================
    // ACTIVE LOCK
    // ========================================================

    if (
        global.activeSendingState.get(
            userKey
        )
    ) {

        global.huntingStats.suppressed++;

        return;
    }

    global.activeSendingState.set(
        userKey,
        true
    );

    global.huntingReplyState.set(
        userKey,
        now
    );

    // ========================================================
    // REACT
    // ========================================================

    /*
     * Reaction is independent from the reply.
     * If reaction fails, hunting still continues.
     */

    selfReact(
        api,
        event.messageID
    ).catch(() => {});

    // ========================================================
    // TYPING
    // ========================================================

    const typingDelay =
        randomNumber(
            MIN_TYPING_DELAY,
            MAX_TYPING_DELAY
        );

    sendTyping(
        api,
        threadID
    );

    setTimeout(
        () => {

            if (
                global.huntingState
            ) {

                sendTyping(
                    api,
                    threadID
                );
            }

        },
        Math.max(
            500,
            typingDelay - 500
        )
    );

    // ========================================================
    // DELAYED REPLY
    // ========================================================

    setTimeout(
        async () => {

            try {

                if (
                    !global.huntingState
                ) {
                    return;
                }

                let reply =
                    getUniqueTaunt();

                reply =
                    humanizeHuntingReply(
                        reply
                    );

                await sendMessageSafe(
                    api,
                    reply,
                    threadID
                );

            } catch (error) {

                console.error(
                    "[HUNTING ERROR]",
                    error
                );

            } finally {

                global.activeSendingState.delete(
                    userKey
                );
            }

        },
        REPLY_INTERVAL
    );
};

// ============================================================
// CLEANUP
// ============================================================

setInterval(
    () => {

        const now =
            Date.now();

        // ----------------------------------------------------
        // Duplicate cleanup
        // ----------------------------------------------------

        for (
            const [
                key,
                timestamp
            ]
            of global.huntingDuplicateState
        ) {

            if (
                now - timestamp >
                DUPLICATE_WINDOW * 2
            ) {

                global.huntingDuplicateState.delete(
                    key
                );
            }
        }

        // ----------------------------------------------------
        // Reply cooldown cleanup
        // ----------------------------------------------------

        for (
            const [
                key,
                timestamp
            ]
            of global.huntingReplyState
        ) {

            if (
                now - timestamp >
                REPLY_INTERVAL * 2
            ) {

                global.huntingReplyState.delete(
                    key
                );
            }
        }

    },
    60000
);

// ============================================================
// LOAD MESSAGE
// ============================================================

console.log(
    "[HUNTING] v8.1.0 loaded | Admins: 2"
);