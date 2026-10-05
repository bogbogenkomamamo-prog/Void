"use strict";

const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "halimaw",
  version: "36.0.0",
  role: 0,
  hasPrefix: false,
  aliases: ["halimaw", "mimic", "tropa"],
  description: "Pure Asar / Dry Bardagulan Reply System",
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
// REPLY SETTINGS
// =====================================================

const MIN_REPLY_DELAY = 8000;
const MAX_REPLY_DELAY = 18000;

const THREAD_COOLDOWN = 12000;
const CHANCE_TO_REPLY = 0.75;

const RECENT_REPLY_LIMIT = 250;

// =====================================================
// RUNTIME
// =====================================================

const recentReplies = new Map();
const threadCooldowns = new Map();
const pendingReplies = new Map();

// =====================================================
// PURE ASAR — STARTERS
// =====================================================

const STARTERS = [
  "ano ba",
  "bakit ba",
  "grabe ka",
  "seryoso ka",
  "teka nga",
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
  "okay ka lang",
  "sige ka",
  "ge ka",
  "oo na",
  "hindi nga",
  "ewan sayo",
  "parang",
  "medyo",
  "actually",
  "honestly",
  "totoo ba",
  "sure ka",
  "malamang",
  "siguro",
  "baka",
  "possible",
  "gets mo ba",
  "wait lang",
  "teka lang",
  "ayos ka lang",
  "eto na naman",
  "ayan na naman",
  "eto nanaman",
  "ayan nanaman",
  "ikaw talaga",
  "grabe naman",
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
  "iba naman",
  "change topic",
  "ulit na naman",
  "paulit ulit",
  "same ka pa rin",
  "ganyan ka talaga",
  "di ka talaga",
  "wala ka talagang",
  "may bago ka ba"
];

// =====================================================
// PURE ASAR — MIDDLES
// =====================================================

const MIDDLES = [
  "ano ba yan",
  "ano naman yan",
  "ano yan",
  "ano na naman",
  "ano pa ba",
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
  "bakit parang ewan",
  "bakit parang pilit",
  "bakit parang wala",
  "paano yan",
  "paano ba yan",
  "paano naman",
  "paano nangyari",
  "paano mo naisip yan",
  "paano naging ganyan",
  "saan galing yan",
  "saan mo napulot yan",
  "saan mo nakuha yan",
  "saan papunta yan",
  "saan ka pupunta",
  "sino nagsabi sayo",
  "sino nagturo sayo",
  "sino nag isip nyan",
  "sino may gawa nyan",
  "kailan pa yan",
  "kailan nagsimula yan",
  "anong point",
  "anong connect",
  "anong trip",
  "anong ganap",
  "anong problema",
  "anong nangyari",
  "anong gusto mo",
  "anong pinaglalaban mo",
  "ano ba talagang point",
  "may point ba yan",
  "may sense ba yan",
  "may dahilan ba",
  "may resibo ba",
  "may proof ba",
  "may evidence ba",
  "may kwenta ba",
  "may ambag ba",
  "may kasunod pa ba",
  "may sasabihin ka pa",
  "may plano ka ba",
  "may bago ka ba",
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
  "parang di gumana",
  "parang di umubra",
  "parang minadali",
  "parang random",
  "parang wala lang"
];

// =====================================================
// PURE ASAR — ENDINGS
// =====================================================

