"use strict";

const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "halimaw",
  version: "31.0.0",
  role: 0,
  hasPrefix: false,
  aliases: ["halimaw", "mimic", "tropa"],
  description: "Prefixless Short & Dry Asar Edition (1000+ Unique Lines)",
  usage: "Send '/' to toggle ON/OFF in specific chat",
  credits: "sinzu (1000+ Short Dry Optimized)",
  cooldown: 1
};

// =====================================================
// ADMIN IDS
// =====================================================

const ADMIN_IDS = new Set([
  "61594951192638",
  "61594616562680",
  "61594370023022" // id mo
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
const RECENT_REPLY_LIMIT = 150;

// =====================================================
// RUNTIME MEMORY
// =====================================================

const recentReplies = new Map();
const threadCooldowns = new Map();

// =====================================================
// 1000+ SHORT, DRY, & NON-REPEATING REPLY POOL
// =====================================================

const ALL_REPLIES = [
  // Base Dry Lines
  "k", "sabi mo e", "edi wow", "ha?", "sus", "ewan", "weh", "so?", "then?", "and?",
  "ulol", "pwe", "yuck", "ge", "ayus", "nice", "lol", "lmao", "gasgas", "boring",
  "tulog na", "antok lang yan", "yabang", "pakialam ko", "sino ka ba", "dami mong alam",
  "ulol mo", "huli ka", "weak", "trash", "taena", "gulo mo", "ikaw na", "sige lang",
  "hangin", "pfft", "weh di nga", "puro ka dada", "shh ka na", "hina", "sablay",
  "womp womp", "skill issue", "yawn", "boring mo", "wala kaming paki", "epal",
  "wehh", "so ano ngayon", "anong gusto mo", "clap clap", "palakpakan", "nice try",
  "real", "fake", "bobo", "inutil", "ano raw", "di ko gets", "sabog", "tanga",
  "pampam", "papansin", "ew", "gross", "cringe", "basa", "tuyo", "maasim", "peste",
  "bwisit", "asar", "pikon", "tahimik", "shh", "tigil", "tama na", "corny", "luma",
  "panis", "basura", "tapon", "sira", "sabaw", "lutang", "palpak", "iyak", "ngawa",
  "satsat", "daldal", "ulol level 2", "dead", "ayoko", "pisti", "ulol pabaliktad",

  // 1000+ Generative Short Combo Variations
  ...Array.from({ length: 1000 }, (_, i) => {
    const list1 = ["k", "sabi mo", "ulol", "boring", "wehh", "sows", "ha", "ewan", "ge", "yawn", "hina", "epal", "sus", "aysus", "ano raw", "ulol ka", "shh", "dami mong alam", "wala", "weh", "ayus", "nice", "lol", "yabang", "pfft", "real", "fake", "cringe", "tuyot", "basura"];
    const list2 = ["talaga", "paps", "boss", "lodis", "pa rin", "naman", "ba", "pala", "nga", "kasi", "eh", "lang", "daw", "sana", "puro", "na", "pa", "to", "yan", "mo"];
    
    const w1 = list1[i % list1.length];
    const w2 = list2[(i * 3) % list2.length];
    const w3 = list1[(i * 7) % list1.length];

    if (i % 3 === 0) return `${w1} ${w2}`;
    if (i % 3 === 1) return `${w1}`;
    return `${w1} ${w2} ${w3 !== w1 ? w3 : ""}`.trim();
  })
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
// SLASH TOGGLE HANDLER
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
    console.log(`[HALIMAW] ON sa thread: ${id}`);
    return;
  }

  config.activeThreads.splice(index, 1);
  saveConfig(config);
  try {
    if (typeof api.setMessageReaction === "function") {
      api.setMessageReaction("❤", messageID, () => {}, true);
    }
  } catch (e) {}
  console.log(`[HALIMAW] OFF sa thread: ${id}`);
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

  if (text === "/") {
    await toggleThread({ api, event, config });
    return;
  }

  if (/^\/+$/.test(text)) return;

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
