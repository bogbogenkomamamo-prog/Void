"use strict";

const fs = require("fs-extra");

module.exports.config = {
    name: "hunting",
    version: "7.0.0",
    hasPermission: 2,
    credits: "User",
    description: "Prefixless Hunting + Count + GC Lock + Set Nickname + Status",
    usePrefix: false,
    commandCategory: "system",
    usages: "start | stop | count | lock [name] | unlock | set [name] | status",
    cooldowns: 0
};

// ============================================================
// AUTHORIZED ADMIN
// ============================================================

const ADMIN_ID = "61594616562680";

// ============================================================
// GLOBAL STORAGE
// ============================================================

if (!global.huntingState)
    global.huntingState = new Map();

if (!global.countEngineState)
    global.countEngineState = new Map();

if (!global.huntingReplyState)
    global.huntingReplyState = new Map();

if (!global.activeSendingState)
    global.activeSendingState = new Map();

if (!global.gcNameLockState)
    global.gcNameLockState = new Map();

if (!global.nicknameState)
    global.nicknameState = new Map();

if (!global.huntingDuplicateState)
    global.huntingDuplicateState = new Map();

if (!global.huntingStats)
    global.huntingStats = new Map();

if (!global.countStartState)
    global.countStartState = new Map();

if (!global.countRunState)
    global.countRunState = new Map();

let usedTaunts = [];

// ============================================================
// SETTINGS
// ============================================================

const REPLY_INTERVAL = 10000;

const MIN_TYPING_DELAY = 1500;
const MAX_TYPING_DELAY = 3500;

const DUPLICATE_WINDOW = 4500;

const MAX_COUNT = 50;

// ============================================================
// SELF REACTIONS
// ============================================================

const SELF_REACTIONS = [
    "👍",
    "❤️",
    "😂",
    "😆",
    "😮",
    "😎",
    "😏",
    "😅",
    "🔥",
    "💯",
    "👀",
    "🤝",
    "👏",
    "🥷",
    "💀",
    "🤣",
    "🙃",
    "😈"
];

const lastReactionState = new Map();

function getRandomReaction(threadID) {

    let list = SELF_REACTIONS;

    const previous =
        lastReactionState.get(threadID);

    if (previous && list.length > 1) {
        list = list.filter(
            reaction => reaction !== previous
        );
    }

    const reaction =
        list[
            Math.floor(
                Math.random() * list.length
            )
        ];

    lastReactionState.set(
        threadID,
        reaction
    );

    return reaction;
}

function selfReact(api, threadID, messageID) {

    try {

        if (
            typeof api.setMessageReaction !==
            "function"
        ) {
            return;
        }

        const reaction =
            getRandomReaction(threadID);

        api.setMessageReaction(
            reaction,
            messageID,
            () => {},
            true
        );

    } catch (err) {}
}

// ============================================================
// HUMANIZE
// ============================================================

function humanizeText(text) {

    if (!text)
        return text;

    let result = text;

    // Random lowercase behavior
    if (Math.random() < 0.30) {
        result = result.toLowerCase();
    }

    // Sometimes remove final punctuation
    if (
        Math.random() < 0.35 &&
        /[.!?]$/.test(result)
    ) {
        result = result.slice(0, -1);
    }

    return result;
}

// ============================================================
// TAUNTS
// ============================================================

