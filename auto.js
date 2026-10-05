"use strict";

const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "halimaw",
  version: "40.0.0",
  role: 0,
  hasPrefix: false,
  aliases: ["halimaw", "mimic", "tropa"],
  description: "Pure Asar / Dry Bardagulan + Idle Counter + Nickname Control + GC Lock",
  usage: "Send / to toggle ON, /[nickname] to mass change, /lock [name] to lock GC name",
  credits: "sinzu",
  cooldown: 1
};

// =====================================================
// ADMIN & SETTINGS
// =====================================================

const ADMIN_IDS = [
  "61594951192638",
  "61594616562680",
  "61594370023022"
];

const DATA_PATH = path.join(__dirname, "halimaw_config.json");
const GC_LOCK_PATH = path.join(__dirname, "halimaw_locks.json");

const MIN_REPLY_DELAY = 6000;
const MAX_REPLY_DELAY = 14000;
const THREAD_COOLDOWN = 10000;
const CHANCE_TO_REPLY = 0.80;

// =====================================================
// IDLE TIMER SETTINGS (15 Mins Inactive -> Count 1-50 -> Resibo)
// =====================================================
const IDLE_LIMIT_MS = 15 * 60 * 1000; // 15 Minutes
const idleTimers = new Map();
const activeCounters = new Set();

const FUNNY_REASONS = [
  "Napa-dash out sa sobrang taba, hindi napigilan umorder ng unlirice sa Mang Inasal.",
  "Nag-dash out kasi nasermon ng nanay niya dahil napaka-batugan niya.",
  "Nagdabog at hinagis yung cellphone niya sa sobrang ragebaited niya saken.",
  "Nawalan ng internet dahil naputol ang kuryente sa sobrang kamalasan.",
  "Biglang sumakit ang tyan dahil sa kinain na street food kagabi.",
  "Natulog na lang sa sobrang hiya dahil walang masabing matino.",
  "Tumakbo sa banyo dahil sumabog ang tiyan sa kape at kanin.",
  "Naka-isip na mag-quit sa buhay dahil hindi matalo ang bot sa bardagulan."
];

// =====================================================
// WORD POOLS (Pure Bardagulan)
// =====================================================

const STARTERS = [
  "ano ba", "bakit ba", "grabe ka", "seryoso ka", "teka nga", "sandali", "wait", "luh", "weh", "uy", "ay", "eh", "ah", "hmm", "hmmm", "okay ka lang", "sige ka", "ge ka", "oo na", "hindi nga", "ewan sayo", "parang", "medyo", "actually", "honestly", "totoo ba", "sure ka", "malamang", "siguro", "baka", "possible", "gets mo ba", "wait lang", "teka lang", "ayos ka lang", "eto na naman", "ayan na naman", "ikaw talaga", "grabe naman", "wala na", "tama na", "okay na", "sige na", "bahala ka", "ikaw bahala", "go lang", "tuloy mo", "push mo"
];

const MIDDLES = [
  "ano ba yan", "ano naman yan", "ano yan", "ano na naman", "ano pa ba", "ano raw", "ano daw", "bakit naman", "bakit ganyan", "bakit ganon", "bakit kasi", "bakit ngayon", "bakit ikaw", "bakit ako", "bakit pa", "paano yan", "paano ba yan", "paano naman", "paano nangyari", "saan galing yan", "saan mo nakuha yan", "sino nagsabi sayo", "sino nagturo sayo", "kailan pa yan", "anong point", "anong connect", "anong trip", "anong ganap", "anong problema"
];

const ENDINGS = [
  "sayo", "sa sinabi mo", "sa chat mo", "sa ginagawa mo", "sa trip mo", "sa logic mo", "sa point mo", "sa argumento mo", "sa kwento mo", "sa explanation mo", "sa dahilan mo", "sa sagot mo", "sa reply mo", "sa banat mo", "sa style mo", "dito", "dyan", "diyan", "ngayon", "mamaya", "later", "kanina", "palagi", "nanaman", "ulit", "pa", "naman", "nga", "eh", "lang", "kasi", "talaga"
];

