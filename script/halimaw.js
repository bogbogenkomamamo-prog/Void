"use strict";

const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "halimaw",
  version: "21.1.0",
  role: 0,
  hasPrefix: false,
  aliases: ["halimaw", "mimic", "tropa"],
  description: "Prefixless Tarantadong Halimaw - Anti-Ban Optimized",
  usage: "Send '.' to toggle ON/OFF",
  credits: "sinzu (Optimized for Anti-Ban)",
  cooldown: 1
};

// =====================================================
// ADMIN IDS
// =====================================================

const ADMIN_IDS = new Set([
  "61594951192638",
  "61594616562680"
]);

// =====================================================
// CONFIG FILE
// =====================================================

const DATA_PATH = path.join(__dirname, "halimaw_config.json");

// =====================================================
// SETTINGS (ANTI-BAN OPTIMIZED)
// =====================================================

// Randomized delay sa pagitan ng 6 hanggang 14 segundo para magmukhang tao
const MIN_REPLY_DELAY = 6000;
const MAX_REPLY_DELAY = 14000;

// Ilang previous replies ang iiwasang ulitin sa isang thread.
const RECENT_REPLY_LIMIT = 50;

// =====================================================
// RUNTIME MEMORY
// =====================================================

const recentReplies = new Map();
// Cooldown per thread para hindi ma-flood ang API kung maingay ang GC
const threadCooldowns = new Map();

// =====================================================
// REPLY POOL (Hinatid mula sa orihinal mong listahan)
// =====================================================

const ALL_REPLIES = [
  "edi wow", "sabi mo e", "tapos?", "ha?", "ah ok", "k", "ok", "sus", "ewan", "weh",
  "so?", "then?", "and?", "sige", "go", "ayan na naman", "eto na naman tayo",
  "wala na naman", "ano na naman yan", "anong pake ko", "pakialam ko", "sino nagtanong",
  "may nagtanong ba", "bahala ka", "ikaw na", "edi ikaw na", "wow naman", "astig",
  "lakas", "angas ah", "grabe ka", "kalma", "relax", "hinga muna", "tulog ka na",
  "matulog ka", "antok ako", "nakakatamad ka", "ang boring", "boring mo", "ang haba",
  "di ko binasa", "skip", "next", "pass", "wala akong gana", "mamaya na", "wag na",
  "tama na", "ayoko na", "sakit sa ulo", "daldal", "daldal mo", "ingay", "ang ingay mo",
  "puro ka salita", "sana all", "iyak na", "pikon ka?", "galit?", "triggered?",
  "affected?", "tinamaan?", "aray", "ouch", "luh", "hala", "omsim", "legit ba",
  "sure ka", "seryoso?", "talaga ba", "nice try", "good luck", "uy", "oy", "psst",
  "paps", "lods", "tol", "pre", "boss", "master", "idol", "sir", "chief", "bro",
  "ano bang point mo", "saan mo naman napulot yan", "anong pinaglalaban mo ngayon",
  "bakit parang galit na galit ka", "normal ka lang ba", "ano na naman pinag-iisip mo",
  "bro relax lang", "huminga ka muna bago ka magreply", "wag mong dibdibin lahat",
  "confidence lang kulang sa evidence", "may resibo ka ba", "saan ang source",
  "source: trust me bro", "parang gawa-gawa lang", "interesting take", "skill issue",
  "reading comprehension check", "comprehension left the chat", "logic went offline",
  "system error", "404 point not found", "proof muna bago yabang", "resibo muna",
  "pakita mo muna", "wag puro salita", "expected", "predictable", "very original"
];

// =====================================================
// LOAD & SAVE CONFIG
// =====================================================

function loadConfig() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
      if (!Array.isArray(data.activeThreads)) {
        data.activeThreads = [];
      }
      return data;
    }
  } catch (error) {
    console.error("[HALIMAW] Failed to load config:", error.message);
  }
  return { activeThreads: [] };
}

function saveConfig(data) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("[HALIMAW] Failed to save config:", error.message);
  }
}