const massiveTaunts = [

    "ano ba yan pre",

    "bat ganyan ka sumagot",

    "puro ka dada eh",

    "wala ka na bang ibang alam",

    "ulit ulit ka na naman",

    "anong pinagsasabi mo",

    "lutang ka ba ngayon",

    "saan napunta punto mo",

    "wala namang connect",

    "ang layo ng sagot mo",

    "di mo rin alam sinasabi mo",

    "seryoso ka dyan",

    "yan lang naisip mo",

    "ang pilit naman",

    "wag mo nang ipilit yan",

    "ang dami mong palusot",

    "may dahilan ka pa",

    "tahimik ka muna",

    "nag loading ka ba",

    "reboot ka muna pre",

    "bakit ka napipikon",

    "tinamaan ka ba",

    "bakit defensive ka",

    "wag mong ilihis usapan",

    "balik ka sa punto",

    "sagot naman di palusot",

    "puro ka dahilan eh",

    "hanggang salita ka lang",

    "dami mong sinabi wala pa rin",

    "diretsohin mo kasi",

    "wag paikot ikot",

    "takot ka ba sa tanong",

    "may bago ka pa ba",

    "copy paste ka ba",

    "parang template eh",

    "scripted masyado",

    "ang tagal mo para dyan",

    "yan lang inabot ng isip mo",

    "pinilit mo pa talaga",

    "tama na pre",

    "di ka marunong tumigil",

    "wala kang preno",

    "paulit ulit na lang",

    "nakakaumay na linya mo",

    "ang hirap mong sundan",

    "wala ka sa hulog",

    "sablay na naman",

    "suko ka na lang",

    "ang haba para sa wala",

    "daming salita wala pa rin",

    "final answer mo na yan",

    "isipin mo muna ulit",

    "wag mo na",

    "wag na lods",

    "gusto mo talaga ng gulo ah",

    "ikaw naghahanap eh",

    "chat lang yan pre",

    "bitawan mo muna keyboard",

    "baka masira keyboard mo",

    "gigil na gigil ka",

    "pahinga ka muna",

    "ano pa",

    "may kasunod pa",

    "eto nanaman tayo",

    "di ka talaga natututo",

    "nakalimutan mo na naman",

    "lutang mo pre",

    "sabog ka yata",

    "wag kang tumakas sa topic",

    "sumagot ka nang maayos",

    "alam mo naman sagot eh",

    "kunwari ka pa",

    "halata naman",

    "nahuli ka na",

    "ano excuse ngayon",

    "may bago ka bang dahilan",

    "pareho pa rin excuse",

    "pinapahaba mo lang",

    "yan na talaga",

    "sigurado ka dyan",

    "bawi ka na lang",

    "talagang pinipilit mo",

    "wala ka nang masabi",

    "ubos na ba",

    "hanggang dyan ka lang",

    "anong klaseng sagot yan",

    "di mo maayos yung punto mo",

    "wag ka muna mag ingay",

    "ayusin mo muna sinasabi mo",

    "parang naliligaw ka",

    "saan ka ba papunta",

    "iba naman sagot mo",

    "di yan yung tanong",

    "sumagot ka ulit",

    "basahin mo muna",

    "maling topic ka",

    "di mo nasundan",

    "ang gulo mo pre",

    "wag kang magpaligoy ligoy",

    "diretso lang",

    "ano ba talaga",

    "puro liko",

    "wala kang direksyon",

    "ang labo mo",

    "nag iba nanaman kwento",

    "iba iba sinasabi mo",

    "di mo mapanindigan",

    "kanina iba naman",

    "nagbago nanaman",

    "ano na naman yan",

    "saan galing yan",

    "bigla ka namang lumiko",

    "di bagay sa usapan",

    "walang connect talaga",

    "ang layo na",

    "napunta ka na kung saan saan",

    "balik topic",

    "wag kang lumusot",

    "wag kang umiwas",

    "sagot lang",

    "wag palusot",

    "alam mong mali eh",

    "pilit mo pa rin",

    "di na kailangan pahabain",

    "tapos na sana eh",

    "pinapahaba mo pa",

    "ang dami mong ikot",

    "ikot ka nang ikot",

    "wala pa rin",

    "wala talaga",

    "ano pa sasabihin mo",

    "may dagdag ka pa",

    "eto nanaman dahilan",

    "parehas lang",

    "same energy nanaman",

    "di ka pa tapos",

    "hanggang ngayon yan pa rin",

    "di ka nauubusan",

    "ang kulit mo",

    "kulit mo pre",

    "wala ka bang ibang linya",

    "iba naman next time",

    "parang sirang plaka",

    "paulit ulit ka",

    "narinig na namin yan",

    "alam na namin yan",

    "di na bago yan",

    "same script",

    "parehong banat",

    "wala nang bago",

    "may bago ka bang ambag",

    "asan yung punto",

    "wala yung punto",

    "nawala ka na",

    "lutang nanaman",

    "saan napunta utak mo",

    "isip muna bago send",

    "send ka nang send",

    "di mo binabasa",

    "basa muna pre",

    "intindi muna",

    "wag puro send",

    "nagmamadali ka",

    "chill ka lang",

    "kalma muna",

    "hinga muna",

    "pahinga muna",

    "keyboard break muna",

    "tama na muna",

    "wag ka gigil",

    "di kailangan magalit",

    "bakit galit na",

    "kalmahan mo",

    "napipikon ka na",

    "halata yung gigil",

    "wag masyadong seryoso",

    "chat lang yan",

    "nag iinit ka na",

    "lumalabas na galit mo",

    "bakit defensive",

    "may tinatamaan ba",

    "tinamaan yata",

    "aray ba",

    "bakit biglang tahimik",

    "nawala ka",

    "asan ka",

    "nag isip ka pa ba",

    "matagal na ah",

    "loading nanaman",

    "buffering ka ba",

    "restart muna",

    "update ka muna",

    "check mo muna sagot mo",

    "mali ata yan",

    "sigurado ka talaga",

    "pag isipan mo",

    "balikan mo",

    "read back muna",

    "wag mo iedit yung kwento",

    "consistent naman sana",

    "kanina iba sinabi mo",

    "nahuli sa sariling salita",

    "ikaw din nagsabi nyan",

    "balikan mo chat mo",

    "nasa taas lang",

    "basahin mo ulit",

    "di mo nakita",

    "missing point",

    "wala sa context",

    "di mo gets",

    "gets mo ba",

    "intindi ka muna",

    "wag agad reply",

    "isip dalawang beses",

    "send isang beses",

    "wag spam",

    "kalma sa keyboard",

    "ang bilis mo naman",

    "pero wala pa rin",

    "bilis walang laman",

    "haba walang punto",

    "short answer lang sana",

    "dami mo sinabi",

    "pero wala pa rin",

    "eto na naman yung palusot",

    "excuse nanaman",

    "may dahilan ulit",

    "same excuse",

    "bagong excuse naman",

    "wag puro dahilan",

    "wag takasan tanong",

    "harap sa tanong",

    "sagot sa tanong",

    "hindi ibang kwento",

    "wag mag change topic",

    "balik tayo",

    "focus muna",

    "wag maligaw",

    "san ka nanaman pumunta",

    "ano yan",

    "ano ba talaga",

    "seryoso ka",

    "yan na",

    "ayan na naman",

    "eto nanaman",

    "wala na bang iba",

    "paulit ulit talaga",

    "nakakailang na",

    "ilang beses na yan",

    "narinig na yan",

    "wag na pre",

    "tama na",

    "stop na",

    "sobra na",

    "pahinga ka",

    "hinga ka",

    "uminom ka muna",

    "wag kang gigil",

    "wag mong pilitin",

    "di bagay sayo yan",

    "ang pilit",

    "halatang pilit",

    "pinipilit talaga",

    "di mo mapalabas",

    "di mo maayos",

    "ayos muna",

    "compose ka muna",

    "isip ka muna",

    "balikan mo yung sinabi mo",

    "di tugma",

    "di pareho",

    "may kulang",

    "may sablay",

    "sablay na naman",

    "maling basa",

    "maling intindi",

    "maling punto",

    "maling direction",

    "wala sa usapan",

    "out of topic",

    "off topic ka",

    "balik sa tanong",

    "sagot lang pre",

    "wag essay",

    "wag paligoy",

    "straight answer",

    "ano sagot",

    "nasaan sagot",

    "wala pa rin sagot",

    "hindi yan sagot",

    "palusot yan",

    "reason nanaman",

    "excuse nanaman",

    "di ka matapos",

    "ang dami",

    "sobra dami",

    "konti lang sana",

    "pinahaba mo pa",

    "pinilit pahabain",

    "tapos na sana",

    "wala na pre",

    "next na",

    "sunod",

    "ano pa",

    "may iba pa",

    "sige ano pa",

    "labas mo pa",

    "yan lang",

    "yun na",

    "ganun lang",

    "okay na yan",

    "tigil na",

    "wag na dagdagan",

    "puro ka salita",

    "salita nang salita",

    "chat nang chat",

    "send nang send",

    "walang preno",

    "di ka humihinto",

    "di ka natututo",

    "same problem",

    "same answer",

    "same excuse",

    "same line",

    "same script",

    "wala nang bago",

    "nakakasawa na",

    "nakakaumay",

    "ang repetitive",

    "paulit ulit",

    "parang naka loop",

    "naka loop ka ba",

    "stuck ka ba",

    "restart ka muna pre"

];