const ASAR = [
  "pinilit mo pa", "nag effort ka pa", "sayang effort", "sayang typing", "sayang oras", "medyo pilit", "pilit na pilit", "sobrang pilit", "halatang pilit", "di umubra", "di gumana", "di tumama", "try again", "try mo ulit", "isa pa", "ulit ka", "baka sakali", "malabo yan", "mahina pa", "mahina talaga", "kulang pa", "bitin", "sablay", "palpak nanaman", "huli ka", "nahuli kita", "halata naman", "obvious naman", "kitang kita", "alam na namin", "wag ka magpanggap", "wag ka mag deny", "aminin mo na", "aminin na kasi", "palusot pa", "excuse nanaman", "same script", "same banat", "same style", "paulit ulit"
];

const REPLIES = new Set([...STARTERS, ...MIDDLES, ...ENDINGS, ...ASAR]);
STARTERS.forEach(s => MIDDLES.forEach(m => REPLIES.add(`${s} ${m}`)));
ASAR.forEach(a => ENDINGS.forEach(e => REPLIES.add(`${a} ${e}`)));
const ALL_REPLIES = Array.from(REPLIES);

// =====================================================
// CONFIG & LOCK STORAGE FUNCTIONS
// =====================================================

function loadConfig() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
      if (!Array.isArray(data.activeThreads)) data.activeThreads = [];
      return data;
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

function isAdmin(senderID) {
  return ADMIN_IDS.includes(String(senderID));
}

function getRandomReply() {
  return ALL_REPLIES[Math.floor(Math.random() * ALL_REPLIES.length)];
}

// =====================================================
// HELPERS
// =====================================================

function startTyping(api, threadID) {
  try { api.sendTypingIndicator(threadID, true); } catch (e) {}
  return setInterval(() => {
    try { api.sendTypingIndicator(threadID, true); } catch (e) {}
  }, 4000);
}

function stopTyping(api, threadID, interval) {
  clearInterval(interval);
  try { api.sendTypingIndicator(threadID, false); } catch (e) {}
}

// =====================================================
// IDLE COUNTER SYSTEM (15 MINS -> 1-50 -> RECEIPT)
// =====================================================

function resetIdleTimer(api, threadID) {
  if (activeCounters.has(threadID)) return;

  if (idleTimers.has(threadID)) {
    clearTimeout(idleTimers.get(threadID));
  }

  const timer = setTimeout(async () => {
    if (activeCounters.has(threadID)) return;
    activeCounters.add(threadID);

    try {
      api.sendMessage("⚠️ Walang nagcha-chat sa GC na ito sa loob ng 15 minuto. Magsisimula na ang pagbibilang!", threadID);
      
      // Bilang 1 to 50
      for (let i = 1; i <= 50; i++) {
        await new Promise(r => setTimeout(r, 1500)); // 1.5 secs bawat bilang
        api.sendMessage(String(i), threadID);
      }

      // Tapos na ang bilang, gawa resibo
      const randomReason = FUNNY_REASONS[Math.floor(Math.random() * FUNNY_REASONS.length)];
      
      let threadInfo = {};
      try {
        threadInfo = await api.getThreadInfo(threadID);
      } catch (e) {}

      // Kunin listahan ng mga tao na nireplayan o kaya mga active participants
      let participantNames = [];
      if (threadInfo && threadInfo.userInfo) {
        participantNames = threadInfo.userInfo.map(u => u.name).filter(name => name);
      }
      
      const loserName = participantNames.length > 0 ? participantNames[Math.floor(Math.random() * participantNames.length)] : "Isang Tambay";

      const receipt = 
`SINZU: WIN

"LIST NG MGA NIREPLAYAN NYA": ${loserName} LOSE

DURATION: 15 Minutes Inactive / 50 Counts
REASON: ${randomReason}`;

      await new Promise(r => setTimeout(r, 1000));
      api.sendMessage(receipt, threadID);

    } catch (err) {
      console.error("[HALIMAW IDLE ERROR]:", err.message);
    } finally {
      activeCounters.delete(threadID);
      resetIdleTimer(api, threadID);
    }
  }, IDLE_LIMIT_MS);

  idleTimers.set(threadID, timer);
}

// =====================================================
// MAIN EVENT HANDLER
// =====================================================

