"use strict";

const fs = require("fs");
const path = require("path");
const { createCanvas } = require("canvas");

// =====================================================
// HALIMAW v47.0.0 (PURE BARDAGULAN / COLD ASAR)
// IDLE COUNTER + RECEIPT + GC LOCK
// =====================================================

module.exports.config = {
  name: "halimaw",
  version: "47.0.0",
  role: 0,
  hasPrefix: false,
  aliases: ["halimaw", "mimic", "tropa"],
  description:
    "Pure Cold Asar Generator + Idle Counter + GC Lock + Receipt",
  usage: "Send / to toggle ON, /lock [name] to lock GC name",
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
  } catch (error) {
    console.error("[HALIMAW] sendMessage error:", error.message);
    return false;
  }
}

// =====================================================
// GET GC INFO
// =====================================================

async function getGCInfo(api, threadID) {
  let threadInfo = {};
  try {
    threadInfo = await api.getThreadInfo(threadID);
  } catch (error) {
    console.error("[HALIMAW] getThreadInfo error:", error.message);
  }

  const gcName = threadInfo && threadInfo.threadName ? threadInfo.threadName : "Unknown GC";
  let participantNames = [];

  if (threadInfo && Array.isArray(threadInfo.userInfo)) {
    participantNames = threadInfo.userInfo
      .map(user => user && user.name)
      .filter(Boolean);
  }

  return { threadInfo, gcName, participantNames };
}

// =====================================================
// RECEIPT IMAGE
// =====================================================

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";

  for (const word of words) {
    const testLine = line.length > 0 ? `${line} ${word}` : word;
    const width = ctx.measureText(testLine).width;

    if (width > maxWidth && line.length > 0) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }

  if (line) lines.push(line);
  return lines;
}

async function generateReceiptImage(loserName, reason, gcName) {
  const width = 900;
  const height = 600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#11131a";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#ff4757";
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, width - 20, height - 20);

  ctx.fillStyle = "#ff4757";
  ctx.font = "bold 32px sans-serif";
  ctx.fillText("HALIMAW: BOBOTECH / ASAR SUMMARY", 40, 60);

  ctx.strokeStyle = "#3b3f4a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 85);
  ctx.lineTo(width - 40, 85);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "22px sans-serif";
  let y = 130;

  const gcLines = wrapText(ctx, `Group Chat: ${gcName}`, width - 80);
  for (const line of gcLines) {
    ctx.fillText(line, 40, y);
    y += 32;
  }

  y += 20;
  const loserLines = wrapText(ctx, `Biktima ng Pambasag: ${loserName}`, width - 80);
  for (const line of loserLines) {
    ctx.fillText(line, 40, y);
    y += 32;
  }

  y += 20;
  ctx.fillText("Duration: 15 Minutes Inactive / 50 Counts", 40, y);
  y += 55;

  ctx.fillStyle = "#ffa502";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("Dahilan kung bakit napahiya:", 40, y);
  y += 35;

  ctx.fillStyle = "#ffffff";
  ctx.font = "18px sans-serif";
  const reasonLines = wrapText(ctx, reason, width - 80);
  for (const line of reasonLines) {
    ctx.fillText(line, 40, y);
    y += 28;
    if (y > height - 80) break;
  }

  ctx.fillStyle = "#8f96a3";
  ctx.font = "14px sans-serif";
  ctx.fillText(`Generated at: ${new Date().toLocaleString()}`, 40, height - 40);

  const filePath = path.join(__dirname, `receipt_${Date.now()}.png`);
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(filePath, buffer);

  return filePath;
}

// =====================================================
// IDLE COUNTER
// =====================================================