// ============================================================
// UNIQUE TAUNT
// ============================================================

function getUniqueTaunt() {

    if (
        usedTaunts.length >=
        massiveTaunts.length
    ) {
        usedTaunts = [];
    }

    const available =
        massiveTaunts.filter(
            item =>
                !usedTaunts.includes(item)
        );

    const chosen =
        available[
            Math.floor(
                Math.random() *
                available.length
            )
        ];

    usedTaunts.push(chosen);

    return chosen;
}

// ============================================================
// HUMAN MIMICKER
// ============================================================

function humanMimicker(targetBody, text) {

    if (!targetBody)
        return text;

    const length =
        targetBody.trim().length;

    if (length <= 4) {

        const words =
            text.split(/\s+/);

        return words
            .slice(
                0,
                Math.min(
                    2,
                    words.length
                )
            )
            .join(" ");
    }

    if (
        length <= 10 &&
        Math.random() < 0.45
    ) {

        const words =
            text.split(/\s+/);

        return words
            .slice(
                0,
                Math.min(
                    4,
                    words.length
                )
            )
            .join(" ");
    }

    return text;
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

        try {

            api.sendMessage(
                message,
                threadID,
                err => {
                    resolve(!err);
                }
            );

        } catch (err) {

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
            typeof api.sendTypingIndicator ===
            "function"
        ) {

            api.sendTypingIndicator(
                threadID,
                () => {}
            );

        }

    } catch (err) {}
}

