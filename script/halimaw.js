"use strict";

const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "halimaw",
  version: "23.0.0",
  role: 0,
  hasPrefix: false,
  aliases: ["halimaw", "mimic", "tropa"],
  description: "Prefixless Tarantadong Halimaw - Ultra Toxic Asar Edition",
  usage: "Send '.' to toggle ON/OFF",
  credits: "sinzu (Pure Asar Optimized)",
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

const MIN_REPLY_DELAY = 6000;
const MAX_REPLY_DELAY = 14000;
const RECENT_REPLY_LIMIT = 50;

// =====================================================
// RUNTIME MEMORY
// =====================================================

const recentReplies = new Map();
const threadCooldowns = new Map();

// =====================================================
// PURE NANG AASAR REPLY POOL (Walang purihan, puro bara)
// =====================================================

const ALL_REPLIES = [
  "edi wow", "ha?", "sus", "ewan", "weh",
  "so?", "then?", "and?", "ayan na naman", "eto na naman tayo", "wala na naman", 
  "ano na naman yan", "anong pake ko", "pakialam ko", "sino nagtanong", "may nagtanong ba", 
  "bahala ka sa buhay mong pang-etneb", "ikaw na ang feeling sikat", "edi ikaw na ang tanga", 
  "ang angas mo ah, pero pulubi naman sa totoong buhay", "kalma, pikon ka na agad e", 
  "iyak ka na dyan", "pikon?", "galit ka na naman, triggered ka kuys?", 
  "affected yarn?", "tinamaan ka ba sa katotohanan?", "aray, tinamaan ang bobo", 
  "luh, nagmamagaling na naman ang tanga", "hala, lumalabas na naman ang kabobohan mo", 
  "ulol", "ampota", "angas mo mukha namang kangag", 
  "ano bang pinaglalaban mo, wala namang naniniwala sayo", "normal ka pa ba o sabog ka lang sa rugby", 
  "ano na naman pinag-iisip ng sabaw mong utak", "relax ka lang, wag masyadong feelingero", 
  "confidence lang kulang naman sa evidence", "may resibo ka ba o puro ka lang dakdak", 
  "saan ang source mo? sa pwet mo?", "source: trust me bro, gawa-gawa ko lang sa imahinasyon mo", 
  "ang bobo naman ng take mo, galing basurahan", "skill issue yan tol, wag kang umiyak", 
  "reading comprehension left the chat", "comprehension mo na-scam na naman", 
  "logic mo nag-offline na kasi walang laman ang ulo", "system error: walang kwenta sinabi mo", 
  "404 point not found", "proof muna bago ka magyabang dito, duwag", 
  "resibo muna bago satsat", "pakita mo muna kung may ibubuga ka bukod sa hangin", 
  "puro ka salita, wala ka namang narating", "predictable ka masyado, ang boring ng pagkatao mo", 
  "very original ah, galing sa basurahan nyo", "iyak ka na dyan sa sulok habang nagmumukmok", 
  "parang tanga lang umasta", "ulol mo", "hinto na sa kakahol dyan",
  "tumahol ka pa, mukha kang asong ulol", "ano na, iyak na sa madilim na sulok?", 
  "puro ka yabang wala ka namang laman sa utak", "lakas ng trip mo ah, tonta naman", 
  "sows, pampam ka na naman sa GC", "huli ka na sa balita, inutil ka kasi",
  "anong klaseng katangahan na naman yan", "ulol mo tatlo", "daming mong satsat wala namang sustansya",
  "kumain ka na ba? baka kaya ka ganyan kase gutom na ang tanga", "magsalita ka pa para mas lalo kang ibrushup as tanga"
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
// TYPING SIMULATION
// =====================================================

function startTyping(api, threadID) {
  try {
    if (typeof api.sendTypingIndicator === "function") {
      api.sendTypingIndicator(threadID, true);
    }
  } catch (e) {}

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

  const now = Date.now();
  const lastTime = threadCooldowns.get(String(threadID)) || 0;
  if (now - lastTime < 4000) {
    return;
  }
  threadCooldowns.set(String(threadID), now);

  const reply = getRandomReply(threadID);
  const typingInterval = startTyping(api, threadID);
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
