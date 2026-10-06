"use strict";

const fs = require("fs");
const path = require("path");

// =====================================================
// HALIMAW v66.0.0 (SINGLE-FILE COMBINED GC & PM SYSTEM)
// =====================================================

module.exports.config = {
  name: "halimaw",
  version: "66.0.0",
  role: 0,
  hasPrefix: false,
  aliases: ["halimaw", "mimic", "tropa"],
  description: "Unified Single-File Asar Bot for GC & PM with Fast 6-9s Delay",
  usage: "Send / in GC to toggle, /troll [UID] to attack target in PM",
  credits: "sinzu",
  cooldown: 1
};

// =====================================================
// ADMIN SETTINGS
// =====================================================

const ADMIN_IDS = [
  "61595204307407"
];

// =====================================================
// STORAGE PATHS
// =====================================================

const DATA_PATH = path.join(__dirname, "halimaw_config.json");
const TROLL_DATA_PATH = path.join(__dirname, "halimaw_troll_targets.json");

// =====================================================
// TIMING & ASAR SETTINGS (6-9 SECONDS DELAY)
// =====================================================

const MIN_REPLY_DELAY = 6000;  // 6 seconds minimum
const MAX_REPLY_DELAY = 9000;  // 9 seconds maximum

const IDLE_LIMIT_MS = 20 * 60 * 1000;
const IDLE_COUNT_MAX = 40;
const IDLE_COUNT_DELAY = 3000;

const idleTimers = new Map();
const activeCounters = new Set();
const gcGlobalCooldowns = new Map();
const pmGlobalCooldowns = new Map();

// =====================================================
// GROUP CHAT (GC) ASAR POOL
// =====================================================

const STARTERS = [
  "sabi mo e", "weh", "luh", "talaga ba", "sige pilitin mo pa",
  "yan na yun", "parang tanga lang", "asan ang koneksyon", "ang layo naman",
  "sino may sabi", "sus", "patingin nga", "sino niloloko mo", "iyak ka na",
  "huli ka naman", "edi wow", "grabeng pagpilit yan", "pinilit mo na naman",
  "ayos ng palusot mo", "ano na namang pinagsasabi mo", "tigilan mo nga yan",
  "napaka-pilit naman neto", "wala ka bang ibang masabi", "paulit-ulit ka na naman"
];

const MIDDLES = [
  "pabida ka nanaman", "wala namang nagtanong", "hina ng comprehension mo",
  "mag-isip ka naman kahit konti", "dami mong alam",
  "pilit na pilit ang banat", "hanggang diyan na lang ba", "nagmamagaling ka nanaman",
  "sablay nanaman ang diskarte", "paulit-ulit ang script mo", "halatang pilit e",
  "ibang klase ka rin eh", "as usual, sablay", "panay ang angas wala namang laman",
  "puro ka na lang ganyan", "nag-isip ka ba bago mo sinabi yan", "parang ewan lang",
  "sumakit lang ulo ko sayo", "walang pumapansin pero pilit pa rin", "lakas ng trip mo ah"
];

const CONNECTORS = [
  "kasi", "kamo", "talaga", "naman", "pala", "nga", "eh", "ba", "sana", "tuloy",
  "lang", "daw", "raw", "naman e", "pala ha", "kasi naman", "talaga o", "naman oh"
];

const ENDINGS = [
  "no", "eh", "kasi", "talaga", "naman", "pala", "lang", "diba", "hays", "ulol"
];

const GENERATED_REPLIES = new Set([
  "Sino na naman nagturo sa iyong magsabi ng ganyan?",
  "Ang lalim ng iniisip mo ah, pero sablay pa rin.",
  "May pa-ganon ka pang nalalaman, hindi naman umubra."
]);

for (const s of STARTERS) {
  for (const m of MIDDLES) {
    GENERATED_REPLIES.add(`${s}, ${m}`);
    for (const c of CONNECTORS) {
      GENERATED_REPLIES.add(`${s}, ${m} ${c}`);
      for (const e of ENDINGS) {
        GENERATED_REPLIES.add(`${s}, ${m} ${c} ${e}`);
      }
    }
  }
}