function isAdmin(senderID) {
  return ADMIN_IDS.has(String(senderID));
}

function getRandomReply(threadID) {
  let previous = recentReplies.get(String(threadID)) || [];
  let available = ALL_REPLIES.filter(reply => !previous.includes(reply));

  if (available.length === 0) {
    previous = [];
    available = ALL_REPLIES;
  }

  const reply = available[Math.floor(Math.random() * available.length)];
  previous.push(reply);

  if (previous.length > RECENT_REPLY_LIMIT) {
    previous.shift();
  }

  recentReplies.set(String(threadID), previous);
  return reply;
}

// =====================================================
// SAFER TYPING SIMULATION
// =====================================================

function startTyping(api, threadID) {
  try {
    if (typeof api.sendTypingIndicator === "function") {
      api.sendTypingIndicator(threadID, true);
    }
  } catch (e) {}

  // Pinalawig ang interval sa 4 segundo para hindi masyadong madalas ang ping
  const interval = setInterval(() => {
    try {
      if (typeof api.sendTypingIndicator === "function") {
        api.sendTypingIndicator(threadID, true);
      }
    } catch (e) {}
  }, 4000);

  return interval;
}

function stopTyping(api, threadID, interval) {
  clearInterval(interval);
  try {
    if (typeof api.sendTypingIndicator === "function") {
      api.sendTypingIndicator(threadID, false);
    }
  } catch (e) {}
}

// =====================================================
// DOT TOGGLE
// =====================================================

async function toggleThread({ api, event, config }) {
  const { threadID, senderID, messageID } = event;

  if (!isAdmin(senderID)) return;

  const id = String(threadID);
  const index = config.activeThreads.indexOf(id);

  if (index === -1) {
    config.activeThreads.push(id);
    saveConfig(config);
    try {
      if (typeof api.setMessageReaction === "function") {
        api.setMessageReaction("❤", messageID, () => {}, true);
      }
    } catch (e) {}
    console.log(`[HALIMAW] ON: ${id}`);
    return;
  }

  config.activeThreads.splice(index, 1);
  saveConfig(config);
  try {
    if (typeof api.setMessageReaction === "function") {
      api.setMessageReaction("❤", messageID, () => {}, true);
    }
  } catch (e) {}
  console.log(`[HALIMAW] OFF: ${id}`);
}

// =====================================================
// MAIN EVENT HANDLER
// =====================================================

module.exports.handleEvent = async function ({ api, event }) {
  const { threadID, senderID, body, messageID } = event;

  if (!body) return;

  let botID = null;
  try {
    botID = api.getCurrentUserID();
  } catch (e) {}

  if (botID && String(senderID) === String(botID)) {
    return;
  }

  const text = String(body).trim();
  const config = loadConfig();

  if (text === ".") {
    await toggleThread({ api, event, config });
    return;
  }

  if (/^\.+$/.test(text)) return;

  if (!config.activeThreads.includes(String(threadID))) {
    return;
  }

  // ANTI-SPAM THREAD COOLDOWN (Pigilan mag-reply kung wala pang 4 segundo mula nung huli)
  const now = Date.now();
  const lastTime = threadCooldowns.get(String(threadID)) || 0;
  if (now - lastTime < 4000) {
    return; // I-skip muna para hindi ma-rate limit ang dummy
  }
  threadCooldowns.set(String(threadID), now);

  const reply = getRandomReply(threadID);
  const typingInterval = startTyping(api, threadID);

  // Random delay generator (sa pagitan ng 6s hanggang 14s)
  const randomDelay = Math.floor(Math.random() * (MAX_REPLY_DELAY - MIN_REPLY_DELAY + 1)) + MIN_REPLY_DELAY;

  setTimeout(() => {
    stopTyping(api, threadID, typingInterval);

    try {
      api.sendMessage({ body: reply }, threadID, () => {}, messageID);
    } catch (error) {
      console.error("[HALIMAW] Send error:", error.message);
    }
  }, randomDelay);
};

module.exports.run = async function () {
  return;
};