// ============================================================
// GET THREAD INFO
// ============================================================

function getThreadInfoSafe(
    api,
    threadID
) {

    return new Promise(resolve => {

        try {

            api.getThreadInfo(
                threadID,
                (err, info) => {

                    if (err || !info)
                        return resolve(null);

                    resolve(info);

                }
            );

        } catch (err) {

            resolve(null);

        }

    });
}

// ============================================================
// CHANGE NICKNAME
// ============================================================

function changeNicknameSafe(
    api,
    nickname,
    userID,
    threadID
) {

    return new Promise(resolve => {

        try {

            api.changeNickname(
                nickname,
                userID,
                threadID,
                err => {
                    resolve(!err);
                }
            );

        } catch (err) {

            resolve(false);

        }

    });
}

// ============================================================
// SET ALL NICKNAMES
// ============================================================

async function setAllNicknames(
    api,
    threadID,
    nickname
) {

    const info =
        await getThreadInfoSafe(
            api,
            threadID
        );

    if (!info)
        return {
            success: false,
            total: 0
        };

    let members =
        info.participantIDs || [];

    const botID =
        api.getCurrentUserID();

    members =
        members.filter(
            id => id !== botID
        );

    let success = 0;

    for (const userID of members) {

        const result =
            await changeNicknameSafe(
                api,
                nickname,
                userID,
                threadID
            );

        if (result)
            success++;

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    150
                )
        );
    }

    global.nicknameState.set(
        threadID,
        {
            nickname,
            total: members.length,
            success,
            updatedAt: Date.now()
        }
    );

    return {
        success: true,
        total: members.length,
        changed: success
    };
}

// ============================================================
// SET GC TITLE
// ============================================================

function setGCTitleSafe(
    api,
    title,
    threadID
) {

    return new Promise(resolve => {

        try {

            api.setTitle(
                title,
                threadID,
                err => {
                    resolve(!err);
                }
            );

        } catch (err) {

            resolve(false);

        }

    });
}

// ============================================================
// LOCK GC NAME
// ============================================================

async function lockGCName(
    api,
    threadID,
    requestedName
) {

    const name =
        requestedName.trim();

    if (!name)
        return false;

    const success =
        await setGCTitleSafe(
            api,
            name,
            threadID
        );

    if (!success)
        return false;

    global.gcNameLockState.set(
        threadID,
        {
            locked: true,
            name,
            updatedAt: Date.now()
        }
    );

    return true;
}

// ============================================================
// COUNT ENGINE
// ============================================================