function resetIdleTimer(api, threadID) {
  if (!threadID) return;
  const id = String(threadID);

  if (activeCounters.has(id)) return;

  if (idleTimers.has(id)) {
    try {
      clearTimeout(idleTimers.get(id));
    } catch (e) {}
    idleTimers.delete(id);
  }

  const timer = setTimeout(async () => {
    if (activeCounters.has(id)) return;
    activeCounters.add(id);

    let receiptImagePath = null;

    try {
      safeSend(
        api,
        "⚠️ Ang tahimik niyo. Mga walang masabing matino. Bilang na!",
        id
      );

      for (let i = 1; i <= IDLE_COUNT_MAX; i++) {
        await new Promise(resolve => setTimeout(resolve, IDLE_COUNT_DELAY));
        safeSend(api, String(i), id);
      }

      const gcData = await getGCInfo(api, id);
      const gcName = gcData.gcName;
      const participants = gcData.participantNames;

      const loserName = participants.length > 0 ? randomItem(participants) : "Isang Tanga";
      const randomReason = getRandomReason();

      const receiptText = `HALIMAW: ASAR WIN\n\nTarget: ${loserName}\nStatus: Napahiya / Nanahimik\nDuration: 15 Mins / 50 Counts\nDahilan: ${randomReason}`;

      await new Promise(resolve => setTimeout(resolve, 1000));
      safeSend(api, receiptText, id);

      receiptImagePath = await generateReceiptImage(loserName, randomReason, gcName);

      for (const adminID of ADMIN_IDS) {
        try {
          await new Promise(resolve => {
            api.sendMessage(
              {
                body: `📸 Auto-generated Asar Receipt\n\nGC ID: ${id}\nGC Name: ${gcName}`,
                attachment: fs.createReadStream(receiptImagePath)
              },
              adminID,
              () => resolve()
            );
          });
        } catch (adminError) {}
      }
    } catch (error) {
      console.error("[HALIMAW IDLE ERROR]:", error.message);
    } finally {
      if (receiptImagePath && fs.existsSync(receiptImagePath)) {
        try {
          fs.unlinkSync(receiptImagePath);
        } catch (e) {}
      }

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
  if (!event) return;

  const threadID = event.threadID;
  const senderID = event.senderID;
  const body = event.body;
  const messageID = event.messageID;

  if (!threadID) return;

  const threadKey = String(threadID);
  const senderKey = String(senderID || "");
  const text = body ? String(body).trim() : "";

  let botID = null;
  try {
    botID = api.getCurrentUserID();
  } catch (e) {}

  const isSenderAdmin = isAdmin(senderKey);
  const isBotSender = botID && senderKey === String(botID);
  const config = loadConfig();

  // Admin Toggle
  if (text === "/" && isSenderAdmin) {
    const index = config.activeThreads.indexOf(threadKey);

    if (index === -1) {
      config.activeThreads.push(threadKey);
      saveConfig(config);
      try {
        api.setMessageReaction("💀", messageID, () => {}, true);
      } catch (e) {}
      safeSend(api, "HALIMAW ASAR MODE: ON.", threadKey);
    } else {
      config.activeThreads.splice(index, 1);
      saveConfig(config);
      try {
        api.setMessageReaction("💤", messageID, () => {}, true);
      } catch (e) {}
      safeSend(api, "HALIMAW ASAR MODE: OFF.", threadKey);
    }
    return;
  }

  // Lock GC Name
  if (text.toLowerCase().startsWith("/lock ") && isSenderAdmin) {
    const lockName = text.substring(6).trim();

    if (!lockName) {
      safeSend(api, "Gamitin: /lock [GC NAME]", threadKey);
      return;
    }

    const locks = loadLocks();
    locks[threadKey] = lockName;
    saveLocks(locks);

    try {
      api.setTitle(lockName, threadKey);
    } catch (error) {}

    safeSend(api, `🔒 Naka-lock ang pangalan ng GC sa:\n"${lockName}"`, threadKey);
    return;
  }

  resetIdleTimer(api, threadKey);

  if (!config.activeThreads.includes(threadKey)) return;
  if (isSenderAdmin || isBotSender || !body) return;

  const cooldownKey = `${threadKey}_${senderKey}`;
  const now = Date.now();

  if (messageCooldowns.has(cooldownKey)) {
    const lastTime = messageCooldowns.get(cooldownKey);
    if (now < lastTime + COOLDOWN_DURATION) return;
  }

  if (Math.random() > CHANCE_TO_REPLY) return;

  messageCooldowns.set(cooldownKey, now);

  setTimeout(() => {
    if (messageCooldowns.get(cooldownKey) === now) {
      messageCooldowns.delete(cooldownKey);
    }
  }, COOLDOWN_DURATION * 2);

  const reply = getRandomReply();
  const delay = Math.floor(Math.random() * (MAX_REPLY_DELAY - MIN_REPLY_DELAY + 1)) + MIN_REPLY_DELAY;
  const typing = startTyping(api, threadKey);

  setTimeout(() => {
    stopTyping(api, threadKey, typing);
    safeSend(api, reply, threadKey, messageID);
  }, delay);
};

module.exports.run = async function () {
  return;
};

console.log(`[HALIMAW] v47.0.0 LOADED SUCCESSFULLY | Total Cold Asar Pool: ${ALL_REPLIES.length} Combinations`);
