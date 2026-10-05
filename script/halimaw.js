"use strict";

const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "halimaw",
  version: "33.0.0",
  role: 0,
  hasPrefix: false,
  aliases: ["halimaw", "mimic", "tropa"],
  description: "Human-like 1000+ Reply System",
  usage: "Send / to toggle ON/OFF",
  credits: "sinzu",
  cooldown: 1
};

// =====================================================
// ADMIN IDS
// =====================================================

const ADMIN_IDS = new Set([
  "61594951192638",
  "61594616562680",
  "61594370023022"
]);

// =====================================================
// CONFIG
// =====================================================

const DATA_PATH = path.join(
  __dirname,
  "halimaw_config.json"
);

// =====================================================
// SETTINGS
// =====================================================

const MIN_REPLY_DELAY = 6000;
const MAX_REPLY_DELAY = 14000;

const THREAD_COOLDOWN = 4000;

// 1000+ pool means this can safely remember
// hundreds of previous replies.
const RECENT_REPLY_LIMIT = 250;

// =====================================================
// RUNTIME
// =====================================================

const recentReplies = new Map();
const threadCooldowns = new Map();
const pendingReplies = new Map();

// =====================================================
// HUMAN REPLY DATA
// =====================================================

const STARTERS = [
  "ano",
  "bakit",
  "grabe",
  "seryoso",
  "teka",
  "sandali",
  "wait",
  "luh",
  "weh",
  "uy",
  "ay",
  "eh",
  "ah",
  "hmm",
  "hmmm",
  "okay",
  "sige",
  "ge",
  "oo",
  "hindi",
  "ewan",
  "parang",
  "medyo",
  "actually",
  "honestly",
  "real",
  "totoo",
  "sure",
  "malamang",
  "siguro",
  "baka",
  "possible",
  "fair",
  "gets",
  "wait lang",
  "teka lang",
  "ayos",
  "nice",
  "wow",
  "wow ah",
  "edi wow",
  "ay wow",
  "lakas",
  "ibang klase",
  "eto na",
  "ayan na",
  "eto nanaman",
  "ayan nanaman",
  "ikaw talaga",
  "grabe ka",
  "wala na",
  "tama na",
  "okay na",
  "sige na",
  "bahala ka",
  "ikaw bahala",
  "go lang",
  "tuloy mo",
  "push mo",
  "continue",
  "next",
  "later",
  "mamaya",
  "bukas na",
  "pass muna",
  "skip muna",
  "change topic",
  "iba naman"
];

const MIDDLES = [
  "ano ba",
  "ano naman",
  "ano yan",
  "ano pa",
  "ano raw",
  "ano daw",
  "bakit naman",
  "bakit ganyan",
  "bakit ganon",
  "bakit kasi",
  "bakit ngayon",
  "bakit ikaw",
  "bakit ako",
  "bakit pa",
  "bakit naman ganon",
  "paano yan",
  "paano ba",
  "paano naman",
  "paano nangyari",
  "saan galing",
  "saan mo nakuha",
  "saan patungo",
  "saan tayo",
  "sino nagsabi",
  "sino nagturo",
  "sino nag isip",
  "sino may gawa",
  "kailan pa",
  "kailan nagsimula",
  "anong point",
  "anong connect",
  "anong trip",
  "anong ganap",
  "anong problema",
  "anong nangyari",
  "anong gusto mo",
  "anong ibig sabihin",
  "may point ba",
  "may sense ba",
  "may kasunod pa",
  "may bago ba",
  "may sasabihin ka pa",
  "may plano ka ba",
  "may dahilan ba",
  "may resibo ba",
  "may proof ba",
  "may evidence ba",
  "may kwenta ba",
  "may ambag ba",
  "may point ka pala",
  "parang wala",
  "parang pilit",
  "parang sablay",
  "parang mali",
  "parang kulang",
  "parang luma",
  "parang gasgas",
  "parang familiar",
  "parang narinig ko na yan",
  "parang paulit ulit",
  "parang walang bago",
  "parang may mali",
  "parang may kulang",
  "parang di convincing",
  "parang di gumana"
];

