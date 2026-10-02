const fs = require("fs-extra");

module.exports.config = {
    name: "hunting",
    version: "5.2.0",
    hasPermission: 2, // Admin only
    credits: "User",
    description: "Admin-Only Persistent Hunting with Strict Turn-Taking Rotation, Typing Indicator, and Mimicker",
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
if (!global.spamCooldownState) global.spamCooldownState = new Map();
if (!global.lastSenderState) global.lastSenderState = new Map(); // Dito natin ita-track kung sino ang huling nag-chat per thread

let usedTaunts = [];

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

// 100+ na nakakaasar na banat at pang-aasar
const massiveTaunts = [
    "wag ka mawawala lods 🥷🔥 dami mong sinasabi papansin ka lang 🗣️🤡",
    "ops nawala ako bigla 🤡🤣 sunod sunod ah galit na galit yarn? 🤬🔥",
    "nawala ata ako san ka napunta 💩 hinay hinay lang lods baka mapagod ka 🐢💨",
    "bawal waterbreak at pahinga dito 🩸⚔️ spammer yarn? pondo muna lods 📦🤣",
    "moka ka tabo bro hahaha 🤪🪠 iyak na yarn haha sige pa 😭🩸",
    "san ka na pupunta haha takbo pa 🏃‍♂💨 hinga muna baka mahimatay ka 😮‍‍💨💀",
    "hanggang madaling araw to boy wag ka susuko 🥷🩸 bagsak ka nanaman boy aral ka muna 📚📉",
    "tulog ka na ba agad mahina ka pala 😴💤 tuloy mo lang yan hanggang bukas 🗓️🥷",
    "galaw galaw baka pumanaw ka diyan 💀⚰️ mabilis mag-type pero walang laman 🗑️🤷‍♂️",
    "bawal magpahinga dito laban lang 🥊🔥 paulit-ulit na lang sinasabi mo 🔁🤦‍♂️",
    "isa pa nga diyan bawi ka dali 🎯 walang epekto yang ginagawa mo 🧊⚡",
    "umiyak ka na lang sa gilid bro 🥺😂 pumipiyok ka na ata sa chat 🐥🔊",
    "palag ka pa ba o tameme ka na? 🤫🥷 ubos na ba linyahan mo? tulungan kita 📖🤡",
    "parang di mo man lang kinaya ah 📉🤪 puro tapang sa chat pero duwag sa personal 🤫🏃‍♂️",
    "pasok sa banga ka nanaman boy 🗑️💥 kumusta na palad mo? kalyo overload na yan ✋🛑",
    "ipahinga mo na yang kamay mo nanginginig na 🤏🤣 hina naman ng palag mo, pambata eh 👶🍼",
    "ngawit ka na ba mag-type? 🦾🤖 dahan-dahan baka mapunit keyboard mo sa galit ⌨️💥",
    "wala ka palang maipakita eh 📉👎 antok ka na noh? amoy laway ka na screen mo 🥱📱",
    "asan na yung tapang mo kanina? 👻⚡ himbing ng tulog ng pangarap mo bagsak agad 📉💤",
    "kala ko ba palag ka bat parang nag-agaw buhay ka na? 🧟‍♂️🩸 san banda yungangas mo? di ko makita e 🕵️‍♂️🔍",
    "hinga ka muna malalim baka atakihin ka 🫁💨 huli ka balbon, gising pa ang master 🥷👀",
    "lutang ka na ata sa puyat boss 😵‍💫🌌 sige piga pa ng bungo baka lumabas utak mo 🧠💥",
    "yan na ba pinakamabilis mo mag-type? bagal ah 🐢⏱️ taob ka na naman sa pormahan ko 🚢🌊",
    "sumuko ka na lang para di ka na mahirapan 🏳️🥷 kumusta naman ang mga mata mo? pulang pula na ba? 👀🔥",
    "i-iyak mo na lang yan walang makakakita 🥲🌧 buhay ka pa ba o nag-aabang na ng ambulansya? 🚑💨",
    "tulog na yung kalaban antok na antok na 🥱🛌 lakas ng trip mo eh no, kaso sablay naman 🎯❌",
    "may tubig pa ba diyan? tagak ka na eh 💧🥵 chill ka lang boss baka mapunit mukha mo sa gigil 😬🎭",
    "parang computer icon lang lods, stock up ka na 🖥️🤡 pilit na pilit ang banat mo lods tigil mo na 🛑🤡",
    "nag-iisip ka pa ba ng ire-reply o umiiyak ka na? 🧠💥 wala ka bang ibang alam kundi yan lang? 🥱📉",
    "subukan mo ulit baka sakaling pumasa ka na 📝🔥 dahan-dahan baka mapunit keyboard mo sa galit ⌨️💥",
    "antok ka na noh? amoy laway ka na screen mo 🥱📱 puyat pa more para bagsak agad ulo mo sa mesa 🪑💤",
    "himbing ng tulog ng pangarap mo bagsak agad 📉💤 gising na gising ang diwa ko samantalang ikaw tulog na sa pansitan 🍜😴",
    "san banda yungangas mo? di ko makita e 🕵️‍♂️🔍 puro ka angas wala namang binatbat 🦆💨",
    "huli ka balbon, gising pa ang master 🥷👀 huli sa akto na nagpapanic ka na 🧯🏃‍♂️",
    "sige piga pa ng bungo baka lumabas utak mo 🧠💥 wala na ngang laman pinipilit pa 🕳️🤡",
    "taob ka na naman sa pormahan ko 🚢🌊 lumubog agad ang barko mo sa unang banat palang ⚓📉",
    "kumusta naman ang mga mata mo? pulang pula na ba? 👀🔥 pikit ka na kasi kung di mo na kaya 🙈💤",
    "buhay ka pa ba o nag-aabang na ng ambulansya? 🚑💨 hatid ko na ba kayo sa pinakamalapit na hospital? 🏥🛏️",
    "lakas ng trip mo eh no, kaso sablay naman 🎯❌ sablay na naman ang tira praning ka na 🤪🌪️",
    "chill ka lang boss baka mapunit mukha mo sa gigil 😬🎭 namumula na tenga mo sa sobrang inis eh 🍅🔥",
    "hina naman ng palag mo, pambata eh 👶🍼 balik ka na muna sa gatas mo bago ka makipag-chat 🍼🍼",
    "dahan-dahan baka mapunit keyboard mo sa galit ⌨️💥 basag na naman tempered glass mo no? 📱💔",
    "paulit-ulit na lang sinasabi mo 🔁🤦‍♂️ naubusan ka na ba ng vocabulary kaya yan na lang ulit? 📖❌",
    "walang epekto yang ginagawa mo 🧊⚡ parang hangin lang na dumaan sa harap ko 🌬️🍃",
    "pumipiyok ka na ata sa chat 🐥🔊 uminom ka muna ng malamig na tubig para lumamig boses mo 🥤🧊",
    "ubos na ba linyahan mo? tulungan kita 📖🤡 magbasa ka muna ng libro para may maiambag ka 📚🧐",
    "puro tapang sa chat pero duwag sa personal 🤫🏃‍♂️ tago kaagad sa ilalim ng kama pag may kumatok 🛏️👻",
    "kumusta na palad mo? kalyo overload na yan ✋🛑 piga-piga din ng daliri paminsan-minsan 🦾🤖",
    "pilit na pilit ang banat mo lods tigil mo na 🛑🤡 nakakahiya na po sa angkan niyo wag na ipilit 🙈📉",
    "wala ka bang ibang alam kundi yan lang? 🥱📉 paulit-ulit na plaka sirang-sira na 💿💥",
    "sabog na naman ang puyat mo no? 🌌😵‍💫 halata sa mata mo na lutang na lutang ka na 🛸👽",
    "huli ka sa balita matagal na kaming tapos ikaw nag-uumpisa pa lang 🕰️🏃‍♂️",
    "ano na? hinto ka na kasi napapagod na ako sa kabagalan mo 🐢💤",
    "puro ka reklamo wala ka namang maibuga 🗣️💨 sabaw na sabaw ka na boss 🍲🤪",
    "iyak semento ka na naman mamaya paggising mo 🛣️😭",
    "wala ka talagang pag-asa umangat sa kaalaman 📉🧠",
    "lipad ka na lang ibon para makatakas ka dito 🐦💨",
    "kala ko matibay ka, manipis lang pala parang tissue 🧻💥",
    "tiklop ka na agad wala pang limang minuto ⏱️🏳️",
    "sarap mong asarin kasi madali kang mapikon 🤬🎯",
    "iyak ka na sa madilim na sulok habang pinapanood kita 🌑👀"
];

function getUniqueTaunt() {
    if (usedTaunts.length >= massiveTaunts.length) usedTaunts = [];
    let available = massiveTaunts.filter(item => !usedTaunts.includes(item));
    let chosen = available[Math.floor(Math.random() * available.length)];
    usedTaunts.push(chosen);
    return chosen;
}

function humanMimicker(targetBody, text) {
    if (!targetBody) return text;
    if (targetBody.length <= 10) {
        return text.split(' ')[0] + " " + (text.split(' ')[1] || "");
    }
    return text;
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

// Handlers para sa Prefix/Command Execution (Admin Only)
module.exports.run = async function ({ api, event, args }) {
    const { threadID, senderID, messageID } = event;
    
    if (senderID !== ADMIN_ID) return;

    const option = args[0] ? args[0].toLowerCase() : "";

    if (option === "start" || option === "on") {
        global.huntingState.set(threadID, true);
        if (typeof api.setMessageReaction === "function") {
            api.setMessageReaction("🥷", messageID, (err) => {}, true);
        }
        return;
    } else if (option === "off") {
        global.huntingState.set(threadID, false);
        if (typeof api.setMessageReaction === "function") {
            api.setMessageReaction("🥷", messageID, (err) => {}, true);
        }
        return;
    }
};

// Event Handler para sa Auto-Reply, Strict Turn-Taking Rotation at Anti-Spam
module.exports.handleEvent = async function ({ api, event }) {
    const { threadID, senderID, body, mentions, messageID } = event;
    const botID = api.getCurrentUserID();

    if (!senderID) return;

    // KUNG ANG BOT ANG NAG-CHAT: I-update natin na ang bot ang huli munang nagsalita
    if (senderID === botID) {
        global.lastSenderState.set(threadID, "BOT");
        return;
    }

    const text = body ? body.trim().toLowerCase() : "";
    const isHuntingActive = global.huntingState.get(threadID) === true;

    if (!body) return;

    // KUNG ANG ADMIN ANG NAG-CHAT (Commands)
    if (senderID === ADMIN_ID) {
        if (text === "." || text === ".start" || text === "start" || text === ".off" || text === "off" || text.startsWith("/count")) {
            if (typeof api.setMessageReaction === "function") {
                api.setMessageReaction("🥷", messageID, (err) => {}, true);
            }
        }

        if (text === ".start" || text === "start") {
            global.huntingState.set(threadID, true);
            global.lastSenderState.set(threadID, "USER"); // Reset turn tracker
            return;
        }

        if (text === ".off" || text === "off") {
            global.huntingState.set(threadID, false);
            return;
        }

        if (text.startsWith("/count")) {
            if (text === "/count on" || text.startsWith("/count on")) {
                if (global.countEngineState.get(threadID)) return;
                
                let mentionText = "";
                if (mentions && Object.keys(mentions).length > 0) {
                    const targetID = Object.keys(mentions)[0];
                    mentionText = `@${mentions[targetID]}`;
                }

                startCounting(api, event, mentionText);
                return;
            }

            if (text === "/count off") {
                global.countEngineState.set(threadID, false);
                return;
            }
        }

        return; 
    }

    // KUNG HINDI ADMIN (IBANG USER / KALABAN NA ANG NAG-CHAT)
    if (!isHuntingActive) return;
    if (text.startsWith("/count")) return;

    // --- STRICT TURN-TAKING ROTATION CHECKER ---
    // Kung ang huling nag-chat sa thread ay ang BOT pa rin, HUWAG mag-reply hangga't hindi pa sumasagot ang kalaban.
    const lastSender = global.lastSenderState.get(threadID);
    if (lastSender === "BOT") {
        return; 
    }
    // -------------------------------------------

    // --- ANTI-SPAM COOLDOWN LOGIC (5 Seconds per user) ---
    const userKey = `${threadID}_${senderID}`;
    const now = Date.now();
    const cooldownTime = 5000; 

    if (!global.spamCooldownState) global.spamCooldownState = new Map();
    const lastTime = global.spamCooldownState.get(userKey) || 0;

    if (now - lastTime < cooldownTime) {
        return; 
    }

    global.spamCooldownState.set(userKey, now);
    // -----------------------------------------------------

    // Markahan agad na USER ang huli para mapigilan ang sunod-sunod na bot chat habang nag-aabang
    global.lastSenderState.set(threadID, "USER");

    // 1. Facebook Typing Indicator
    try {
        if (typeof api.sendTypingIndicator === "function") {
            api.sendTypingIndicator(threadID, (err) => {});
        }
    } catch (e) {}

    let rawTaunt = getUniqueTaunt();
    let mimickedText = humanMimicker(body, rawTaunt);
    const finalMessage = humanizeText(mimickedText);
    
    // Natural human delay habang nakikita nilang nag-ti-type ang bot
    const delay = Math.floor(Math.random() * 1200) + 1000;

    setTimeout(() => {
        if (global.huntingState.get(threadID) === true) {
            api.sendMessage(finalMessage, threadID, () => {
                // Pagka-send ng bot, i-set sa BOT para hintayin muna mag-chat ang kalaban bago sumagot ulit
                global.lastSenderState.set(threadID, "BOT");
            });
        }
    }, delay);
};
