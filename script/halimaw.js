"use strict";

const fs = require("fs");
const path = require("path");
const { createCanvas } = require("canvas");

// =====================================================
// HALIMAW v48.0.0 (MASSIVE COLD ASAR + NICKNAME MASS SETTER)
// IDLE COUNTER + RECEIPT + GC LOCK
// =====================================================

module.exports.config = {
  name: "halimaw",
  version: "48.0.0",
  role: 0,
  hasPrefix: false,
  aliases: ["halimaw", "mimic", "tropa"],
  description:
    "Pure Cold Asar + Mass Nickname Setter + Idle Counter + GC Lock + Receipt",
  usage: "Send / to toggle ON, /lock [name], /set [nickname]",
  credits: "sinzu",
  cooldown: 1
};

// =====================================================
// ADMIN
// =====================================================

const ADMIN_IDS = [
  "61595204307407"
];

// =====================================================
// FILE STORAGE
// =====================================================

const DATA_PATH = path.join(__dirname, "halimaw_config.json");
const GC_LOCK_PATH = path.join(__dirname, "halimaw_locks.json");

// =====================================================
// REPLY SETTINGS
// =====================================================

const MIN_REPLY_DELAY = 6000;
const MAX_REPLY_DELAY = 14000;

const CHANCE_TO_REPLY = 0.85;

const COOLDOWN_DURATION = 5000;

const messageCooldowns = new Map();

// =====================================================
// IDLE SETTINGS
// =====================================================

const IDLE_LIMIT_MS = 15 * 60 * 1000;

const IDLE_COUNT_MAX = 50;
const IDLE_COUNT_DELAY = 2000;

const idleTimers = new Map();
const activeCounters = new Set();

// =====================================================
// FUNNY IDLE REASONS (PANG-AASAR)
// =====================================================

const FUNNY_REASONS = [
  "Nanahimik bigla kasi napagtanto niyang walang kuwenta ang pinagsasabi niya.",
  "Tumakbo dahil napahiya sa sarili niyang sablay na hirit.",
  "Naglaho na parang bula nung natauhan sa kabobohan niya.",
  "Natulog na lang sa inis dahil walang kumampi sa kanya.",
  "Nawalan ng masabing matino kaya nagpanggap na nag-aoffline.",
  "Umalis sa eksena dahil hindi kinaya ang sariling kapalpakan.",
  "Naubusan ng palusot kaya tuluyang tumikom ang bibig.",
  "Naka-isip na magtago sa lungga niya sa sobrang hiya."
];

// =====================================================
// PURE COLD & DISMISSIVE WORD POOLS (5000+ COMBINATIONS)
// =====================================================

const STARTERS = [
  "sabi mo e", "weh", "luh", "talaga ba", "sige pilitin mo pa",
  "yan na yun", "parang tanga lang", "asan ang koneksyon", "ang layo naman",
  "sino may sabi", "sus", "patingin nga", "sino niloloko mo", "iyak ka na",
  "huli ka naman", "edi wow", "grabeng pagpilit yan", "pinilit mo na naman",
  "ayos ng palusot mo", "ano na namang katarantaduhan yan", "tigilan mo nga yan",
  "napaka-pilit naman neto", "wala ka bang ibang masabi", "paulit-ulit ka na naman",
  "ano raw", "yun na yun e", "hina naman ng utak mo", "sablay na naman"
];

const MIDDLES = [
  "pabida ka nanaman", "wala namang nagtanong", "hina ng comprehension mo",
  "mag-isip ka naman kahit konti", "dami mong alam",
  "pilit na pilit ang banat", "hanggang diyan na lang ba", "nagmamagaling ka nanaman",
  "sablay nanaman ang diskarte", "paulit-ulit ang script mo", "halatang pilit e",
  "ibang klase ka rin eh", "as usual, sablay", "panay ang angas wala namang laman",
  "puro ka na lang ganyan", "nag-isip ka ba bago mo sinabi yan", "parang ewan lang",
  "sumakit lang ulo ko sayo", "walang pumapansin pero pilit pa rin", "lakas ng trip mo ah",
  "walang kuwenta", "puro yabang", "sablay ang logic", "pulpol na hirit"
];

const CONNECTORS = [
  "kasi", "kamo", "talaga", "naman", "pala", "nga", "eh", "ba", "sana", "tuloy",
  "lang", "daw", "raw", "naman e", "pala ha", "kasi naman", "talaga o", "naman oh"
];

const ENDINGS = [
  "no", "eh", "kasi", "talaga", "naman", "pala", "lang", "diba", "hays", "ulol"
];

// =====================================================
// DYNAMIC COMBINATORIAL POOL (5000+ COMBINATIONS)
// =====================================================

const GENERATED_REPLIES = new Set([
  "Sino na naman nagturo sa iyong magsabi ng ganyan?",
  "Ang lalim ng iniisip mo ah, pero sablay pa rin.",
  "May pa-ganon ka pang nalalaman, hindi naman umubra.",
  "Huwag masyadong magpapakapagod mag-isip, baka mapagod ulo mo.",
  "Iba ka rin e, parang laging gustong bida sa kwento.",
  "Kitang-kita ko yung pagod sa pagpupumilit mo.",
  "Ayos sana eh, kaso ang bobo ng dulo.",
  "Wala ka namang napatunayan sa pinagsasabi mo.",
  "Tumigil ka na nga, sumasakit lang ulo sa kabobohan mo."
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
// RANDOM HELPERS
// =====================================================

function randomItem(array) {
  if (!Array.isArray(array) || array.length === 0) return "";
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomReply() {
  return randomItem(ALL_REPLIES);
}

function getRandomReason() {
  return randomItem(FUNNY_REASONS);
}

// =====================================================
// ADMIN CHECK
// =====================================================

function isAdmin(senderID) {
  return ADMIN_IDS.includes(String(senderID));
}

// =====================================================
// CONFIG
// =====================================================

function loadConfig() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
      if (!data || typeof data !== "object") return { activeThreads: [] };
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

// =====================================================
// GC LOCK STORAGE
// =====================================================

function loadLocks() {
  try {
    if (fs.existsSync(GC_LOCK_PATH)) {
      const data = JSON.parse(fs.readFileSync(GC_LOCK_PATH, "utf8"));
      if (data && typeof data === "object") return data;
    }
  } catch (error) {
    console.error("[HALIMAW] Lock load error:", error.message);
  }
  return {};
}

function saveLocks(locks) {
  try {
    fs.writeFileSync(GC_LOCK_PATH, JSON.stringify(locks, null, 2), "utf8");
  } catch (error) {
    console.error("[HALIMAW] Lock save error:", error.message);
  }
}

// =====================================================
// TYPING INDICATOR
// =====================================================

function startTyping(api, threadID) {
  try {
    api.sendTypingIndicator(threadID, true);
  } catch (e) {}

  const interval = setInterval(() => {
    try {
      api.sendTypingIndicator(threadID, true);
    } catch (e) {}
  }, 4000);

  return interval;
}

function stopTyping(api, threadID, interval) {
  try {
    if (interval) clearInterval(interval);
  } catch (e) {}

  try {
    api.sendTypingIndicator(threadID, false);
  } catch (e) {}
}

// =====================================================
// SAFE MESSAGE
// =====================================================

function safeSend(api, message, threadID, replyToMessageID = null) {
  try {
    if (replyToMessageID) {
      api.sendMessage(message, threadID, () => {}, replyToMessageID);
    } else {
      api.sendMessage(message, threadID, () => {});
    }
    return true;