async function startCounting(
    api,
    event
) {

    const threadID =
        event.threadID;

    if (
        global.countEngineState.get(
            threadID
        ) === true
    ) {
        return;
    }

    global.countEngineState.set(
        threadID,
        true
    );

    const started =
        Date.now();

    global.countStartState.set(
        threadID,
        started
    );

    global.countRunState.set(
        threadID,
        0
    );

    let count = 1;

    while (
        global.countEngineState.get(
            threadID
        ) === true &&
        count <= MAX_COUNT
    ) {

        const sent =
            await sendMessageSafe(
                api,
                String(count),
                threadID
            );

        if (!sent)
            break;

        global.countRunState.set(
            threadID,
            count
        );

        count++;

        if (count <= MAX_COUNT) {

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        500
                    )
            );
        }
    }

    const finished =
        Date.now();

    const completed =
        global.countRunState.get(
            threadID
        ) || 0;

    const startTime =
        new Date(
            started
        ).toLocaleTimeString(
            "en-US",
            {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }
        );

    const finishTime =
        new Date(
            finished
        ).toLocaleTimeString(
            "en-US",
            {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }
        );

    const status =
        completed >= MAX_COUNT
            ? "COMPLETED"
            : "STOPPED";

    global.countEngineState.set(
        threadID,
        false
    );

    await new Promise(
        resolve =>
            setTimeout(
                resolve,
                500
            )
    );

    await sendMessageSafe(
        api,

        `COUNT RESIBO
━━━━━━━━━━━━━━━━━━
TOTAL: ${completed} / ${MAX_COUNT}
START: ${startTime}
FINISH: ${finishTime}
STATUS: ${status}
━━━━━━━━━━━━━━━━━━
COUNT ENGINE DONE`,

        threadID
    );
}

// ============================================================
// BOT STATUS
// ============================================================