const ALL_REPLIES = Array.from(GENERATED_REPLIES);

// =====================================================
// PRIVATE MESSAGE (PM) DEDICATED ASAR POOL
// =====================================================

const PM_STARTERS = [
  "oh bakit ka nag-pm", "anyare sayo sa inbox", "kala ko ba matapang ka",
  "sumiksik ka pa rito", "namimiss mo ba ako", "tago ka pa sa pm",
  "bakit dito ka nagpapakalat", "naka-private ka pa talaga", "ano na namang drama to"
];

const PM_MIDDLES = [
  "gusto mo lang ata mapansin eh", "wala ka kasing masabi sa public",
  "takot ka sigurong mapahiya sa GC", "nagpapapansin ka nanaman sa akin",
  "hina ng loob mo lumantad", "akala ko ba may ibubuga ka",
  "puro ka lang tago sa chat box", "nag-aabang ka lang pala ng pansin"
];

const PM_ENDINGS = [
  "ulol", "pulpol", "tanga", "hays", "tigilan mo ko", "weak", "diba", "noh"
];

const GENERATED_PM_REPLIES = new Set([
  "Nag-pm ka pa talaga para lang mapahiya nang tahimik.",
  "Akala mo naman may mapapala ka sa pag-chat dito.",
  "Bakit ka nandito sa inbox ko, wala ka na bang masabi sa iba?"
]);

for (const ps of PM_STARTERS) {
  for (const pm of PM_MIDDLES) {
    GENERATED_PM_REPLIES.add(`${ps}, ${pm}`);
    for (const pe of PM_ENDINGS) {
      GENERATED_PM_REPLIES.add(`${ps}, ${pm} ${pe}`);
    }
  }
}

const ALL_PM_REPLIES = Array.from(GENERATED_PM_REPLIES);

const COUNTER_BREAKER_REPLIES = [
  "Bilang ka nang bilang, sira naman ulo mo.",
  "Hinto na, umabot ka na namang tanga ka.",
  "Paulit-ulit sa pagbibilang, wala namang narating.",
  "Sira na naman ang bilang mo, pulpol ka talaga.",
  "Tumigil ka na kabilang, halata namang sablay ka."
];

const FUNNY_REASONS = [
  "Nanahimik bigla kasi napagtanto niyang walang kuwenta ang pinagsasabi niya.",
  "Tumakbo dahil napahiya sa sarili niyang sablay na hirit.",
  "Naglaho na parang bula nung natauhan sa kabobohan niya.",
  "Natulog na lang sa inis dahil walang kumampi sa kanya.",
  "Nawalan ng masabing matino kaya nagpanggap na nag-aoffline."
];

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function isAdmin(senderID) {
  return ADMIN_IDS.includes(String(senderID));
}

function loadConfig() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
      if (data && Array.isArray(data.activeThreads)) return data;
    }
  } catch (e) {}
  return { activeThreads: [] };
}

function saveConfig(data) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {}
}