const ENDINGS = [
  "sayo",
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
  "sa drama mo",
  "sa typing mo",
  "sa reasoning mo",
  "sa explanation mo",
  "dito",
  "dyan",
  "diyan",
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

// =====================================================
// PURE ASAR — MAIN
// =====================================================

const ASAR = [
  "pinilit mo pa",
  "nag effort ka pa",
  "sayang effort",
  "sayang typing",
  "sayang oras",
  "sayang character",
  "sayang paliwanag",
  "medyo pilit",
  "pilit na pilit",
  "sobrang pilit",
  "halatang pilit",
  "di umubra",
  "di gumana",
  "di tumama",
  "di nag land",
  "try again",
  "try mo ulit",
  "isa pa",
  "ulit ka",
  "baka sakali",
  "baka gumana",
  "malabo yan",
  "mahina pa",
  "mahina talaga",
  "kulang pa",
  "kulang na kulang",
  "bitin",
  "bitin yung banat",
  "bitin yung point",
  "bitin yung paliwanag",
  "sablay",
  "sablay nanaman",
  "palpak nanaman",
  "maling direction",
  "naligaw ka",
  "naligaw ata",
  "huli ka",
  "nahuli kita",
  "halata naman",
  "obvious naman",
  "kitang kita",
  "alam na agad",
  "alam na namin",
  "alam na ng lahat",
  "wag ka magpanggap",
  "wag ka mag deny",
  "wag mo itago",
  "aminin mo na",
  "aminin na kasi",
  "aminin mo na lang",
  "wag na magpalusot",
  "palusot pa",
  "excuse nanaman",
  "same excuse",
  "same script",
  "same story",
  "same banat",
  "same style",
  "same drama",
  "same kalokohan",
  "ulit ulit",
  "paulit ulit",
  "ikot ka nang ikot",
  "paligoy ligoy",
  "ang dami mong paligoy",
  "ang haba naman",
  "mahaba pa ba",
  "diretso na kasi",
  "diretsohin mo na",
  "ano nga ulit point mo",
  "nakalimutan mo point mo",
  "balik ka muna sa point",
  "wala sa hulog",
  "wala sa lugar",
  "wala sa point",
  "wala sa topic",
  "wala namang connect",
  "walang connect",
  "walang kwenta yung ikot",
  "di mo rin alam",
  "di mo alam sinasabi mo",
  "di mo alam point mo",
  "di mo alam ginagawa mo",
  "parang nag iisip ka pa",
  "nag iisip ka pa ba",
  "pinag isipan mo ba yan",
  "pinag isipan mo talaga yan",
  "minadali mo yata",
  "minadali nanaman",
  "random nanaman",
  "lutang nanaman",
  "sabaw nanaman",
  "nalito ka na",
  "naligaw ka na",
  "wala ka na sa topic",
  "lumayo ka na sa point",
  "lumayo ka na naman",
  "iba na sinasabi mo",
  "nag iba na kwento",
  "nagpalit ka nanaman",
  "biglang iba",
  "biglang liko",
  "liko nanaman",
  "may plot twist na naman",
  "may bagong excuse na naman",
  "may bagong palusot na naman",
  "may episode pa ba",
  "may part two pa ba",
  "may sequel pa ba",
  "podcast na ba to",
  "lecture nanaman",
  "lecture mode",
  "teacher mode",
  "professor mode",
  "expert mode",
  "masterclass daw",
  "tutorial daw",
  "motivational speaker nanaman",
  "life coach yarn",
  "lawyer yarn",
  "debater yarn",
  "analyst yarn",
  "commentator yarn",
  "tagapagsalita yarn",
  "may seminar pa ba",
  "may powerpoint pa ba",
  "may presentation pa ba",
  "may assignment pa ba",
  "may quiz pa ba",
  "may attendance pa ba",
  "may recitation pa ba",
  "may thesis pa ba",
  "may defense pa ba",
  "defense nanaman",
  "argument nanaman",
  "debate nanaman",
  "discussion na walang katapusan",
  "sagot na walang point",
  "explanation na walang patutunguhan",
  "kwento na paikot ikot",
  "salita nang salita",
  "typing nang typing",
  "chat nang chat",
  "daldal nang daldal",
  "ingay nang ingay",
  "wala nang preno",
  "di ka talaga tumitigil",
  "di ka talaga nauubusan",
  "may quota ka ba sa chat",
  "may target ka bang characters",
  "may bayad ba kada salita",
  "may points ba kada message",
  "may reward ba sa daldal",
  "may achievement ba sa haba",
  "may medal ba sa typing",
  "may trophy ba sa paligoy",
  "may certificate ba pagkatapos",
  "may diploma ka ba dyan",
  "graduation na ba",
  "orientation pa ba to",
  "seminar na ata",
  "radio show na ata",
  "podcast na ata",
  "news anchor ka ba",
  "commentator ka ba",
  "press conference na ba",
  "press release na ba",
  "official statement na ba",
  "statement mo pa talaga",
  "may closing remarks pa ba",
  "may final answer pa ba",
  "may bonus round pa ba"
];

// =====================================================
// PURE ASAR — NATURAL
// =====================================================

const NATURAL = [
  "di ko gets",
  "di ko talaga gets",
  "di ko pa rin gets",
  "di ko alam sayo",
  "hindi ko alam sayo",
  "wala akong maintindihan",
  "wala akong masabi",
  "ano pa sasabihin ko",
  "explain mo nga",
  "explain mo ulit",
  "paki explain",
  "ulit nga",
  "sabihin mo nga",
  "ano sinabi mo",
  "ano raw",
  "ano daw",
  "bakit ganon",
  "bakit ganyan",
  "ano ba talaga",
  "ano ba kasi",
  "ano na naman",
  "eto na naman",
  "ayan na naman",
  "eto nanaman siya",
  "ayan nanaman siya",
  "same na naman",
  "ulit na naman",
  "paulit ulit na naman",
  "wala ka bang bago",
  "may bago ka ba",
  "same old",
  "nothing new",
  "walang bago",
  "same energy",
  "same behavior",
  "same excuse",
  "same story",
  "same script",
  "same banat",
  "same style",
  "ganyan ka talaga",
  "di ka nagbabago",
  "consistent ka sa kalokohan",
  "di ka talaga titigil",
  "wala kang preno",
  "ang ingay mo",
  "daldal mo",
  "dami mong sinasabi",
  "ang dami mong chat",
  "ang sipag mo magtype",
  "ang sipag mo mag explain",
  "ang haba ng sinabi mo",
  "ang haba ng ikot mo",
  "ang haba ng paligoy mo",
  "tahimik ka muna",
  "hinga ka muna",
  "pahinga ka muna",
  "matulog ka na",
  "wag ka magpuyat",
  "di ka ba napapagod",
  "may pahinga ka ba",
  "wala ka bang ginagawa",
  "dami mong time",
  "busy ka ba talaga",
  "online ka pa rin",
  "active ka pa rin",
  "gising ka pa",
  "buhay ka pa",
  "observer na lang",
  "manood ka muna",
  "tahimik ka muna",
  "wag ka muna magsalita",
  "wag ka muna mag explain",
  "wag mo na pahabain",
  "wag mo na ikutin",
  "diretso na",
  "short version naman",
  "summary naman",
  "one sentence lang",
  "wag essay",
  "wag thesis",
  "wag dissertation",
  "wag lecture",
  "wag seminar",
  "wag podcast",
  "wag press conference",
  "wag speech",
  "wag campaign speech",
  "wag closing remarks",
  "wag ka nang mag drama",
  "wag ka nang magpalusot",
  "wag ka nang magpaliwanag",
  "wag ka nang mag imbento"
];

// =====================================================
// PURE ASAR — SHORT
// =====================================================

const SHORT = [
  "k",
  "ok",
  "okay",
  "ge",
  "sige",
  "ha",
  "weh",
  "luh",
  "sus",
  "ewan",
  "ewan sayo",
  "pfft",
  "hmm",
  "hmmm",
  "hm",
  "yawn",
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
  "basic",
  "generic",
  "pilit",
  "mahina",
  "kulang",
  "bitin",
  "malabo",
  "random",
  "lito",
  "ligaw",
  "paikot",
  "paligoy",
  "daldal",
  "ingay",
  "essay",
  "thesis",
  "lecture",
  "seminar",
  "podcast",
  "drama",
  "excuse",
  "palusot",
  "ulit",
  "again",
  "next",
  "pass",
  "skip",
  "stop",
  "tama na",
  "enough",
  "pause",
  "kalma",
  "relax",
  "chill",
  "slow",
  "tigil",
  "quit",
  "move on",
  "iba naman"
];

// =====================================================
// PURE ASAR — EXTRA
// =====================================================

const EXTRA_ASAR = [
  "ang tapang sa chat",
  "tapang sa keyboard",
  "keyboard warrior nanaman",
  "chat warrior nanaman",
  "typing warrior",
  "lakas ng loob sa screen",
  "sa chat lang malakas",
  "sa typing lang matapang",
  "confidence na walang basehan",
  "yabang na walang laman",
  "angas na walang point",
  "salita na walang patutunguhan",
  "typing na walang direction",
  "explanation na paikot",
  "argument na paikot",
  "logic na paikot",
  "reasoning na paikot",
  "point na nawawala",
  "topic na nawawala",
  "kwento na nawawala",
  "direction na nawawala",
  "focus na nawawala",
  "sense na nawawala",
  "may sariling mundo",
  "may sariling universe",
  "may sariling timeline",
  "may sariling logic",
  "may sariling version",
  "may sariling kwento",
  "may sariling rules",
  "may sariling batas",
  "sariling interpretation",
  "sariling definition",
  "sariling conclusion",
  "sariling problema",
  "sariling sagot",
  "sariling tanong",
  "tanong mo ikaw din sumagot",
  "ikaw na rin mag explain",
  "ikaw na rin sumagot",
  "ikaw na rin mag debate",
  "ikaw na rin mag judge",
  "ikaw na rin mag conclude",
  "ikaw na rin mag close",
  "wala nang kailangan idagdag",
  "sobra na yung ikot",
  "sobra na yung drama",
  "sobra na yung palusot",
  "sobra na yung essay",
  "sobra na yung typing",
  "sobra na yung explanation",
  "sobra na yung confidence",
  "sobra na yung daldal",
  "parang may sariling show",
  "parang may sariling programa",
  "parang may live broadcast",
  "parang may audience",
  "parang may press",
  "parang may interview",
  "parang may debate stage",
  "parang may podium",
  "parang may microphone",
  "parang may teleprompter",
  "parang scripted",
  "parang rehearsed",
  "parang pinaghandaan nang todo",
  "parang may speech",
  "parang may campaign",
  "parang may election",
  "parang may announcement",
  "parang may declaration",
  "parang may manifesto",
  "parang may constitution",
  "parang may republic",
  "parang may sariling bansa",
  "parang may sariling government",
  "parang may sariling department",
  "parang may sariling ministry",
  "parang may sariling committee",
  "parang may sariling board",
  "parang may sariling council",
  "parang may sariling parliament",
  "parang may sariling congress",
  "parang may sariling senate",
  "parang may sariling hearing",
  "parang may court session",
  "parang may trial",
  "parang may defense",
  "parang may prosecution",
  "parang may verdict",
  "parang may appeal",
  "parang may case number",
  "parang may docket",
  "parang may affidavit",
  "parang may sworn statement",
  "parang may witness",
  "parang may evidence room",
  "parang may investigation",
  "parang may detective",
  "parang may interrogation",
  "parang may documentary",
  "parang may documentary series",
  "parang may season two",
  "parang may season three",
  "parang may extended version",
  "parang may director's cut",
  "parang may deleted scenes",
  "parang may behind the scenes",
  "parang may bonus episode",
  "parang may filler arc",
  "filler na naman",
  "side quest na naman",
  "lumayo na sa main quest",
  "wala na sa storyline",
  "wala na sa plot",
  "plot hole nanaman",
  "plot armor nanaman",
  "character development wala",
  "character arc nawala",
  "storyline nag crash",
  "script nag error",
  "dialogue nag loading",
  "brain loading",
  "processing pa",
  "buffering pa",
  "loading pa yung point",
  "nag timeout yung logic",
  "connection lost sa point",
  "signal lost sa explanation",
  "system error sa reasoning",
  "restart mo muna isip mo",
  "reboot muna",
  "refresh muna",
  "reset muna",
  "balik sa main topic",
  "balik sa simula",
  "ulit from the start",
  "start over",
  "restart conversation",
  "new save file",
  "bagong attempt na naman",
  "second attempt",
  "third attempt",
  "ilang attempt na yan",
  "ilang take na ba",
  "ilang retake pa",
  "ilang revision pa",
  "ilang draft pa",
  "ilang version pa",
  "version number na naman",
  "patch notes na ba",
  "update na naman",
  "bug pa rin",
  "same bug",
  "same error",
  "same problem",
  "same nonsense",
  "same kalokohan"
];

// =====================================================
// BUILD REPLY POOL
// =====================================================

const REPLIES = new Set();

[
  ...STARTERS,
  ...MIDDLES,
  ...ENDINGS,
  ...ASAR,
  ...NATURAL,
  ...SHORT,
  ...EXTRA_ASAR
].forEach(reply => {
  REPLIES.add(reply);
});

// =====================================================
// STARTER + MIDDLE
// =====================================================

for (let i = 0; i < STARTERS.length; i++) {
  for (let j = 0; j < MIDDLES.length; j++) {
    REPLIES.add(
      `${STARTERS[i]} ${MIDDLES[j]}`
    );
  }
}

// =====================================================
// ASAR + ENDING
// =====================================================

for (let i = 0; i < ASAR.length; i++) {
  for (let j = 0; j < ENDINGS.length; j++) {
    REPLIES.add(
      `${ASAR[i]} ${ENDINGS[j]}`
    );
  }
}

// =====================================================
// NATURAL + ENDING
// =====================================================

for (let i = 0; i < NATURAL.length; i++) {
  for (let j = 0; j < ENDINGS.length; j++) {
    if ((i + j) % 3 === 0) {
      REPLIES.add(
        `${NATURAL[i]} ${ENDINGS[j]}`
      );
    }
  }
}

// =====================================================
// EXTRA ASAR + ENDING
// =====================================================

for (let i = 0; i < EXTRA_ASAR.length; i++) {
  for (let j = 0; j < ENDINGS.length; j++) {
    if ((i + j) % 5 === 0) {
      REPLIES.add(
        `${EXTRA_ASAR[i]} ${ENDINGS[j]}`
      );
    }
  }
}

// =====================================================
// ASAR + SHORT
// =====================================================

for (let i = 0; i < ASAR.length; i++) {
  for (let j = 0; j < SHORT.length; j++) {
    if ((i + j) % 4 === 0) {
      REPLIES.add(
        `${ASAR[i]} ${SHORT[j]}`
      );
    }
  }
}

// =====================================================
// EXTRA ASAR + SHORT
// =====================================================

for (let i = 0; i < EXTRA_ASAR.length; i++) {
  for (let j = 0; j < SHORT.length; j++) {
    if ((i + j) % 6 === 0) {
      REPLIES.add(
        `${EXTRA_ASAR[i]} ${SHORT[j]}`
      );
    }
  }
}

// =====================================================
// FINAL REPLY ARRAY
// =====================================================

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

      if (!Array.isArray(data.activeThreads)) {
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
// RANDOM REPLY
// =====================================================

function getRandomReply(threadID) {
  const id = String(threadID);

  let previous =
    recentReplies.get(id) || [];

  let available =
    ALL_REPLIES.filter(
      reply => !previous.includes(reply)
    );

  if (available.length === 0) {
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
// TOGGLE THREAD
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

  if (
    !isAdmin(senderID)
  ) {
    return;
  }

  const id =
    String(threadID);

  const index =
    config.activeThreads.indexOf(id);

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
// SEND REPLY
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
async function ({
  api,
  event
}) {

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
  // IGNORE BOT'S OWN MESSAGE
  // ===================================================

  let botID = null;

  try {
    botID =
      api.getCurrentUserID();
  } catch (e) {}

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
  // TOGGLE
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
  // ACTIVE THREAD CHECK
  // ===================================================

  if (
    !config.activeThreads.includes(
      String(threadID)
    )
  ) {
    return;
  }

  // ===================================================
  // RANDOM SKIP
  // ===================================================

  if (
    Math.random() >
    CHANCE_TO_REPLY
  ) {
    return;
  }

  // ===================================================
  // THREAD COOLDOWN
  // ===================================================

  const threadKey =
    String(threadID);

  const now =
    Date.now();

  const last =
    threadCooldowns.get(
      threadKey
    ) || 0;

  if (
    now - last <
    THREAD_COOLDOWN
  ) {
    return;
  }

  threadCooldowns.set(
    threadKey,
    now
  );

  // ===================================================
  // PENDING CHECK
  // ===================================================

  if (
    pendingReplies.has(
      threadKey
    )
  ) {
    return;
  }

  // ===================================================
  // SELECT RANDOM PURE-ASAR REPLY
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
  // TYPING INDICATOR
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
// LOADED
// =====================================================

console.log(
  `[HALIMAW] Loaded ${ALL_REPLIES.length} pure-asar replies.`
);
