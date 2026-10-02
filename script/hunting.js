const fs = require("fs-extra");

module.exports.config = {
    name: "hunting",
    version: "4.2.0",
    hasPermission: 2, // Admin only
    credits: "User",
    description: "Admin-Only Hunting Autoreply and VOIDLESS4LGNG Count Engine",
    usePrefix: false,
    commandCategory: "system",
    usages: ".start | .off | /count on | /count off",
    cooldowns: 0
};

// Ilagay dito ang Authorized Admin ID mo
const ADMIN_ID = "61594616562680";

// Global Storage Setup
if (!global.huntingState) global.huntingState = new Map();
if (!global.countEngineState) global.countEngineState = new Map();

let usedReplies = [];
let usedSuffixes = [];

function humanizeText(text) {
    const replacements = {
        'a': ['a', 'à', 'ā', 'ą', 'ä', 'â', 'á', 'å'],
        'e': ['e', 'ē', 'ê', 'ë', 'è', 'é'],
        'i': ['i', 'ī', 'î', 'ï', 'í', 'ì'],
        'o': ['o', 'ō', 'ó', 'ö', 'ô', 'ò'],
        'u': ['u', 'ū', 'û', 'ü', 'ú', 'ù']
    };

    return text.split('').map(char => {
        const lower = char.toLowerCase();
        if (replacements[lower] && Math.random() < 0.3) {
            const sub = replacements[lower][Math.floor(Math.random() * replacements[lower].length)];
            return char === char.toUpperCase() ? sub.toUpperCase() : sub;
        }
        return char;
    }).join('');
}

const baseReplies = [
    "wag ka mawawala lods 🥷🔥",
    "ops nawala ako bigla 🤡🤣",
    "nawala ata ako san ka napunta 💩",
    "bawal waterbreak at pahinga dito 🩸⚔️",
    "moka ka tabo bro hahaha 🤪🪠",
    "san ka na pupunta haha takbo pa 🏃‍♂️️💨",
    "hanggang madaling araw to boy wag ka susuko 🥷🩸",
    "tulog ka na ba agad mahina ka pala 😴💤",
    "galaw galaw baka pumanaw ka diyan 💀⚰️",
    "bawal magpahinga dito laban lang 🥊🔥",
    "isa pa nga diyan bawi ka dali 🎯",
    "umiyak ka na lang sa gilid bro 🥺😂",
    "palag ka pa ba o tameme ka na? 🤫🥷",
    "parang di mo man lang kinaya ah 📉🤪",
    "pasok sa banga ka nanaman boy 🗑️💥",
    "ipahinga mo na yang kamay mo nanginginig na 🤏🤣",
    "ngawit ka na ba mag-type? 🦾🤖",
    "wala ka palang maipakita eh 📉👎",
    "asan na yung tapang mo kanina? 👻⚡",
    "kala ko ba palag ka bat parang nag-aagaw buhay ka na? 🧟‍♂️🩸",
    "hinga ka muna malalim baka atakihin ka 🫁💨",
    "lutang ka na ata sa puyat boss 😵‍💫🌌",
    "yan na ba pinakamabilis mo mag-type? bagal ah 🐢⏱️",
    "sumuko ka na lang para di ka na mahirapan 🏳️🥷",
    "i-iyak mo na lang yan walang makakakita 🥲🌧",
    "tulog na yung kalaban antok na antok na 🥱🛌",
    "may tubig pa ba diyan? tagak ka na eh 💧🥵",
    "parang computer icon lang lods, stock up ka na 🖥️🤡",
    "nag-iisip ka pa ba ng ire-reply o umiiyak ka na? 🧠💥",
    "subukan mo ulit baka sakaling pumasa ka na 📝🔥"
];

const baseSuffixes = [
    "dami mong sinasabi papansin ka lang 🗣️🤡",
    "sunod sunod ah galit na galit yarn? 🤬🔥",
    "hinay hinay lang lods baka mapagod ka 🐢💨",
    "spammer yarn? pondo muna lods 📦🤣",
    "iyak na yarn haha sige pa 😭🩸",
    "hinga muna baka mahimatay ka 😮‍‍💨💀",
    "bagsak ka nanaman boy aral ka muna 📚📉",
    "tuloy mo lang yan hanggang bukas 🗓️🥷",
    "mabilis mag-type pero walang laman 🗑️🤷‍♂️",
    "paulit-ulit na lang sinasabi mo 🔁🤦‍♂️",
    "walang epekto yang ginagawa mo 🧊⚡",
    "pumipiyok ka na ata sa chat 🐥🔊",
    "ubos na ba linyahan mo? tulungan kita 📖🤡"
];

function UniqueReply() {
    if (usedReplies.length >= baseReplies.length) usedReplies = [];
    let available = baseReplies.filter(item => !usedReplies.includes(item));
    let chosen = available[Math.floor(Math.random() * available.length)];
    usedReplies.push(chosen);
    return chosen;
}

function UniqueSuffix() {
    if (usedSuffixes.length >= baseSuffixes.length) usedSuffixes = [];
    let available = baseSuffixes.filter(item => !usedSuffixes.includes(item));
    let chosen = available[Math.floor(Math.random() * available.length)];
    usedSuffixes.push(chosen);
    return chosen;
}