function loadTrollTargets() {
  try {
    if (fs.existsSync(TROLL_DATA_PATH)) {
      const data = JSON.parse(fs.readFileSync(TROLL_DATA_PATH, "utf8"));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {}
  return [];
}

function saveTrollTargets(targets) {
  try {
    fs.writeFileSync(TROLL_DATA_PATH, JSON.stringify(targets, null, 2), "utf8");
  } catch (e) {}
}

function safeSend(api, message, threadID, replyToMessageID = null) {
  try {
    if (replyToMessageID) {
      api.sendMessage(message, threadID, () => {}, replyToMessageID);
    } else {
      api.sendMessage(message, threadID, () => {});
    }
  } catch (e) {}
}

async function getParticipantNames(api, threadID) {
  try {
    const threadInfo = await api.getThreadInfo(threadID);
    if (threadInfo && Array.isArray(threadInfo.userInfo)) {
      return threadInfo.userInfo.map(u => u && u.name).filter(Boolean);
    }
  } catch (e) {}
  return [];
}

// =====================================================
// SMART DECISION ENGINE
// =====================================================

function shouldBotReply(text) {
  const lower = text.toLowerCase();
  const highTriggerWords = ["ako", "si", "ba", "sino", "ano", "bakit", "paano", "talaga", "weh", "tanga", "ulol", "gago", "patingin", "pala"];
  const ignoreShorts = ["k", "ok", "ah", "ha", "ui", "uy", "ow", "hmm", "yow", "yo"];

  if (ignoreShorts.includes(lower) && text.length <= 3) return false;

  let triggerScore = 0.40;
  if (lower.includes("?") || lower.includes("sino") || lower.includes("ano") || lower.includes("ba")) {
    triggerScore += 0.35;
  }

  for (const word of highTriggerWords) {
    if (lower.includes(word)) {
      triggerScore += 0.15;
      break;
    }
  }

  return Math.random() < Math.min(triggerScore, 0.85);
}

// =====================================================
// IDLE TIMER (GC ONLY)
// =====================================================

function resetIdleTimer(api, threadID) {
  if (!threadID) return;
  const id = String(threadID);

  if (activeCounters.has(id)) return;
  if (idleTimers.has(id)) {
    clearTimeout(idleTimers.get(id));
    idleTimers.delete(id);
  }

  const timer = setTimeout(async () => {
    if (activeCounters.has(id)) return;
    activeCounters.add(id);

    try {
      safeSend(api, "⚠️ Ang tahimik niyo. Magsisimula na ang bilang!", id);

      for (let i = 1; i <= IDLE_COUNT_MAX; i++) {
        await new Promise(resolve => setTimeout(resolve, IDLE_COUNT_DELAY));
        safeSend(api, String(i), id);
      }

      const names = await getParticipantNames(api, id);
      const loserName = names.length > 0 ? names[Math.floor(Math.random() * names.length)] : "Isang Tanga";
      const randomReason = FUNNY_REASONS[Math.floor(Math.random() * FUNNY_REASONS.length)];

      safeSend(api, `HALIMAW WIN\nTarget: ${loserName}\nReason: ${randomReason}`, id);
    } catch (e) {
    } finally {
      activeCounters.delete(id);
      idleTimers.delete(id);
      resetIdleTimer(api, id);
    }
  }, IDLE_LIMIT_MS);

  idleTimers.set(id, timer);
}

// =====================================================
// MAIN UNIFIED EVENT HANDLER
// =====================================================

module.exports.handleEvent = async function ({ api, event }) {
  if (!event || !event.threadID) return;

  const threadID = event.threadID;
  const senderID = event.senderID;
  const body = event.body;
  const messageID = event.messageID;

  const threadKey = String(threadID);
  const senderKey = String(senderID || "");
  const text = body ? String(body).trim() : "";

  let botID = null;
  try { botID = api.getCurrentUserID(); } catch (e) {}

  const isSenderAdmin = isAdmin(senderKey);
  const isBotSender = botID && senderKey === String(botID);
  const isGroup = event.isGroup || (threadID !== senderID);

  // =====================================================
  // 1. ADMIN COMMAND: /troll [target_uid]
  // =====================================================
  if (text.toLowerCase().startsWith("/troll ") && isSenderAdmin) {
    const targetUID = text.substring(7).trim();
    if (!targetUID) {
      safeSend(api, "Gamitin: /troll [TARGET_UID]", threadKey);
      return;
    }

    let trollTargets = loadTrollTargets();
    if (!trollTargets.includes(targetUID)) {
      trollTargets.push(targetUID);
      saveTrollTargets(trollTargets);
    }

    safeSend(api, `🎯 Sinisimulan ang pag-troll kay UID: ${targetUID}...`, threadKey);

    try {
      api.sendMessage("hi tatagos ka ba?", targetUID, (err) => {
        if (!err) {
          safeSend(api, `✅ Naipadala na ang "hi tatagos ka ba?" sa PM ni UID: ${targetUID}`, threadKey);
        } else {
          safeSend(api, `❌ Nabigong i-PM ang target (Baka naka-lock o maling UID).`, threadKey);
        }
      });
    } catch (e) {
      safeSend(api, `❌ May error sa pagpapadala ng PM.`, threadKey);
    }
    return;
  }

  // =====================================================
  // 2. PRIVATE MESSAGE (PM) AUTO-REPLY HANDLER
  // =====================================================
  if (!isGroup) {
    if (isBotSender || !body) return;
    if (text.includes("http://") || text.includes("https://") || text.includes("www.")) return;

    let trollTargets = loadTrollTargets();
    if (!trollTargets.includes(senderKey)) {
      trollTargets.push(senderKey);
      saveTrollTargets(trollTargets);
    }

    const now = Date.now();
    const lastPMTime = pmGlobalCooldowns.get(senderKey) || 0;
    if (now < lastPMTime) return;

    if (!shouldBotReply(text)) return;

    const randomDelay = Math.floor(Math.random() * (MAX_REPLY_DELAY - MIN_REPLY_DELAY + 1)) + MIN_REPLY_DELAY;
    pmGlobalCooldowns.set(senderKey, now + randomDelay);

    const pmReply = ALL_PM_REPLIES[Math.floor(Math.random() * ALL_PM_REPLIES.length)];

    let typingInterval = null;
    try {
      api.sendTypingIndicator(senderKey, true);
      typingInterval = setInterval(() => {
        try { api.sendTypingIndicator(senderKey, true); } catch (e) {}
      }, 3000);
    } catch (e) {}

    setTimeout(() => {
      try {
        if (typingInterval) clearInterval(typingInterval);
        api.sendTypingIndicator(senderKey, false);
      } catch (e) {}

      safeSend(api, pmReply, senderKey, messageID);
    }, randomDelay);
    return;
  }

  // =====================================================
  // 3. GROUP CHAT (GC) HANDLERS
  // =====================================================
  const config = loadConfig();

  // TOGGLE COMMAND (/)
  if (text === "/" && isSenderAdmin) {
    const index = config.activeThreads.indexOf(threadKey);
    if (index === -1) {
      config.activeThreads.push(threadKey);
      saveConfig(config);
      try { api.setMessageReaction("💀", messageID, () => {}, true); } catch (e) {}
    } else {
      config.activeThreads.splice(index, 1);
      saveConfig(config);
      try { api.setMessageReaction("💤", messageID, () => {}, true); } catch (e) {}
    }
    return;
  }

  resetIdleTimer(api, threadKey);

  if (!config.activeThreads.includes(threadKey)) return;
  if (isSenderAdmin || isBotSender || !body) return;

  if (text.includes("http://") || text.includes("https://") || text.includes("www.")) return;

  // COUNTER BREAKER SA GC
  const isPureNumber = /^\d+$/.test(text);
  const parsedNum = parseInt(text, 10);
  const isCountingChat = isPureNumber && parsedNum >= 1 && parsedNum <= 200;

  if (isCountingChat) {
    const breakerReply = COUNTER_BREAKER_REPLIES[Math.floor(Math.random() * COUNTER_BREAKER_REPLIES.length)];
    safeSend(api, breakerReply, threadKey, messageID);
    return;
  }

  const now = Date.now();
  const lastReplyTime = gcGlobalCooldowns.get(threadKey) || 0;

  if (now < lastReplyTime) return;
  if (!shouldBotReply(text)) return;

  const randomDelay = Math.floor(Math.random() * (MAX_REPLY_DELAY - MIN_REPLY_DELAY + 1)) + MIN_REPLY_DELAY;
  gcGlobalCooldowns.set(threadKey, now + randomDelay);

  const reply = ALL_REPLIES[Math.floor(Math.random() * ALL_REPLIES.length)];

  let typingInterval = null;
  try {
    api.sendTypingIndicator(threadKey, true);
    typingInterval = setInterval(() => {
      try { api.sendTypingIndicator(threadKey, true); } catch (e) {}
    }, 3000);
  } catch (e) {}

  setTimeout(() => {
    try {
      if (typingInterval) clearInterval(typingInterval);
      api.sendTypingIndicator(threadKey, false);
    } catch (e) {}

      safeSend(api, reply, threadKey, messageID);
  }, randomDelay);
};

module.exports.run = async function () {
  return;
};

console.log(`[HALIMAW v66.0.0] Loaded unified single-file system successfully!`);