const ENDINGS = [
  "sayo",
  "sayong lahat",
  "sa sinabi mo",
  "sa chat mo",
  "sa ginagawa mo",
  "sa trip mo",
  "sa logic mo",
  "sa point mo",
  "sa argumento mo",
  "sa kwento mo",
  "sa explanation mo",
  "sa dahilan mo",
  "sa sagot mo",
  "sa reply mo",
  "sa banat mo",
  "sa style mo",
  "sa approach mo",
  "sa plano mo",
  "sa desisyon mo",
  "sa confidence mo",
  "sa yabang mo",
  "sa timing mo",
  "sa situation na to",
  "dito",
  "diyan",
  "dyan",
  "ngayon",
  "mamaya",
  "later",
  "kanina",
  "palagi",
  "nanaman",
  "ulit",
  "pa",
  "naman",
  "nga",
  "eh",
  "lang",
  "kasi",
  "talaga",
  "siguro",
  "yata",
  "daw",
  "raw"
];

const ASAR = [
  "pinilit mo pa",
  "nag effort ka pa",
  "sayang effort",
  "medyo pilit",
  "pilit na pilit",
  "di umubra",
  "di gumana",
  "try again",
  "try mo ulit",
  "isa pa",
  "ulit ka",
  "baka sakali",
  "baka gumana",
  "malabo yan",
  "mahina pa",
  "kulang pa",
  "medyo sablay",
  "sablay nanaman",
  "huli ka",
  "nahuli kita",
  "halata naman",
  "obvious naman",
  "kitang kita",
  "wag ka magpanggap",
  "wag na mag deny",
  "aminin mo na",
  "aminin na kasi",
  "alam na namin",
  "alam na ng lahat",
  "di kami uto uto",
  "hindi convincing",
  "kulang sa convincing",
  "wala sa hulog",
  "wala sa lugar",
  "wala sa point",
  "wala sa topic",
  "naligaw ka",
  "naligaw ata",
  "nakalimutan mo point mo",
  "ano nga ulit point mo",
  "balik ka muna sa point",
  "ikot ka nang ikot",
  "ang dami mong paligoy",
  "diretso na kasi",
  "mahaba pa ba",
  "may episode pa ba",
  "lecture nanaman",
  "podcast na ba to",
  "motivational speaker",
  "teacher mode",
  "professor mode",
  "expert daw",
  "masterclass daw",
  "tutorial daw",
  "champion sa sariling mundo",
  "hari ng sariling argumento",
  "best in confidence",
  "best in yabang",
  "best in salita",
  "best in walang point",
  "angas sa chat",
  "malakas loob",
  "confidence lang ambag",
  "yabang naman",
  "lakas maka confident",
  "sige ikaw na",
  "oo ikaw na",
  "ikaw na magaling",
  "ikaw na panalo",
  "ikaw na pinaka magaling",
  "bigyan na natin ng trophy",
  "palakpakan natin",
  "congrats sayo",
  "achievement unlocked",
  "may medal ka na",
  "record holder",
  "number one ka na",
  "proud ka pa",
  "proud na proud",
  "sige proud ka dyan",
  "enjoy mo lang",
  "panindigan mo",
  "sinabi mo yan",
  "choice mo yan",
  "desisyon mo yan"
];