async function startCounting(api, event, mentionText = "") {
    let count = 1;
    const maxCount = 50;
    const threadID = event.threadID;
    global.countEngineState.set(threadID, true);

    const startTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    while (global.countEngineState.get(threadID) === true && count <= maxCount) {
        api.sendMessage(`${count}`, threadID);
        
        if (count === maxCount) {
            global.countEngineState.set(threadID, false);

            const endTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            const resiboMessage = 
                `🧾 🥷🩸 VOIDLESS4LGNG OFFICIAL RESIBO 🩸🥷 🧾\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `🎯 TARGET: ${mentionText ? mentionText : "EVERYONE"}\n` +
                `📊 TOTAL COUNT: ${maxCount} / ${maxCount}\n` +
                `⏰ START TIME: ${startTime}\n` +
                `⏱ FINISH TIME: ${endTime}\n` +
                `STATUS: COMPLETED & VICTORY! 🏆💥\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `🔥 VOIDLESS4LGNG COUNT ENGINE FINISHED 🔥`;

            await new Promise(resolve => setTimeout(resolve, 500));
            return api.sendMessage(resiboMessage, threadID);
        }

        count++;
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

// Handlers para sa Prefix/Command Execution
module.exports.run = async function ({ api, event, args }) {
    const { threadID, senderID } = event;
    
    // Admin check
    if (senderID !== ADMIN_ID) {
        return api.sendMessage("❌ Ikaw ay hindi awtorisadong gumamit ng command na ito (Admin Only).", threadID);
    }

    const option = args[0] ? args[0].toLowerCase() : "";

    if (option === "start" || option === "on") {
        global.huntingState.set(threadID, true);
        return api.sendMessage("🔥 Hunting Autoreply mode activated! 🥷🩸", threadID);
    } else if (option === "off") {
        global.huntingState.set(threadID, false);
        return api.sendMessage("💤 Hunting Autoreply mode deactivated.", threadID);
    } else {
        return api.sendMessage(
            "🥷🩸 VOIDLESS4LGNG COUNT ENGINE 🩸🥷\n\n" +
            "• .start / .off\n" +
            "• /count on\n" +
            "• /count on @mention\n" +
            "• /count off",
            threadID
        );
    }
};

// Event Handler para sa Auto-Reply at Reactions
module.exports.handleEvent = async function ({ api, event }) {
    const { threadID, senderID, body, mentions } = event;

    if (!body || !senderID || senderID === api.getCurrentUserID()) return;

    const text = body.trim().toLowerCase();

    // 1. Ninja Reaction sa Tuldok (.)
    if (text === ".") {
        if (typeof api.setMessageReaction === "function") {
            api.setMessageReaction("🥷", event.messageID, (err) => {}, true);
        }
        return;
    }

    // 2. Direct Control Commands (Admin Restricted)
    if (text === ".start" || text === "start") {
        if (senderID !== ADMIN_ID) return; // Ignore kung hindi admin
        global.huntingState.set(threadID, true);
        return api.sendMessage("🔥 Hunting Autoreply mode activated! 🥷🩸", threadID);
    }

    if (text === ".off" || text === "off") {
        if (senderID !== ADMIN_ID) return; // Ignore kung hindi admin
        global.huntingState.set(threadID, false);
        return api.sendMessage("💤 Hunting Autoreply mode deactivated.", threadID);
    }

    // 3. Count Engine Commands (Admin Restricted)
    if (text.startsWith("/count")) {
        if (senderID !== ADMIN_ID) return; // Ignore kung hindi admin

        if (text === "/count naba ako" || text === "/count") {
            return api.sendMessage(
                "🥷🩸 VOIDLESS4LGNG COUNT ENGINE 🩸🥷\n\n" +
                "• .start / .off\n" +
                "• /count on\n" +
                "• /count on @mention\n" +
                "• /count off",
                threadID
            );
        }

        if (text.startsWith("/count on")) {
            if (global.countEngineState.get(threadID)) {
                return api.sendMessage("⚠️ Naka-ON na ang Count Engine! 🥷", threadID);
            }
            
            let mentionText = "";
            if (mentions && Object.keys(mentions).length > 0) {
                const targetID = Object.keys(mentions)[0];
                mentionText = `@${mentions[targetID]}`;
            }

            api.sendMessage(`🥷🩸 VOIDLESS4LGNG COUNT ENGINE ACTIVATED ${mentionText} 🩸🥷\n🎯 Target: Up to 50 Count!`, threadID);
            startCounting(api, event, mentionText);
            return;
        }

        if (text === "/count off") {
            global.countEngineState.set(threadID, false);
            return api.sendMessage("🛑 VOIDLESS4LGNG COUNT ENGINE DEACTIVATED.", threadID);
        }
    }

    // 4. Auto-Reply Execution (Tatamaan ang lahat ng chat ng iba maliban sa bot at admin kung kinakailangan)
    const isHuntingActive = global.huntingState.get(threadID);
    if (!isHuntingActive) return;

    if (text.startsWith("/count")) return;

    try {
        if (typeof api.sendTypingIndicator === "function") {
            api.sendTypingIndicator(threadID);
        }
    } catch (e) {}

    let selectedLine = UniqueReply();

    if (body.length < 5 || body.includes("!") || body.length > 30) {
        const extraSuffix = UniqueSuffix();
        selectedLine += " " + extraSuffix;
    }

    const humanizedMessage = humanizeText(selectedLine);
    const delay = Math.floor(Math.random() * 800) + 700;

    setTimeout(() => {
        if (global.huntingState.get(threadID)) {
            api.sendMessage(humanizedMessage, threadID);
        }
    }, delay);
};
