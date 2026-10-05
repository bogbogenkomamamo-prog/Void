"use strict";

const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "halimaw",
  version: "37.0.0",
  role: 0,
  hasPrefix: false,
  aliases: ["halimaw", "mimic", "tropa"],
  description: "Pure Asar / Dry Bardagulan Reply System",
  usage: "Send / to toggle ON/OFF",
  credits: "sinzu",
  cooldown: 1
};

// =====================================================
// ADMIN IDS
// =====================================================

const ADMIN_IDS = [
  "61594951192638",
  "61594616562680",
  "61594370023022"
];

// =====================================================
// CONFIG PATH & SETTINGS
// =====================================================

const DATA_PATH = path.join(__dirname, "halimaw_config.json");

// Gawing TRUE kung gusto mong automatic na gumana agad sa lahat ng GC 
// nang hindi na kailangang mag-type ng slash (/) para i-ON.
const FORCE_AUTO_ON = true; 

const MIN_REPLY_DELAY = 5000;  // Pinarang mabilis-bilis konti (5 secs)
const MAX_REPLY_DELAY = 12000; // 12 secs max

const THREAD_COOLDOWN = 8000;  // 8 secs cooldown per thread
const CHANCE_TO_REPLY = 0.85;  // 85% chance na sumagot
const RECENT_REPLY_LIMIT = 250;

// =====================================================
// RUNTIME MAPS
// =====================================================

const recentReplies = new Map();
const threadCooldowns = new Map();
const pendingReplies = new Map();

// =====================================================
// WORD POOLS
// =====================================================

const STARTERS = [
  "ano ba", "bakit ba", "grabe ka", "seryoso ka", "teka nga", "sandali", "wait", "luh", "weh", "uy", "ay", "eh", "ah", "hmm", "hmmm", "okay ka lang", "sige ka", "ge ka", "oo na", "hindi nga", "ewan sayo", "parang", "medyo", "actually", "honestly", "totoo ba", "sure ka", "malamang", "siguro", "baka", "possible", "gets mo ba", "wait lang", "teka lang", "ayos ka lang", "eto na naman", "ayan na naman", "ikaw talaga", "grabe naman", "wala na", "tama na", "okay na", "sige na", "bahala ka", "ikaw bahala", "go lang", "tuloy mo", "push mo", "continue", "next", "later", "mamaya", "bukas na", "pass muna", "skip muna", "iba naman", "change topic", "ulit na naman", "paulit ulit", "ganyan ka talaga"
];

const MIDDLES = [
  "ano ba yan", "ano naman yan", "ano yan", "ano na naman", "ano pa ba", "ano raw", "ano daw", "bakit naman", "bakit ganyan", "bakit ganon", "bakit kasi", "bakit ngayon", "bakit ikaw", "bakit ako", "bakit pa", "paano yan", "paano ba yan", "paano naman", "paano nangyari", "saan galing yan", "saan mo nakuha yan", "sino nagsabi sayo", "sino nagturo sayo", "kailan pa yan", "anong point", "anong connect", "anong trip", "anong ganap", "anong problema", "anong nangyari", "anong gusto mo", "may point ba yan", "may sense ba yan", "may resibo ba", "may proof ba", "parang wala", "parang pilit", "parang sablay", "parang mali", "parang kulang", "parang gasgas"
];

const ENDINGS = [
  "sayo", "sa sinabi mo", "sa chat mo", "sa ginagawa mo", "sa trip mo", "sa logic mo", "sa point mo", "sa argumento mo", "sa kwento mo", "sa explanation mo", "sa dahilan mo", "sa sagot mo", "sa reply mo", "sa banat mo", "sa style mo", "sa approach mo", "sa plano mo", "sa desisyon mo", "sa confidence mo", "sa yabang mo", "sa timing mo", "dito", "dyan", "diyan", "ngayon", "mamaya", "later", "kanina", "palagi", "nanaman", "ulit", "pa", "naman", "nga", "eh", "lang", "kasi", "talaga", "siguro", "yata", "daw", "raw"
];

