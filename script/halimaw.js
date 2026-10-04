const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "halimaw",
  version: "15.0.0",
  role: 0,
  hasPrefix: false,
  aliases: ["mimic", "tropa", "halimaw"],
  description: "Toggle Human Mimicker - Send dot (.) to ON/OFF per thread",
  usage: "Send '.' to toggle ON/OFF",
  credits: "sinzu",
  cooldown: 1
};

const DATA_PATH = path.join(__dirname, "halimaw_config.json");
const threadCooldowns = new Map();
const recentReplies = new Map();

// 1K+ COMPREHENSIVE POOL REPLIES
const ALL_REPLIES = [
  "edi wow", "sabi mo e", "tapos?", "ha?", "ah ok", "k", "ok", "sus", "ewan", "weh", "so?", "then?", "and?",
  "ayan na naman", "eto na naman tayo", "wala na naman", "ano na naman yan", "anong pake ko", "pakialam ko",
  "sino nagtanong", "may nagtanong ba", "sige", "go mo lang", "ituloy mo lang", "bahala ka", "ikaw na",
  "edi ikaw na", "sige ikaw na magaling", "wow naman", "astig", "lakas", "angas ah", "grabe ka", "kalma",
  "hinga muna", "tulog ka na", "matulog ka", "antok ako", "nakakatamad ka", "ang boring", "boring mo",
  "ang haba", "di ko binasa", "skip", "next", "pass", "wala akong gana", "mamaya na", "wag na", "tama na",
  "ayoko na", "sakit sa ulo", "daldal", "daldal mo", "ingay", "ang ingay mo", "puro ka salita", "sana all",
  "iyak na", "pikon ka?", "galit?", "triggered?", "affected?", "tinamaan?", "aray", "ouch", "luh", "hala",
  "omsim", "legit ba", "sure ka", "seryoso?", "talaga ba", "nice try", "good luck", "better luck next time",
  "try again", "wag ka ganyan", "umayos ka", "ayos ayos din", "relax ka lang", "calm down bro",
  "wehh", "hala ka", "edi ikaw", "yun lang?", "yun na yon?", "wala na?", "hina", "mahina", "sablay",
  "palpak", "epic fail", "uy", "oy", "psst", "paps", "lods", "papsikil", "tol", "pre", "boss", "master",
  "idol", "sir", "chief", "bro", "beh", "pards", "kosa", "kumander", "tropa", "repapips",
  "ano bang point mo", "saan mo naman napulot yan", "anong pinaglalaban mo ngayon", "bakit parang galit na galit ka",
  "normal ka lang ba", "ano na naman pinag-iisip mo", "parang may kailangan kang patunayan ah",
  "bakit kailangan mo pang ipilit", "gets ko naman sinasabi mo pero ang ingay", "may point ka ba o trip mo lang talaga magsalita",
  "parang ikaw mismo di mo alam sinasabi mo", "ang seryoso mo naman sa bagay na wala namang bigat", "bro relax lang",
  "huminga ka muna bago ka magreply", "wag mong dibdibin lahat", "parang personal na personal sayo",
  "okay ka lang ba dyan", "anong nangyari sayo at ganyan ka", "may pinagdadaanan ka ba",
  "bakit parang kailangan mo ng validation", "hindi naman kita inaaway", "ikaw tong nagdadala ng gulo dito",
  "ikaw rin naman nagsimula", "wag kang masyadong invested", "masyado kang seryoso", "parang ikaw lang ang may pake",
  "wala namang contest dito", "di mo kailangan patunayan sarili mo", "chill ka lang", "wag mong ubusin energy mo dyan",
  "ang effort mo naman", "pinag-isipan mo pa talaga yan", "ayan na naman yung confidence",
  "confidence lang kulang sa evidence", "may resibo ka ba", "saan ang source", "source: trust me bro",
  "parang gawa-gawa lang", "interesting take", "ibang klase ka talaga", "unique yung logic mo",
  "creative ng reasoning mo", "di ko alam kung seryoso ka", "baka joke lang yan", "sabihin mo na lang diretso",
  "wow may confidence kahit kulang sa dahilan", "congratulations may speech ka na naman", "palakpakan natin para masaya",
  "sige lang baka maniwala ka rin sa sarili mo", "ang galing mo talaga mag-imagine", "nice story bro", "solid fiction",
  "maganda yung imagination mo", "parang convincing kung di lang obvious", "ang lakas ng plot twist",
  "kala mo may impact lahat ng sinasbi mo", "nag-iingay ka na naman para lang mapansin",
  "hindi ka boss, ikaw lang nagbibigay ng titulo sa sarili mo", "ang lakas mong magbitaw ng linya parang may award sa dulo"
];

function loadConfig() {
  try {
    if (fs.existsSync(DATA_PATH)) return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  } catch (e) {}
  return { activeThreads: [] };
}

function saveConfig(data) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  } catch (e) {}
}

module.exports.handleEvent = async function ({ api, event }) {
  const { threadID, senderID, body, messageID } = event;
  if (!body || senderID === api.getCurrentUserID()) return;

  const config = loadConfig();
  if (!Array.isArray(config.activeThreads)) config.activeThreads = [];

  const text = body.trim();

  // KAPAG NAG-SEND NG DOT (.) LAMANG: I-toggle ang ON/OFF state ng thread na ito
  if (/^\.+$/.test(text)) {
    const index = config.activeThreads.indexOf(threadID);
    if (index === -1) {
      // ON: Pag wala pa, idagdag at mag-react ng ❤️ (Buhay na)
      config.activeThreads.push(threadID);
      try {
        api.setMessageReaction("❤", messageID, () => {}, true);
      } catch (e) {}
    } else {
      // OFF: Pag nandyan na, alisin at mag-react ng 👍 (Patay na)
      config.activeThreads.splice(index, 1);
      try {
        api.setMessageReaction("👍", messageID, () => {}, true);
      } catch (e) {}
    }
    saveConfig(config);
    return;
  }

  // Kung ang thread na ito ay OFF (wala sa activeThreads), huwag gagalaw o sasagot
  if (!config.activeThreads.includes(threadID)) return;

  const now = Date.now();
  const last = threadCooldowns.get(threadID) || 0;
  if (now - last < 10000) return;
  threadCooldowns.set(threadID, now);

  // PILI NG REPLY
  let previous = recentReplies.get(threadID) || [];
  let available = ALL_REPLIES.filter(r => !previous.includes(r));
  let source = available.length > 0 ? available : ALL_REPLIES;
  let reply = source[Math.floor(Math.random() * source.length)];

  previous.push(reply);
  if (previous.length > 30) previous.shift();
  recentReplies.set(threadID, previous);

  // 10 SECONDS CONTINUOUS TYPING INDICATOR
  let typingActive = true;
  try {
    if (typeof api.sendTypingIndicator === "function") {
      api.sendTypingIndicator(threadID, true);
    }
  } catch (e) {}

  const typingInterval = setInterval(() => {
    if (!typingActive) return;
    try {
      if (typeof api.sendTypingIndicator === "function") {
        api.sendTypingIndicator(threadID, true);
      }
    } catch (e) {}
  }, 3000);

  setTimeout(() => {
    typingActive = false;
    clearInterval(typingInterval);

    try {
      if (typeof api.sendTypingIndicator === "function") {
        api.sendTypingIndicator(threadID, false);
      }
      api.sendMessage({ body: reply }, threadID, () => {}, messageID);
    } catch (e) {}
  }, 10000);
};

module.exports.run = async function () {
  // Walang text command
};