const NATURAL = [
  "di ko gets",
  "di ko talaga gets",
  "gets ko naman",
  "medyo gets",
  "di pa rin gets",
  "explain mo nga",
  "explain mo ulit",
  "paki explain",
  "ulit nga",
  "sabihin mo nga",
  "ano sinabi mo",
  "di ko narinig",
  "di ko alam sayo",
  "hindi ko alam",
  "wala akong alam",
  "wala akong masabi",
  "ano pa sasabihin ko",
  "ikaw bahala",
  "bahala ka dyan",
  "wag ako idamay",
  "wag nyo ko idamay",
  "ako nanaman",
  "bakit ako",
  "anong kasalanan ko",
  "wala akong ginawa",
  "innocent ako",
  "di ako kasama dyan",
  "pass ako",
  "skip muna",
  "observer lang ako",
  "nanonood lang ako",
  "nakatingin lang ako",
  "continue nyo lang",
  "go lang kayo",
  "ako na tatahimik",
  "tahimik muna ako",
  "wala akong nakita",
  "hindi ako kasali",
  "change topic",
  "next topic",
  "iba naman",
  "may bago ba",
  "ano ganap",
  "kamusta naman",
  "okay naman",
  "buhay pa",
  "gising pa",
  "online pa",
  "active pa",
  "busy ka",
  "wala ka bang ginagawa",
  "dami mong time",
  "ang sipag mo mag chat",
  "ang ingay mo",
  "daldal mo",
  "tahimik ka muna",
  "hinga ka muna",
  "pahinga ka rin",
  "matulog ka na",
  "wag ka magpuyat",
  "di ka ba napapagod",
  "may pahinga ka ba",
  "wala ka bang preno",
  "di ka talaga titigil",
  "ganyan ka talaga",
  "di ka nagbabago",
  "consistent ka ah",
  "consistent sa kalokohan",
  "at least consistent",
  "same old",
  "nothing new",
  "walang bago",
  "same energy",
  "same behavior"
];

const REACTIONS = [
  "HAHA",
  "haha",
  "hahaha",
  "HAHAHAHA",
  "lmao",
  "lol",
  "grabe HAHA",
  "natawa ako dun",
  "di ko kinaya",
  "seryoso HAHA",
  "hindi ko alam sayo HAHA",
  "lakas mo HAHA",
  "ibang klase HAHA",
  "okay HAHA",
  "sige HAHA",
  "weh HAHA",
  "ay wow HAHA",
  "edi ikaw na HAHA",
  "good one",
  "nice one",
  "nice try",
  "good try",
  "fair enough",
  "valid",
  "valid naman",
  "real",
  "facts",
  "true",
  "exactly",
  "same",
  "relate",
  "may point",
  "may tama ka",
  "may mali ka rin",
  "half point",
  "close enough"
];

const SHORT = [
  "k",
  "ok",
  "okay",
  "ge",
  "sige",
  "oo",
  "hindi",
  "ha",
  "weh",
  "luh",
  "sus",
  "ewan",
  "ewan sayo",
  "pfft",
  "hmm",
  "hmmm",
  "yawn",
  "wow",
  "nice",
  "real",
  "fake",
  "cringe",
  "weak",
  "trash",
  "corny",
  "gasgas",
  "panis",
  "tuyo",
  "sabaw",
  "lutang",
  "palpak",
  "sablay",
  "boring",
  "nakakaumay",
  "nakakatawa",
  "nakakaloka",
  "nakakainis",
  "tama na",
  "stop na",
  "enough",
  "timeout",
  "pause muna",
  "kalma",
  "relax",
  "chill",
  "easy",
  "pass",
  "next",
  "later"
];

// =====================================================
// BUILD 1000+ HUMAN-LIKE REPLIES
// =====================================================

const REPLIES = new Set();

// Add direct replies first
[
  ...SHORT,
  ...NATURAL,
  ...REACTIONS,
  ...ASAR
].forEach(x => REPLIES.add(x));

// Human combinations
for (let i = 0; i < STARTERS.length; i++) {
  for (let j = 0; j < MIDDLES.length; j++) {

    const a = STARTERS[i];
    const b = MIDDLES[j];

    REPLIES.add(`${a} ${b}`);
  }
}