const ASAR = [
  "pinilit mo pa", "nag effort ka pa", "sayang effort", "sayang typing", "sayang oras", "medyo pilit", "pilit na pilit", "sobrang pilit", "halatang pilit", "di umubra", "di gumana", "di tumama", "try again", "try mo ulit", "isa pa", "ulit ka", "baka sakali", "malabo yan", "mahina pa", "mahina talaga", "kulang pa", "bitin", "sablay", "sablay nanaman", "palpak nanaman", "naligaw ka", "huli ka", "nahuli kita", "halata naman", "obvious naman", "kitang kita", "alam na namin", "wag ka magpanggap", "wag ka mag deny", "aminin mo na", "aminin na kasi", "palusot pa", "excuse nanaman", "same script", "same banat", "same style", "paulit ulit", "ikot ka nang ikot", "paligoy ligoy", "diretso na kasi", "wala sa hulog", "wala sa lugar", "wala sa point", "walang connect", "di mo alam sinasabi mo", "minadali mo yata", "lutang nanaman", "sabaw nanaman", "lecture nanaman", "teacher mode", "professor mode", "expert mode", "debater yarn", "chat warrior nanaman", "typing warrior", "sa chat lang malakas", "yabang na walang laman", "may sariling mundo", "may sariling logic"
];

const NATURAL = [
  "di ko gets", "di ko talaga gets", "di ko pa rin gets", "di ko alam sayo", "wala akong maintindihan", "wala akong masabi", "ano pa sasabihin ko", "explain mo nga", "explain mo ulit", "paki explain", "ulit nga", "sabihin mo nga", "ano sinabi mo", "bakit ganon", "ano ba talaga", "wala ka bang bago", "same old", "nothing new", "walang bago", "ganyan ka talaga", "di ka nagbabago", "di ka talaga titigil", "wala kang preno", "ang ingay mo", "daldal mo", "dami mong sinasabi", "ang sipag mo magtype", "tahimik ka muna", "hinga ka muna", "pahinga ka muna", "matulog ka na", "wag ka magpuyat", "di ka ba napapagod", "dami mong time", "observer na lang"
];

const SHORT = [
  "k", "ok", "okay", "ge", "sige", "ha", "weh", "luh", "sus", "ewan", "pfft", "hmm", "hmmm", "yawn", "cringe", "weak", "trash", "corny", "gasgas", "panis", "tuyo", "sabaw", "lutang", "palpak", "sablay", "boring", "basic", "pilit", "mahina", "kulang", "bitin", "malabo", "random", "daldal", "ingay", "essay", "thesis", "drama", "excuse", "palusot", "ulit", "next", "pass", "skip", "stop", "tama na", "enough", "kalma", "relax", "chill", "tigil"
];

// =====================================================
// BUILD REPLY POOL
// =====================================================

const REPLIES = new Set([
  ...STARTERS,
  ...MIDDLES,
  ...ENDINGS,
  ...ASAR,
  ...NATURAL,
  ...SHORT
]);

STARTERS.forEach(s => {
  MIDDLES.forEach(m => {
    REPLIES.add(`${s} ${m}`);
  });
});

ASAR.forEach(a => {
  ENDINGS.forEach(e => {
    REPLIES.add(`${a} ${e}`);
  });
});

NATURAL.forEach((n, i) => {
  ENDINGS.forEach((e, j) => {
    if ((i + j) % 3 === 0) REPLIES.add(`${n} ${e}`);
  });
});

const ALL_REPLIES = Array.from(REPLIES);

// =====================================================
// CONFIG FUNCTIONS
// =====================================================

function loadConfig() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
      if (!Array.isArray(data.activeThreads)) data.activeThreads = [];
      return data;
    }
  } catch (error) {
    console.error("[HALIMAW] Config load error:", error.message);
  }
  return { activeThreads: [] };
}

function saveConfig(data) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("[HALIMAW] Config save error:", error.message);
  }
}

function isAdmin(senderID) {
  return ADMIN_IDS.includes(String(senderID));
}

function getRandomReply(threadID) {
  const id = String(threadID);
  let previous = recentReplies.get(id) || [];
  let available = ALL_REPLIES.filter(reply => !previous.includes(reply));

  if (available.length === 0) {
    previous = [];
    available = ALL_REPLIES.slice();
  }

  const reply = available[Math.floor(Math.random() * available.length)];
  previous.push(reply);

  if (previous.length > RECENT_REPLY_LIMIT) {
    previous.shift();
  }

  recentReplies.set(id, previous);
  return reply;
}

