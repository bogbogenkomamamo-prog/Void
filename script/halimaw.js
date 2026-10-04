"use strict";

const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "halimaw",
  version: "21.0.0",
  role: 0,
  hasPrefix: false,
  aliases: ["halimaw", "mimic", "tropa"],
  description: "Prefixless Tarantadong Halimaw - every message auto reply",
  usage: "Send '.' to toggle ON/OFF",
  credits: "sinzu",
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

const DATA_PATH = path.join(
  __dirname,
  "halimaw_config.json"
);

// =====================================================
// SETTINGS
// =====================================================

// Bawat message may sariling 10-second delay.
const REPLY_DELAY = 10000;

// Ilang previous replies ang iiwasang ulitin sa isang thread.
const RECENT_REPLY_LIMIT = 50;

// =====================================================
// RUNTIME MEMORY
// =====================================================

const recentReplies = new Map();

// =====================================================
// REPLY POOL
// =====================================================

const ALL_REPLIES = [

  // SHORT
  "edi wow",
  "sabi mo e",
  "tapos?",
  "ha?",
  "ah ok",
  "k",
  "ok",
  "sus",
  "ewan",
  "weh",
  "so?",
  "then?",
  "and?",
  "sige",
  "go",
  "ayan na naman",
  "eto na naman tayo",
  "wala na naman",
  "ano na naman yan",
  "anong pake ko",
  "pakialam ko",
  "sino nagtanong",
  "may nagtanong ba",
  "bahala ka",
  "ikaw na",
  "edi ikaw na",
  "wow naman",
  "astig",
  "lakas",
  "angas ah",
  "grabe ka",
  "kalma",
  "relax",
  "hinga muna",
  "tulog ka na",
  "matulog ka",
  "antok ako",
  "nakakatamad ka",
  "ang boring",
  "boring mo",
  "ang haba",
  "di ko binasa",
  "skip",
  "next",
  "pass",
  "wala akong gana",
  "mamaya na",
  "wag na",
  "tama na",
  "ayoko na",
  "sakit sa ulo",
  "daldal",
  "daldal mo",
  "ingay",
  "ang ingay mo",
  "puro ka salita",
  "sana all",

  // PANGBARA
  "iyak na",
  "pikon ka?",
  "galit?",
  "triggered?",
  "affected?",
  "tinamaan?",
  "aray",
  "ouch",
  "luh",
  "hala",
  "omsim",
  "legit ba",
  "sure ka",
  "seryoso?",
  "talaga ba",
  "nice try",
  "good luck",
  "better luck next time",
  "try again",
  "wag ka ganyan",
  "umayos ka",
  "ayos ayos din",
  "relax ka lang",
  "calm down bro",
  "wehh",
  "hala ka",
  "edi ikaw",
  "yun lang?",
  "yun na yon?",
  "wala na?",
  "hina",
  "mahina",
  "sablay",
  "palpak",
  "epic fail",

  // CALL OUT
  "uy",
  "oy",
  "psst",
  "paps",
  "lods",
  "tol",
  "pre",
  "boss",
  "master",
  "idol",
  "sir",
  "chief",
  "bro",
  "beh",
  "pards",
  "kosa",
  "kumander",
  "tropa",
  "repapips",

  // MEDIUM
  "ano bang point mo",
  "saan mo naman napulot yan",
  "anong pinaglalaban mo ngayon",
  "bakit parang galit na galit ka",
  "normal ka lang ba",
  "ano na naman pinag-iisip mo",
  "parang may kailangan kang patunayan ah",
  "bakit kailangan mo pang ipilit",
  "gets ko naman sinasabi mo pero ang ingay",
  "may point ka ba o trip mo lang talaga magsalita",
  "parang ikaw mismo di mo alam sinasabi mo",
  "ang seryoso mo naman sa bagay na wala namang bigat",
  "bro relax lang",
  "huminga ka muna bago ka magreply",
  "wag mong dibdibin lahat",
  "parang personal na personal sayo",
  "okay ka lang ba dyan",
  "anong nangyari sayo at ganyan ka",
  "may pinagdadaanan ka ba",
  "bakit parang kailangan mo ng validation",
  "hindi naman kita inaaway",
  "ikaw tong nagdadala ng gulo dito",
  "ikaw rin naman nagsimula",
  "wag kang masyadong invested",
  "masyado kang seryoso",
  "parang ikaw lang ang may pake",
  "wala namang contest dito",
  "di mo kailangan patunayan sarili mo",
  "chill ka lang",
  "wag mong ubusin energy mo dyan",
  "ang effort mo naman",
  "pinag-isipan mo pa talaga yan",
  "ayan na naman yung confidence",

  // LOGIC
  "confidence lang kulang sa evidence",
  "may resibo ka ba",
  "saan ang source",
  "source: trust me bro",
  "parang gawa-gawa lang",
  "interesting take",
  "ibang klase ka talaga",
  "unique yung logic mo",
  "creative ng reasoning mo",
  "di ko alam kung seryoso ka",
  "baka joke lang yan",
  "sabihin mo na lang diretso",
  "wow may confidence kahit kulang sa dahilan",
  "congratulations may speech ka na naman",
  "palakpakan natin para masaya",
  "sige lang baka maniwala ka rin sa sarili mo",
  "ang galing mo talaga mag-imagine",
  "nice story bro",
  "solid fiction",
  "maganda yung imagination mo",
  "parang convincing kung di lang obvious",
  "ang lakas ng plot twist",
  "kala mo may impact lahat ng sinasabi mo",
  "nag-iingay ka na naman para lang mapansin",
  "hindi ka boss, ikaw lang nagbibigay ng titulo sa sarili mo",
  "ang lakas mong magbitaw ng linya parang may award sa dulo",

  // EXTRA
  "bro ano yan",
  "ano bang trip mo",
  "may bago ka bang script",
  "same energy na naman",
  "eto nanaman ang presentation",
  "may pa speech pa",
  "grabe invested",
  "parang kailangan talaga malaman namin",
  "salamat sa information na walang nagtatanong",
  "noted with absolutely no interest",
  "sige noted",
  "may sequel pa ba",
  "part two kailan",
  "mahaba pero walang dating",
  "maikli pero walang point",
  "may laman ba yan",
  "parang kulang sa thought process",
  "try mo ulit",
  "restart mo utak mo",
  "loading pa ba",
  "buffering ka ba",
  "wait lang naiintindihan ko pa",
  "teka naglo-load ako",
  "sandali lang natawa ako",
  "di ko alam kung matatawa ako o maaawa",
  "interesting behavior",
  "behavior check",
  "character development when",
  "development arc when",
  "plot armor malala",
  "main character na naman",
  "background character muna",
  "side quest ka lang",
  "optional dialogue lang yan",
  "skip dialogue",
  "skip cutscene",
  "next topic",
  "move on tayo",
  "wala na bang iba",
  "same old story",
  "same old argument",
  "paulit ulit ka",
  "parang sirang plaka",
  "narinig na namin yan",
  "alam na namin",
  "gets na",
  "okay na",
  "enough na",
  "sobra na",
  "tapos na dapat",

  // INTERNET STYLE
  "skill issue",
  "reading comprehension check",
  "comprehension left the chat",
  "common sense left the chat",
  "logic went offline",
  "brain currently unavailable",
  "system error",
  "404 point not found",
  "loading argument",
  "argument not found",
  "source not found",
  "evidence not found",
  "receipts unavailable",
  "trust me bro deluxe",
  "premium confidence",
  "free trial logic",
  "limited edition reasoning",
  "budget argument",
  "low battery argument",
  "almost convincing",
  "close enough",
  "nice attempt",
  "good effort",
  "respect the confidence",
  "not the execution though",
  "malakas ang loob",
  "mahina ang argumento",
  "confidence: 100",
  "evidence: 0",
  "volume: 100",
  "point: 0",
  "effort: sobra",
  "result: questionable",

  // PROOF
  "ang tapang mo naman",
  "ang lakas ng loob",
  "pero saan ang proof",
  "proof muna bago yabang",
  "resibo muna",
  "pakita mo muna",
  "source muna bago speech",
  "wag puro salita",
  "actions naman",
  "less talk",
  "more proof",
  "sabi mo yan",
  "ikaw nagsabi nyan",
  "panindigan mo",
  "good luck sa defense",
  "defend mo yan",
  "explain mo nga",
  "explain harder",
  "interesting defense",
  "weak defense",
  "solid excuse",
  "nice excuse",
  "classic excuse",

  // GC
  "expected",
  "predictable",
  "very original",
  "seen this before",
  "nothing new",
  "same formula",
  "same energy",
  "same argument",
  "same person",
  "same problem",
  "another day another speech",
  "another episode",
  "another paragraph",
  "another explanation",
  "another excuse",
  "another plot twist",
  "another confidence boost",
  "another unnecessary announcement",
  "another message nobody requested",
  "bro really sent that",
  "bro actually typed that",
  "bro thought that worked",
  "bro believed that",
  "bro committed to it",
  "bro doubled down",
  "bro tripled down",
  "bro won't let it go",
  "bro needs a timeout",
  "bro needs a break",
  "bro needs water",
  "bro breathe",
  "bro calm down",
  "bro take five",
  "bro log off",
  "bro go outside",
  "bro touch grass",
  "grass is waiting",
  "the grass misses you",
  "internet muna pahinga",
  "social battery check",
  "mental bandwidth unavailable",
  "group chat bandwidth exhausted",
  "GC has suffered enough",
  "GC did not ask",
  "nobody ordered this",
  "who requested this",
  "who invited the essay",
  "why is there a dissertation",

  // SCHOOL / SPEECH
  "thesis defense na ba",
  "oral recitation ba to",
  "may reporting?",
  "attendance check",
  "present pero walang point",
  "present sir",
  "present with concerns",
  "noted",
  "acknowledged",
  "received",
  "message received",
  "information received",
  "emotionally unavailable",
  "mentally absent",
  "physically here mentally gone",
  "wala akong ambag dito",
  "continue nyo lang",
  "pinapanood ko lang",
  "observer mode",
  "spectator mode",
  "lurker mode",
  "silent mode",
  "wala akong pake mode",
  "interesting conversation",
  "carry on",
  "proceed",
  "continue",
  "go ahead",
  "keep going",
  "don't let me stop you",

  // POINTLESS
  "sige lang",
  "tuloy mo lang",
  "ituloy mo",
  "push mo yan",
  "panindigan mo",
  "commit ka na",
  "wag ka umatras",
  "nandito na tayo eh",
  "sayang effort",
  "sayang typing",
  "sayang oras",
  "sayang data",
  "sayang keyboard",
  "sayang energy",
  "sayang paragraph",
  "sayang punctuation",
  "sayang confidence",
  "sayang opportunity",
  "almost there",
  "malapit na",
  "konti na lang",
  "may point na sana",
  "nawala lang",
  "saan napunta yung point",
  "nawala sa intro",
  "nawala sa middle",
  "wala sa ending",
  "buong message hinahanap yung point",
  "quest for the point",
  "point missing in action",
  "argument went missing",
  "logic went missing",
  "common sense went missing",
  "context went missing",

  // TAGALOG
  "eto nanaman tayo",
  "round two",
  "round three",
  "fight scene na ba",
  "debate tournament?",
  "calm down champion",
  "relax professor",
  "okay philosopher",
  "easy there scholar",
  "slow down genius",
  "easy genius",
  "take it easy",
  "wag kang ma-pressure",
  "di naman deadline",
  "di naman graded",
  "di naman thesis",
  "di naman defense",
  "di naman court hearing",
  "di naman national issue",
  "normal conversation lang",
  "GC lang to bro",
  "chat lang tayo",
  "hindi ito debate stage",
  "hindi ito courtroom",
  "hindi ito campaign speech",
  "hindi ito TED Talk",
  "hindi ito documentary",
  "hindi ito final exam",
  "hindi ito entrance exam",
  "hindi kailangan ng essay",
  "one sentence lang sana",
  "short answer lang",
  "multiple choice ba yan",
  "A B C D?",
  "true or false?",
  "essay portion ba?",
  "bonus question?",
  "extra credit?",
  "okay professor",
  "class dismissed",
  "meeting adjourned",
  "session ended",
  "thank you for attending",
  "thank you for your TED Talk",
  "thank you next",
  "next speaker please",
  "mic off muna",
  "mute muna tayo",
  "commercial break",
  "cut",
  "end scene",
  "roll credits",
  "fin",
  "the end",
  "wala nang sequel",
  "closing remarks na",
  "last message na dapat",
  "last na talaga?",
  "sure last?",
  "promise?",

  // LORE
  "sige ikaw na huling magmessage",
  "ikaw na winner",
  "congratulations",
  "champion ka na",
  "gold medal",
  "trophy incoming",
  "certificate of confidence",
  "award for persistence",
  "award for longest message",
  "award for unnecessary details",
  "award for confidence",
  "award for doubling down",
  "award for not letting go",
  "achievement unlocked",
  "new record",
  "personal best",
  "world record yata",
  "legendary commitment",
  "dedication talaga",
  "consistent ka",
  "at least consistent",
  "predictably predictable",
  "expected behavior",
  "classic move",
  "classic response",
  "classic bro",
  "classic GC moment",
  "GC history na yan",
  "archive worthy",
  "museum worthy",
  "historical event",
  "document this",
  "someone write this down",
  "take notes everyone",
  "lesson learned",
  "noted for future reference",
  "future generations will know",
  "this belongs in the archives",
  "the lore expands",
  "new lore unlocked",
  "lore update",
  "canon event",
  "character lore",
  "side lore",
  "unnecessary lore",
  "deep lore for no reason",

  // RANDOM
  "why do we know this",
  "why was this necessary",
  "why did you type that",
  "why did you send that",
  "why are we here",
  "how did we get here",
  "what happened",
  "what is happening",
  "ano nangyayari",
  "ano ginagawa mo",
  "ano yan",
  "ano ba yan",
  "ano na",
  "ano pa",
  "bakit",
  "paano",
  "saan",
  "kailan",
  "sino",
  "para saan",
  "for what",
  "what's the point",
  "where's the point",
  "point please",
  "context please",
  "source please",
  "receipts please",
  "explanation please",
  "proof please",
  "evidence please",
  "thank you",

  // MORE
  "ang lalim naman ng problema mo",
  "ang simple lang ng usapan ginawa mong saga",
  "parang may championship sa reply",
  "di ka mauubusan ng salita",
  "di ka talaga titigil no",
  "may stamina ka rin",
  "typing endurance: impressive",
  "keyboard warrior mode",
  "keyboard working overtime",
  "keyboard mo pagod na",
  "daliri mo pahinga muna",
  "screen time check",
  "oras na para bumaba sa phone",
  "pahinga muna sa internet",
  "wag mong seryosohin lahat",
  "di lahat kailangan sagutin",
  "di lahat kailangan patulan",
  "di lahat kailangan ipaglaban",
  "choose your battles",
  "wrong battlefield bro",
  "wrong audience",
  "wrong timing",
  "wrong room",
  "wrong GC",
  "wrong energy",
  "wrong approach",
  "try another strategy",
  "new strategy please",
  "change tactic",
  "plan B na",
  "plan C na",
  "wala nang plan D",
  "out of options",
  "out of arguments",
  "out of excuses",
  "out of context",
  "out of pocket",
  "medyo out of pocket yan",
  "ano ba yan",
  "seryoso ka ba",
  "seryoso talaga?",
  "joke lang ba to",
  "joke ba yan",
  "okay if you say so",
  "kung sabi mo",
  "kung yan gusto mong paniwalaan",
  "bahala ka dyan",
  "desisyon mo yan",
  "choice mo yan",
  "good for you",
  "happy for you",
  "proud of you",
  "charot",
  "joke lang",
  "wag kang ano",
  "kalmahan mo",
  "chillax",
  "easy lang",
  "hinay hinay",
  "dahan dahan",
  "wag bilisan",
  "di tayo naghahabol",
  "may oras pa",
  "take your time",
  "compose yourself",
  "collect yourself",
  "gather your thoughts",
  "think first",
  "read that again",
  "read your own message",
  "basahin mo ulit",
  "check mo muna",
  "double check",
  "triple check",
  "proofread muna",
  "grammar later",
  "logic first",
  "point first",
  "context first",
  "evidence first",
  "then talk",
  "then proceed",
  "then we can talk",
  "okay na?",
  "goods na?",
  "satisfied?",
  "happy ka na?",
  "tapos na?",
  "finished?",
  "done?",
  "end?",
  "next?"

];

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
      "[HALIMAW] Failed to load config:",
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
      "[HALIMAW] Failed to save config:",
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

  let previous =
    recentReplies.get(
      String(threadID)
    ) || [];

  let available =
    ALL_REPLIES.filter(
      reply =>
        !previous.includes(reply)
    );

  if (
    available.length === 0
  ) {

    previous = [];

    available = ALL_REPLIES;

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
    String(threadID),
    previous
  );

  return reply;
}