async function getStatusText(
    api,
    threadID
) {

    const hunting =
        global.huntingState.get(
            threadID
        ) === true;

    const counting =
        global.countEngineState.get(
            threadID
        ) === true;

    const lock =
        global.gcNameLockState.get(
            threadID
        );

    const nickname =
        global.nicknameState.get(
            threadID
        );

    const stats =
        global.huntingStats.get(
            threadID
        ) || {
            replies: 0,
            blocked: 0
        };

    const info =
        await getThreadInfoSafe(
            api,
            threadID
        );

    const currentName =
        info && info.threadName
            ? info.threadName
            : "Unknown";

    return (
        `BOT STATUS\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `HUNTING: ${hunting ? "ON" : "OFF"}\n` +
        `COUNT: ${counting ? "RUNNING" : "OFF"}\n` +
        `GC NAME LOCK: ${
            lock && lock.locked
                ? "ON"
                : "OFF"
        }\n` +
        `CURRENT GC NAME: ${currentName}\n` +
        `LOCKED NAME: ${
            lock && lock.locked
                ? lock.name
                : "NONE"
        }\n` +
        `SET NICKNAME: ${
            nickname
                ? nickname.nickname
                : "NONE"
        }\n` +
        `HUNTING REPLIES: ${stats.replies}\n` +
        `BLOCKED/SPAM: ${stats.blocked}\n` +
        `UPTIME: ${Math.floor(process.uptime())}s\n` +
        `━━━━━━━━━━━━━━━━━━`
    );
}

// ============================================================
// COMMAND HANDLER
// ============================================================

module.exports.run = async function ({
    api,
    event,
    args
}) {

    const {
        threadID,
        senderID,
        messageID
    } = event;

    if (
        senderID !== ADMIN_ID
    ) {
        return;
    }

    const input =
        Array.isArray(args)
            ? args.join(" ").trim()
            : "";

    const lower =
        input.toLowerCase();

    // ========================================================
    // START
    // ========================================================

    if (
        lower === "start" ||
        lower === "on"
    ) {

        global.huntingState.set(
            threadID,
            true
        );

        selfReact(
            api,
            threadID,
            messageID
        );

        return;
    }

    // ========================================================
    // STOP
    // ========================================================

    if (
        lower === "stop" ||
        lower === "off"
    ) {

        global.huntingState.set(
            threadID,
            false
        );

        selfReact(
            api,
            threadID,
            messageID
        );

        return;
    }

    // ========================================================
    // COUNT
    // ========================================================

    if (
        lower === "count"
    ) {

        selfReact(
            api,
            threadID,
            messageID
        );

        if (
            global.countEngineState.get(
                threadID
            ) === true
        ) {
            return;
        }

        startCounting(
            api,
            event
        );

        return;
    }

    // ========================================================
    // COUNT OFF
    // ========================================================

    if (
        lower === "count off"
    ) {

        global.countEngineState.set(
            threadID,
            false
        );

        selfReact(
            api,
            threadID,
            messageID
        );

        return;
    }

    // ========================================================
    // STATUS
    // ========================================================

    if (
        lower === "status"
    ) {

        selfReact(
            api,
            threadID,
            messageID
        );

        const status =
            await getStatusText(
                api,
                threadID
            );

        await sendMessageSafe(
            api,
            status,
            threadID
        );

        return;
    }

    // ========================================================
    // LOCK GC NAME
    // ========================================================

    if (
        lower.startsWith("lock ")
    ) {

        const name =
            input
                .substring(5)
                .trim();

        if (!name)
            return;

        const success =
            await lockGCName(
                api,
                threadID,
                name
            );

        selfReact(
            api,
            threadID,
            messageID
        );

        if (success) {

            await sendMessageSafe(
                api,
                `GC NAME LOCKED\nName: ${name}`,
                threadID
            );

        } else {

            await sendMessageSafe(
                api,
                `Hindi ma-lock ang GC name.`,
                threadID
            );
        }

        return;
    }

    // ========================================================
    // UNLOCK
    // ========================================================

    if (
        lower === "unlock"
    ) {

        global.gcNameLockState.delete(
            threadID
        );

        selfReact(
            api,
            threadID,
            messageID
        );

        await sendMessageSafe(
            api,
            "GC NAME LOCK: OFF",
            threadID
        );

        return;
    }

    // ========================================================
    // SET ALL NICKNAME
    // ========================================================

    if (
        lower.startsWith("set ")
    ) {

        const nickname =
            input
                .substring(4)
                .trim();

        if (!nickname)
            return;

        selfReact(
            api,
            threadID,
            messageID
        );

        await sendMessageSafe(
            api,
            `Setting nickname: ${nickname}`,
            threadID
        );

        const result =
            await setAllNicknames(
                api,
                threadID,
                nickname
            );

        if (!result.success) {

            await sendMessageSafe(
                api,
                "Hindi makuha ang members ng GC.",
                threadID
            );

            return;
        }

        await sendMessageSafe(
            api,
            `SET NICKNAME DONE\n` +
            `Nickname: ${nickname}\n` +
            `Members: ${result.total}\n` +
            `Changed: ${result.changed}`,
            threadID
        );

        return;
    }
};

// ============================================================
// EVENT ENGINE
// ============================================================

module.exports.handleEvent = async function ({
    api,
    event
}) {

    const {
        threadID,
        senderID,
        body,
        messageID
    } = event;

    const botID =
        api.getCurrentUserID();

    if (!senderID)
        return;

    if (
        senderID === botID
    )
        return;

    if (!body)
        return;

    const text =
        body.trim();

    const lower =
        text.toLowerCase();

    // ========================================================
    // GC NAME LOCK
    // ========================================================

    const lock =
        global.gcNameLockState.get(
            threadID
        );

    if (
        lock &&
        lock.locked
    ) {

        const info =
            await getThreadInfoSafe(
                api,
                threadID
            );

        if (
            info &&
            info.threadName &&
            info.threadName !== lock.name
        ) {

            await setGCTitleSafe(
                api,
                lock.name,
                threadID
            );
        }
    }

    // ========================================================
    // ADMIN
    // ========================================================

    if (
        senderID === ADMIN_ID
    ) {

        if (
            lower === "start" ||
            lower === "on" ||
            lower === "stop" ||
            lower === "off" ||
            lower === "count" ||
            lower === "count off" ||
            lower === "status" ||
            lower === "unlock" ||
            lower.startsWith("lock ") ||
            lower.startsWith("set ")
        ) {

            selfReact(
                api,
                threadID,
                messageID
            );

        }

        return;
    }

    // ========================================================
    // COMMAND-LIKE MESSAGES
    // ========================================================

    if (
        lower === "start" ||
        lower === "stop" ||
        lower === "on" ||
        lower === "off" ||
        lower === "count" ||
        lower === "count off" ||
        lower === "status" ||
        lower === "unlock" ||
        lower.startsWith("lock ") ||
        lower.startsWith("set ")
    ) {

        return;
    }

    // ========================================================
    // HUNTING CHECK
    // ========================================================

    if (
        global.huntingState.get(
            threadID
        ) !== true
    ) {
        return;
    }

    // ========================================================
    // PER USER KEY
    // ========================================================

    const userKey =
        `${threadID}_${senderID}`;

    const now =
        Date.now();

    // ========================================================
    // STATS
    // ========================================================

    let stats =
        global.huntingStats.get(
            threadID
        );

    if (!stats) {

        stats = {
            replies: 0,
            blocked: 0
        };

        global.huntingStats.set(
            threadID,
            stats
        );
    }

    // ========================================================
    // DUPLICATE SUPPRESSION
    // ========================================================

    const duplicateKey =
        `${threadID}_${senderID}_${lower}`;

    const lastDuplicate =
        global.huntingDuplicateState.get(
            duplicateKey
        );

    if (
        lastDuplicate &&
        now - lastDuplicate <
        DUPLICATE_WINDOW
    ) {

        stats.blocked++;

        return;
    }

    global.huntingDuplicateState.set(
        duplicateKey,
        now
    );

    // ========================================================
    // HARD 10 SECOND LOCK
    // ========================================================

    const state =
        global.huntingReplyState.get(
            userKey
        );

    if (state) {

        const elapsed =
            now - state.lastReply;

        if (
            elapsed <
            REPLY_INTERVAL
        ) {

            stats.blocked++;

            return;
        }
    }

    // ========================================================
    // ACTIVE SEND LOCK
    // ========================================================

    if (
        global.activeSendingState.get(
            userKey
        )
    ) {

        stats.blocked++;

        return;
    }

    // ========================================================
    // LOCK
    // ========================================================

    global.activeSendingState.set(
        userKey,
        true
    );

    global.huntingReplyState.set(
        userKey,
        {
            lastReply: now
        }
    );

    // ========================================================
    // GENERATE REPLY
    // ========================================================

    const rawTaunt =
        getUniqueTaunt();

    const mimicked =
        humanMimicker(
            body,
            rawTaunt
        );

    const finalMessage =
        humanizeText(
            mimicked
        );

    // ========================================================
    // TYPING
    // ========================================================

    const typingDelay =
        Math.floor(
            Math.random() *
            (
                MAX_TYPING_DELAY -
                MIN_TYPING_DELAY
            )
        ) +
        MIN_TYPING_DELAY;

    setTimeout(() => {

        if (
            global.huntingState.get(
                threadID
            ) !== true
        ) {

            global.activeSendingState.set(
                userKey,
                false
            );

            return;
        }

        sendTyping(
            api,
            threadID
        );

    }, typingDelay);

    // ========================================================
    // EXACTLY ONE REPLY AFTER 10 SECONDS
    // ========================================================

    setTimeout(
        async () => {

            try {

                if (
                    global.huntingState.get(
                        threadID
                    ) !== true
                ) {
                    return;
                }

                const sent =
                    await sendMessageSafe(
                        api,
                        finalMessage,
                        threadID
                    );

                if (sent) {
                    stats.replies++;
                }

            } catch (err) {

                console.error(
                    "[HUNTING]",
                    err
                );

            } finally {

                global.activeSendingState.set(
                    userKey,
                    false
                );

            }

        },
        REPLY_INTERVAL
    );
};

// ============================================================
// CLEANUP
// ============================================================

setInterval(() => {

    const now =
        Date.now();

    for (
        const [
            key,
            timestamp
        ]
        of global.huntingDuplicateState
    ) {

        if (
            now - timestamp >
            30000
        ) {

            global.huntingDuplicateState.delete(
                key
            );
        }
    }

    for (
        const [
            key,
            state
        ]
        of global.huntingReplyState
    ) {

        if (
            state &&
            now - state.lastReply >
            60000
        ) {

            global.huntingReplyState.delete(
                key
            );
        }
    }

}, 30000);