// =====================================================
// HELPERS (TYPING & REACTIONS)
// =====================================================

function startTyping(api, threadID) {
  try {
    if (typeof api.sendTypingIndicator === "function") {
      api.sendTypingIndicator(threadID, true);
    }
  } catch (e) {}

  return setInterval(() => {
    try {
      if (typeof api.sendTypingIndicator === "function") {
        api.sendTypingIndicator(threadID, true);
      }
    } catch (e) {}
  }, 4000);
}

function stopTyping(api, threadID, interval) {
  clearInterval(interval);
  try {
    if (typeof api.sendTypingIndicator === "function") {
      api.sendTypingIndicator(threadID, false);
    }
  } catch (e) {}
}

function react(api, messageID) {
  try {
    if (typeof api.setMessageReaction === "function") {
      api.setMessageReaction("❤", messageID, () => {}, true);
    }
  } catch (e) {}
}

async function toggleThread({ api, event, config }) {
  const { threadID, senderID, messageID } = event;
  if (!isAdmin(senderID)) return;

  const id = String(threadID);
  const index = config.activeThreads.indexOf(id);

  if (index === -1) {
    config.activeThreads.push(id);
    saveConfig(config);
    react(api, messageID);
    console.log(`[HALIMAW] MANUAL ON: ${id}`);
    return;
  }

  config.activeThreads.splice(index, 1);
  saveConfig(config);
  react(api, messageID);
  console.log(`[HALIMAW] MANUAL OFF: ${id}`);
}

function sendReply({ api, threadID, messageID, reply }) {
  try {
    api.sendMessage({ body: reply }, threadID, () => {}, messageID);
    console.log(`[HALIMAW] Sumagot sa ${threadID}: "${reply}"`);
  } catch (error) {
    console.error("[HALIMAW] Send error:", error.message);
  }
}

// =====================================================
// MAIN EVENT HANDLER
// =====================================================

module.exports.handleEvent = async function ({ api, event }) {
  const { threadID, senderID, body, messageID } = event;
  if (!body) return;

  // Debug log para makita kung naririnig ng bot ang chat
  console.log(`[HALIMAW DEBUG] May nag-chat sa Thread ${threadID} (User: ${senderID}): ${body}`);

  let botID = null;
  try {
    botID = api.getCurrentUserID();
  } catch (e) {}

  if (botID && String(senderID) === String(botID)) return;

  const text = String(body).trim();
  const config = loadConfig();

  if (text === "/") {
    await toggleThread({ api, event, config });
    return;
  }

  if (/^\/+$/.test(text)) return;

  // Kung naka-FORCE_AUTO_ON ay hindi na hahanapin sa config, sasagot na agad.
  // Pero kung false, iche-check kung nakasali sa activeThreads.
  if (!FORCE_AUTO_ON && !config.activeThreads.includes(String(threadID))) {
    return;
  }

  if (Math.random() > CHANCE_TO_REPLY) return;

  const threadKey = String(threadID);
  const now = Date.now();
  const last = threadCooldowns.get(threadKey) || 0;

  if (now - last < THREAD_COOLDOWN) return;
  threadCooldowns.set(threadKey, now);

  if (pendingReplies.has(threadKey)) return;

  const reply = getRandomReply(threadID);
  const delay = Math.floor(Math.random() * (MAX_REPLY_DELAY - MIN_REPLY_DELAY + 1)) + MIN_REPLY_DELAY;

  const typing = startTyping(api, threadID);
  pendingReplies.set(threadKey, true);

  setTimeout(() => {
    pendingReplies.pending = false;
    pendingReplies.delete(threadKey);
    stopTyping(api, threadID, typing);
    sendReply({ api, threadID, messageID, reply });
  }, delay);
};

module.exports.run = async function () {
  return;
};

console.log(`[HALIMAW] Loaded ${ALL_REPLIES.length} pure-asar replies successfully (FORCE_AUTO_ON: ${FORCE_AUTO_ON}).`);
