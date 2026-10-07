"use strict";

const fs = require("fs");
const path = require("path");

// =====================================================
// HALIMAW v67.0.0 (EXPANDED NEUTRAL VOCAB + RANDOMIZER + MEMORY)
// =====================================================

module.exports.config = {
  name: "halimaw",
  version: "67.0.0",
  role: 0,
  hasPrefix: false,
  aliases: ["halimaw", "mimic", "tropa"],
  description: "Unified Neutral Asar Bot with Randomizer, Memory Tracker, and 6-9s Delay",
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
const MEMORY_DATA_PATH = path.join(__dirname, "halimaw_memory.json");

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
// EXPANDED NEUTRAL & SARKASTIKONG ASAR POOLS (GC)
// =====================================================

const STARTERS = [
  "ganoon ba", "ayon naman pala", "may punto ka sana", "subukan mo ulit",
  "akala ko naman kung ano", "interesante ang pananaw mo", "ang lalim niyan ah",
  "may nalalaman ka pa kasing ganyan", "hindi ko na kayang i-defend yan",
  "parang may kulang sa argumento mo", "subukan mong pag-isipan muna",
  "kahit kailan talaga", "kahanga-hanga ang kumpyansa mo", "sige lang, ituloy mo",
  "ang galing mo sanang maniwala sa sarili mo", "napakagandang ideya sana kung totoo"
];

const MIDDLES = [
  "kaso medyo lumihis ka sa landas", "pero parang kulang sa substansiya",
  "subalit mahirap paniwalaan", "kahit baligtarin mo pa ang mundo",
  "malayo sa reyalidad ang sinasabi mo", "hanggang diyan na lang ba ang kaya mo",
  "parang hindi naman ganyan ang tamang direksyon", "napakalayo ng koneksyon sa pinag-uusapan",
  "sayang ang oras sa ganyang teorya", "parang wala namang patutunguhan yan",
  "masyadong mataas ang lipad, bagsak naman sa lupa", "subukan mong magbasa ng konti bago magsalita"
];

const CONNECTORS = [
  "sa totoo lang", "bilang pag-alala", "kung iisipin", "sa totoo lang naman",
  "habang maaga pa", "kahit kailan", "kung tutuusin", "sa kabilang dako"
];

const ENDINGS = [
  "kaibigan", "paps", "boss", "lodis", "master", "pabling", "pangga", "mismo"
];

// Pang-neutralizer generator para maiwasan ang paulit-ulit na linya
const GENERATED_REPLIES = new Set([
  "Medyo kapansin-pansin ang pagpupursigi mo sa maling direksyon.",
  "Kung gaano kalakas ang loob mo, siyang ikinababa ng argumento mo.",
  "May mga bagay talagang mas mabuting hindi na lang pinipilit."
]);

for (const s of STARTERS) {
  for (const m of MIDDLES) {
    GENERATED_REPLIES.add(`${s}, ${m}.`);
    for (const c of CONNECTORS) {
      GENERATED_REPLIES.add(`${s} ${c}, ${m}.`);
      for (const e of ENDINGS) {
        GENERATED_REPLIES.add(`${s} ${c}, ${m}, ${e}.`);
      }
    }
  }
}

const ALL_REPLIES = Array.from(GENERATED_REPLIES);

// =====================================================
// DEDICATED NEUTRAL PM POOL
// =====================================================

const PM_STARTERS = [
  "napadaan ka ata dito sa inbox", "may kailangan ka ba sa pribadong usapan",
  "bakit dito mo pa napagpasyahang magsalita", "akala ko ba mas matapang ka sa publiko",
  "tila naghahanap ka ng atensyon sa tahimik na lugar"
];

const PM_MIDDLES = [
  "mas magandang sa harap ng marami mo yan sinabi", "hindi ko sigurado kung makakatulong yan sa iyo",
  "subukan mo kayang linawin muna ang isip mo", "masyadong personal ang dating para sa walang kuwentang punto"
];

const PM_ENDINGS = [
  "kaibigan", "paps", "boss", "pari"
];

const GENERATED_PM_REPLIES = new Set([
  "Maganda sana ang simula ng usapan kung may laman ang sinabi mo.",
  "Bakit ka umiwas sa madla para lang magpahayag ng ganyan?",
  "May mga pribadong mensahe na mas mabuting hindi na lang binubuksan."
]);

for (const ps of PM_STARTERS) {
  for (const pm of PM_MIDDLES) {
    GENERATED_PM_REPLIES.add(`${ps} ${pm}.`);
    for (const pe of PM_ENDINGS) {
      GENERATED_PM_REPLIES.add(`${ps} ${pm}, ${pe}.`);
    }
  }
}

const ALL_PM_REPLIES = Array.from(GENERATED_PM_REPLIES);

const COUNTER_BREAKER_REPLIES = [
  "Paulit-ulit sa pagbilang, subalit walang patutunguhan.",
  "May sarili ka bang uniberso para magbilang nang ganyan?",
  "Medyo lumihis ka na sa layunin ng pagpupulong na ito.",
  "Itigil mo na ang pagbibilang, hindi naman nakatutulong.",
  "Nasasayang lamang ang oras mo sa kaka-sequence na yan."
];

const FUNNY_REASONS = [
  "Nanahimik dahil narealisadong walang kabuluhan ang mga naiambag.",
  "Biglang lumisan dahil sa kakulangan ng matibay na depensa.",
  "Pumili na lamang ng katahimikan matapos mapagtanto ang kamalian.",
  "Nagpahinga na muna upang pag-isipan ang mga hakbang sa buhay."
];

// =====================================================
// HELPER & MEMORY FUNCTIONS
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

// Memory Tracker para sa bawat thread/sender para iwas ulit-ulit ng sagot
function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_DATA_PATH)) {
      return JSON.parse(fs.readFileSync(MEMORY_DATA_PATH, "utf8"));
    }
  } catch (e) {}
  return {};
}