// More natural combinations
for (let i = 0; i < ASAR.length; i++) {
  for (let j = 0; j < ENDINGS.length; j++) {

    const a = ASAR[i];
    const b = ENDINGS[j];

    REPLIES.add(`${a} ${b}`);
  }
}

// Natural conversational combinations
for (let i = 0; i < NATURAL.length; i++) {
  for (let j = 0; j < ENDINGS.length; j++) {

    if (i % 3 === j % 3) {
      REPLIES.add(
        `${NATURAL[i]} ${ENDINGS[j]}`
      );
    }
  }
}

// Reaction combinations
for (let i = 0; i < REACTIONS.length; i++) {
  for (let j = 0; j < SHORT.length; j++) {

    if (i % 2 === j % 2) {
      REPLIES.add(
        `${REACTIONS[i]} ${SHORT[j]}`
      );
    }
  }
}

// Convert to array
const ALL_REPLIES = Array.from(REPLIES);

// =====================================================
// LOAD CONFIG
// =====================================================

function loadConfig() {

  try {

    if (fs.existsSync(DATA_PATH)) {

      const data = JSON.parse(
        fs.readFileSync(
          DATA_PATH,
          "utf8"
        )
      );

      if (
        !Array.isArray(
          data.activeThreads
        )
      ) {
        data.activeThreads = [];
      }

      return data;
    }

  } catch (error) {

    console.error(
      "[HALIMAW] Config load error:",
      error.message
    );

  }

  return {
    activeThreads: []
  };
}

// =====================================================
// SAVE CONFIG
// =====================================================

function saveConfig(data) {

  try {

    fs.writeFileSync(
      DATA_PATH,
      JSON.stringify(
        data,
        null,
        2
      ),
      "utf8"
    );

  } catch (error) {

    console.error(
      "[HALIMAW] Config save error:",
      error.message
    );

  }
}

// =====================================================
// ADMIN CHECK
// =====================================================

function isAdmin(senderID) {
  return ADMIN_IDS.has(
    String(senderID)
  );
}

// =====================================================
// RANDOM HUMAN REPLY
// =====================================================

function getRandomReply(threadID) {

  const id = String(threadID);

  let previous =
    recentReplies.get(id) || [];

  let available =
    ALL_REPLIES.filter(
      reply =>
        !previous.includes(reply)
    );

  if (
    available.length === 0
  ) {

    previous = [];

    available =
      ALL_REPLIES.slice();

  }

  const reply =
    available[
      Math.floor(
        Math.random() *
        available.length
      )
    ];

  previous.push(reply);

  if (
    previous.length >
    RECENT_REPLY_LIMIT
  ) {
    previous.shift();
  }

  recentReplies.set(
    id,
    previous
  );

  return reply;
}

// =====================================================
// TYPING
// =====================================================

function startTyping(
  api,
  threadID
) {

  try {

    if (
      typeof api.sendTypingIndicator ===
      "function"
    ) {

      api.sendTypingIndicator(
        threadID,
        true
      );

    }

  } catch (e) {}

  const interval =
    setInterval(() => {

      try {

        if (
          typeof api.sendTypingIndicator ===
          "function"
        ) {

          api.sendTypingIndicator(
            threadID,
            true
          );

        }

      } catch (e) {}

    }, 4000);

  return interval;
}

// =====================================================
// STOP TYPING
// =====================================================

function stopTyping(
  api,
  threadID,
  interval
) {

  clearInterval(interval);

  try {

    if (
      typeof api.sendTypingIndicator ===
      "function"
    ) {

      api.sendTypingIndicator(
        threadID,
        false
      );

    }

  } catch (e) {}
}

// =====================================================
// REACTION
// =====================================================

function react(
  api,
  messageID
) {

  try {

    if (
      typeof api.setMessageReaction ===
      "function"
    ) {

      api.setMessageReaction(
        "❤",
        messageID,
        () => {},
        true
      );

    }

  } catch (e) {}
}

// =====================================================
// TOGGLE
// =====================================================