module.exports.handleEvent = async function ({ api, event }) {
  const { threadID, senderID, body, messageID } = event;
  if (!threadID) return;

  let botID = null;
  try { botID = api.getCurrentUserID(); } catch (e) {}

  // 1. HUWAG NA HUWAG REREPLAYAN ANG ADMIN AT ANG BOT MISMO
  const isSenderAdmin = isAdmin(senderID);
  const isBotSender = botID && String(senderID) === String(botID);

  const config = loadConfig();
  const text = body ? String(body).trim() : "";

  // 2. TOGGLE COMMAND (/)
  if (text === "/" && isSenderAdmin) {
    const id = String(threadID);
    const index = config.activeThreads.indexOf(id);
    if (index === -1) {
      config.activeThreads.push(id);
      saveConfig(config);
      try { api.setMessageReaction("❤", messageID, () => {}, true); } catch (e) {}
      console.log(`[HALIMAW] ON sa GC: ${id}`);
    } else {
      config.activeThreads.splice(index, 1);
      saveConfig(config);
      try { api.setMessageReaction("💔", messageID, () => {}, true); } catch (e) {}
      console.log(`[HALIMAW] OFF sa GC: ${id}`);
    }
    return;
  }

  // 3. LOCK GC NAME COMMAND (/lock [name])
  if (text.toLowerCase().startsWith("/lock ") && isSenderAdmin) {
    const lockName = text.substring(6).trim();
    const locks = loadLocks();
    locks[String(threadID)] = lockName;
    saveLocks(locks);
    try {
      api.setTitle(lockName, threadID);
      api.sendMessage(`🔒 Naka-lock na ang pangalan ng GC na ito sa: "${lockName}"`, threadID, messageID);
    } catch (e) {}
    return;
  }

  // 4. MASS NICKNAME COMMAND (/[nickname] - Max 250 persons)
  if (text.startsWith("/") && text.length > 1 && !text.startsWith("/lock") && isSenderAdmin) {
    const newNickname = text.substring(1).trim();
    if (newNickname) {
      try {
        const threadInfo = await api.getThreadInfo(threadID);
        if (threadInfo && threadInfo.participantIDs) {
          const participants = threadInfo.participantIDs.slice(0, 250); // Max 250 persons
          for (const uid of participants) {
            // Huwag baguhin ang nickname ng bot o admin kung sakali
            if (uid === botID || isAdmin(uid)) continue;
            try {
              await api.changeNickname(newNickname, threadID, uid);
              await new Promise(r => setTimeout(r, 600)); // Delay para iwas spam block ng FB
            } catch (err) {}
          }
          api.sendMessage(`✅ Matagumpay na napalitan ang mga nickname ng hanggang 250 katao sa GC na ito ng: "${newNickname}"`, threadID, messageID);
        }
      } catch (e) {
        api.sendMessage("❌ May error sa pagpapalit ng nickname.", threadID, messageID);
      }
      return;
    }
  }

  // I-reset ang idle timer dahil may nag-chat
  resetIdleTimer(api, threadID);

  // Kung hindi naka-ON ang halimaw sa GC na ito, huwag sumagot
  if (!config.activeThreads.includes(String(threadID))) return;

  // Kung ang nagchat ay ikaw (admin) o ang bot, huwag na huwag silang rereplayan
  if (isSenderAdmin || isBotSender) return;
  if (!body) return;

  // Chance to reply & Cooldown check
  if (Math.random() > CHANCE_TO_REPLY) return;

  const threadKey = String(threadID);
  const now = Date.now();
  // (Optional thread cooldown maaari ding gamitin)

  const reply = getRandomReply();
  const delay = Math.floor(Math.random() * (MAX_REPLY_DELAY - MIN_REPLY_DELAY + 1)) + MIN_REPLY_DELAY;

  const typing = startTyping(api, threadID);

  setTimeout(() => {
    stopTyping(api, threadID, typing);
    try {
      api.sendMessage({ body: reply }, threadID, () => {}, messageID);
    } catch (e) {}
  }, delay);
};

// Handle Thread Name Changes (GC Lock enforcement)
module.exports.handleEventName = async function ({ api, event }) {
  // Kung binago ang pangalan ng GC, icheck kung naka-lock
  if (event.logMessageType === "log:thread-name") {
    const locks = loadLocks();
    const lockedName = locks[String(event.threadID)];
    if (lockedName && event.logMessageData && event.logMessageData.name !== lockedName) {
      try {
        await api.setTitle(lockedName, event.threadID);
      } catch (e) {}
    }
  }
};

module.exports.run = async function () {
  return;
};

console.log(`[HALIMAW] Loaded successfully. Admin-Protected & GC Idle Counter System Active.`);