// =====================================================
// START TYPING
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

    }, 3000);

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
// DOT TOGGLE
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
    config.activeThreads.indexOf(
      id
    );

  // =================================================
  // ON
  // =================================================

  if (index === -1) {

    config.activeThreads.push(
      id
    );

    saveConfig(config);

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

    console.log(
      `[HALIMAW] ON: ${id}`
    );

    return;
  }

  // =================================================
  // OFF
  // =================================================

  config.activeThreads.splice(
    index,
    1
  );

  saveConfig(config);

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

  console.log(
    `[HALIMAW] OFF: ${id}`
  );

}

// =====================================================
// MAIN EVENT HANDLER
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

  // IGNORE EMPTY
  if (!body) {
    return;
  }

  // =================================================
  // IGNORE BOT'S OWN MESSAGE
  // =================================================

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

  // =================================================
  // DOT TOGGLE
  // =================================================

  if (
    text === "."
  ) {

    await toggleThread({
      api,
      event,
      config
    });

    return;
  }

  // =================================================
  // IGNORE "..", "...", ETC.
  // =================================================

  if (
    /^\.+$/.test(text)
  ) {

    return;

  }

  // =================================================
  // CHECK ACTIVE THREAD
  // =================================================

  if (
    !config.activeThreads.includes(
      String(threadID)
    )
  ) {

    return;

  }

  // =================================================
  // EVERY MESSAGE GETS A REPLY
  // =================================================

  const reply =
    getRandomReply(
      threadID
    );

  // =================================================
  // START TYPING FOR THIS MESSAGE
  // =================================================

  const typingInterval =
    startTyping(
      api,
      threadID
    );

  // =================================================
  // SEND AFTER 10 SECONDS
  // =================================================

  setTimeout(() => {

    stopTyping(
      api,
      threadID,
      typingInterval
    );

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

  }, REPLY_DELAY);

};

// =====================================================
// RUN
// =====================================================

module.exports.run =
async function () {

  // Prefixless.
  // Dot is handled inside handleEvent.
  return;

};