function saveMemory(memory) {
  try {
    fs.writeFileSync(MEMORY_DATA_PATH, JSON.stringify(memory, null, 2), "utf8");
  } catch (e) {}
}

function getNonRepeatedReply(key, pool) {
  let memory = loadMemory();
  if (!memory[key]) memory[key] = [];

  // Kunin ang mga hindi pa nagagamit kamakailan
  let available = pool.filter(r => !memory[key].includes(r));
  if (available.length === 0) {
    memory[key] = []; // I-reset kung naubos na ang pool
    available = pool;
  }

  const selected = available[Math.floor(Math.random() * available.length)];
  
  // I-record sa memory (Max 50 history)
  memory[key].push(selected);
  if (memory[key].length > 50) memory[key].shift();
  saveMemory(memory);

  return selected;
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
  const highTriggerWords = ["ako", "si", "ba", "sino", "ano", "bakit", "paano", "talaga", "kaya", "ganon", "pala"];
  const ignoreShorts = ["k", "ok", "ah", "ha", "ui", "uy", "ow", "hmm", "yow", "yo"];

  if (ignoreShorts.includes(lower) && text.length <= 3) return false;

  let triggerScore = 0.40;
  if (lower.includes("?") || lower.includes("sino") || lower.includes("ano") || lower.includes("bakit")) {
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
      safeSend(api, "⚠️ Tila masyadong tahimik ang paligid. Sisimulan na ang pagtatala.", id);

      for (let i = 1; i <= IDLE_COUNT_MAX; i++) {
        await new Promise(resolve => setTimeout(resolve, IDLE_COUNT_DELAY));
        safeSend(api, String(i), id);
      }

      const names = await getParticipantNames(api, id);
      const loserName = names.length > 0 ? names[Math.floor(Math.random() * names.length)] : "Kalahok";
      const randomReason = FUNNY_REASONS[Math.floor(Math.random() * FUNNY_REASONS.length)];

      safeSend(api, `SINTESIS NG USAPAN\nPusod: ${loserName}\nSanhi: ${randomReason}`, id);
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
      safeSend(api, "Paggamit: /troll [TARGET_UID]", threadKey);
      return;
    }

    let trollTargets = loadTrollTargets();
    if (!trollTargets.includes(targetUID)) {
      trollTargets.push(targetUID);
      saveTrollTargets(trollTargets);
    }

    safeSend(api, `🎯 Sinisimulan ang pakikipag-ugnayan kay UID: ${targetUID}...`, threadKey);

    try {
      api.sendMessage("hi tatagos ka ba?", targetUID, (err) => {
        if (!err) {
          safeSend(api, `✅ Naipadala na ang paunang mensahe sa pribadong inbox ni UID: ${targetUID}`, threadKey);
        } else {
          safeSend(api, `❌ Hindi maabot ang inbox ng target (Maaaring naka-lock o maling UID).`, threadKey);
        }
      });
    } catch (e) {
      safeSend(api, `❌ Nagkaaberya sa pagpapadala ng pribadong mensahe.`, threadKey);
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

    // Kumuha ng non-repetitive response galing sa memory memory pool ng PM
    const pmReply = getNonRepeatedReply(`pm_${senderKey}`, ALL_PM_REPLIES);

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

  // Kumuha ng non-repetitive response galing sa memory memory pool ng GC thread
  const reply = getNonRepeatedReply(`gc_${threadKey}`, ALL_REPLIES);

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

console.log(`[HALIMAW v67.0.0] Loaded with Neutral Expanded Vocabulary & Memory Tracker!`);
