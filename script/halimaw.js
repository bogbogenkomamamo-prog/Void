"use strict";

const fs = require("fs");
const path = require("path");

// =====================================================
// HALIMAW v55.0.0 (ANTI-DETECTION RANDOM DELAY + GLOBAL RATE LIMIT)
// =====================================================

module.exports.config = {
  name: "halimaw",
  version: "55.0.0",
  role: 0,
  hasPrefix: false,
  aliases: ["halimaw", "mimic", "tropa"],
  description: "Auto Reply Asar + GC Lock + Mass Nickname + Idle Counter + Anti-Detection Delay",
  usage: "Send / to toggle ON, /lock [name], /set [nickname]",
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
const GC_LOCK_PATH = path.join(__dirname, "halimaw_locks.json");

// =====================================================
// SETTINGS & 5000+ COMBINATORIAL ASAR POOLS
// =====================================================

const MIN_REPLY_DELAY = 10000; // 10 seconds minimum
const MAX_REPLY_DELAY = 16000; // 16 seconds maximum (Randomized para iwas block)
const CHANCE_TO_REPLY = 0.85;

const IDLE_LIMIT_MS = 15 * 60 * 1000; // 15 Minutes
const IDLE_COUNT_MAX = 50;
const IDLE_COUNT_DELAY = 2000;

const idleTimers = new Map();
const activeCounters = new Set();
const gcGlobalCooldowns = new Map(); // Global tracking per GC

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

function loadLocks() {
  try {
    if (fs.existsSync(GC_LOCK_PATH)) {
      return JSON.parse(fs.readFileSync(GC_LOCK_PATH, "utf8"));
    }
  } catch (e) {}
  return {};
}

function saveLocks(locks) {
  try {
    fs.writeFileSync(GC_LOCK_PATH, JSON.stringify(locks, null, 2), "utf8");
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

async function getGCInfo(api, threadID) {
  let threadInfo = {};
  try {
    threadInfo = await api.getThreadInfo(threadID);
  } catch (e) {}

  const gcName = threadInfo && threadInfo.threadName ? threadInfo.threadName : "Unknown GC";
  const participantIDs = threadInfo && Array.isArray(threadInfo.participantIDs) ? threadInfo.participantIDs : [];
  const participantNames = threadInfo && Array.isArray(threadInfo.userInfo) 
    ? threadInfo.userInfo.map(u => u && u.name).filter(Boolean) 
    : [];

  return { gcName, participantIDs, participantNames };
}

// =====================================================
// IDLE TIMER
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

      const gcData = await getGCInfo(api, id);
      const loserName = gcData.participantNames.length > 0 
        ? gcData.participantNames[Math.floor(Math.random() * gcData.participantNames.length)] 
        : "Isang Tanga";
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
// MAIN EVENT HANDLER
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
  const config = loadConfig();

  // 1. TOGGLE COMMAND (/) - EMOJI REACTION ONLY
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

  // 2. LOCK GC NAME COMMAND (/lock [name])
  if (text.toLowerCase().startsWith("/lock ") && isSenderAdmin) {
    const lockName = text.substring(6).trim();
    if (!lockName) {
      safeSend(api, "Gamitin: /lock [GC NAME]", threadKey);
      return;
    }

    const locks = loadLocks();
    locks[threadKey] = lockName;
    saveLocks(locks);

    try { api.setTitle(lockName, threadKey); } catch (e) {}
    safeSend(api, `🔒 Naka-lock ang pangalan ng GC sa: "${lockName}"`, threadKey);
    return;
  }

  // 3. MASS NICKNAME COMMAND (/set [nickname])
  if (text.toLowerCase().startsWith("/set ") && isSenderAdmin) {
    const newNickname = text.substring(5).trim();
    if (!newNickname) {
      safeSend(api, "Gamitin: /set [NICKNAME]", threadKey);
      return;
    }

    safeSend(api, `🔄 Binabago ang nickname ng lahat sa "${newNickname}"...`, threadKey);

    try {
      const gcData = await getGCInfo(api, threadKey);
      let successCount = 0;

      for (const userID of gcData.participantIDs) {
        try {
          await new Promise((resolve) => {
            api.changeNickname(newNickname, threadKey, userID, (err) => {
              if (!err) successCount++;
              resolve();
            });
          });
        } catch (e) {}
      }

      safeSend(api, `✅ Tagumpay na nabago ang nickname ng ${successCount} miyembro!`, threadKey);
    } catch (e) {
      safeSend(api, "❌ May error sa pagbago ng nickname.", threadKey);
    }
    return;
  }

  // 4. IDLE TIMER & AUTO REPLY (RANDOMIZED DELAY PARA IWAS SPAM BAN)
  resetIdleTimer(api, threadKey);

  if (!config.activeThreads.includes(threadKey)) return;
  if (isSenderAdmin || isBotSender || !body) return;

  const now = Date.now();
  const lastReplyTime = gcGlobalCooldowns.get(threadKey) || 0;

  if (now < lastReplyTime) return;
  if (Math.random() > CHANCE_TO_REPLY) return;

  // Mag-generate ng random delay sa pagitan ng 10 at 16 segundo
  const randomDelay = Math.floor(Math.random() * (MAX_REPLY_DELAY - MIN_REPLY_DELAY + 1)) + MIN_REPLY_DELAY;
  
  gcGlobalCooldowns.set(threadKey, now + randomDelay);

  const reply = ALL_REPLIES[Math.floor(Math.random() * ALL_REPLIES.length)];

  let typingInterval = null;
  try {
    api.sendTypingIndicator(threadKey, true);
    typingInterval = setInterval(() => {
      try { api.sendTypingIndicator(threadKey, true); } catch (e) {}
    }, 4000);
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

console.log(`[HALIMAW v55.0.0] Loaded successfully with anti-detection random delay!`);