async function toggleThread({
  api,
  event,
  config
}) {

  const {
    threadID,
    senderID,
    messageID
  } = event;

  // ADMIN ONLY
  if (
    !isAdmin(senderID)
  ) {
    return;
  }

  const id =
    String(threadID);

  const index =
    config.activeThreads.indexOf(id);

  // -------------------------
  // ON
  // -------------------------

  if (index === -1) {

    config.activeThreads.push(id);

    saveConfig(config);

    react(
      api,
      messageID
    );

    console.log(
      `[HALIMAW] ON: ${id}`
    );

    return;
  }

  // -------------------------
  // OFF
  // -------------------------

  config.activeThreads.splice(
    index,
    1
  );

  saveConfig(config);

  react(
    api,
    messageID
  );

  console.log(
    `[HALIMAW] OFF: ${id}`
  );
}

// =====================================================
// SEND
// =====================================================

function sendReply({
  api,
  threadID,
  messageID,
  reply
}) {

  try {

    api.sendMessage(
      {
        body: reply
      },
      threadID,
      () => {},
      messageID
    );

  } catch (error) {

    console.error(
      "[HALIMAW] Send error:",
      error.message
    );

  }
}

// =====================================================
// MAIN EVENT
// =====================================================

module.exports.handleEvent =
async function ({ api, event }) {

  const {
    threadID,
    senderID,
    body,
    messageID
  } = event;

  if (!body) {
    return;
  }

  // ===================================================
  // BOT ID
  // ===================================================

  let botID = null;

  try {
    botID =
      api.getCurrentUserID();
  } catch (e) {}

  // Don't reply to itself
  if (
    botID &&
    String(senderID) ===
    String(botID)
  ) {
    return;
  }

  const text =
    String(body).trim();

  const config =
    loadConfig();

  // ===================================================
  // ADMIN "/" TOGGLE
  // ===================================================

  if (text === "/") {

    await toggleThread({
      api,
      event,
      config
    });

    return;
  }

  // Ignore //, ///, etc.
  if (/^\/+$/.test(text)) {
    return;
  }

  // ===================================================
  // ACTIVE CHECK
  // ===================================================

  if (
    !config.activeThreads.includes(
      String(threadID)
    )
  ) {
    return;
  }

  // ===================================================
  // THREAD COOLDOWN
  // ===================================================

  const now =
    Date.now();

  const last =
    threadCooldowns.get(
      String(threadID)
    ) || 0;

  if (
    now - last <
    THREAD_COOLDOWN
  ) {
    return;
  }

  threadCooldowns.set(
    String(threadID),
    now
  );

  // ===================================================
  // PENDING CHECK
  // ===================================================

  const threadKey =
    String(threadID);

  if (
    pendingReplies.has(
      threadKey
    )
  ) {
    return;
  }

  // ===================================================
  // GET REPLY
  // ===================================================

  const reply =
    getRandomReply(
      threadID
    );

  // ===================================================
  // RANDOM DELAY
  // ===================================================

  const delay =
    Math.floor(
      Math.random() *
      (
        MAX_REPLY_DELAY -
        MIN_REPLY_DELAY +
        1
      )
    ) +
    MIN_REPLY_DELAY;

  // ===================================================
  // TYPING
  // ===================================================

  const typing =
    startTyping(
      api,
      threadID
    );

  pendingReplies.set(
    threadKey,
    true
  );

  // ===================================================
  // SEND
  // ===================================================

  setTimeout(() => {

    pendingReplies.delete(
      threadKey
    );

    stopTyping(
      api,
      threadID,
      typing
    );

    sendReply({
      api,
      threadID,
      messageID,
      reply
    });

  }, delay);
};

// =====================================================
// RUN
// =====================================================

module.exports.run =
async function () {
  return;
};

// =====================================================
// DEBUG INFO
// =====================================================

console.log(
  `[HALIMAW] Loaded ${ALL_REPLIES.length} human replies.`
);
