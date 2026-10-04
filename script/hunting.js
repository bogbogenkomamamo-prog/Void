const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "halimaw",
  version: "11.0.0",
  hasPermission: 0,
  credits: "sinzu / updated",
  description: "Tarantadong Halimaw - Complete Pool Replies + Dot Heart & 10s Delay",
  usePrefix: true,
  commandCategory: "Fun",
  usages: "/halimaw [on | off | status]",
  cooldowns: 3
};

const DATA_PATH = path.join(__dirname, "halimaw_config.json");
const ADMIN_IDS = ["61594951192638", "61594616562680", "61594981323552"];

const threadCooldowns = new Map();
const recentReplies = new Map();

// LAHAT NG MGA LISTAHAN NG REPLIES PINAG-ISA PARA SA DASHBOARD
const ALL_REPLIES = [
  // Short / Dry / Bored
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

  // Natural / Casual
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
  "wag mo nang paligoy-ligoy", "ano ba talaga gusto mong sabihin", "diretsuhin mo na", "ang dami mong intro",
  "parang may essay submission", "mahaba pero saan yung punto", "nawala ako sa gitna", "wait lang naligaw ako",
  "balikan mo nga yung point", "ano ulit", "di ko nasundan", "parang iba yung pinupuntahan mo", "okay ka pa?",
  "buhay ka pa ba", "active na active ah", "may energy ka talaga", "sana all may ganyang oras",

  // Sarcastic
  "wow may confidence kahit kulang sa dahilan", "congratulations may speech ka na naman", "palakpakan natin para masaya",
  "sige lang baka maniwala ka rin sa sarili mo", "ang galing mo talaga mag-imagine", "nice story bro", "solid fiction",
  "maganda yung imagination mo", "parang convincing kung di lang obvious", "ang lakas ng plot twist",
  "may season 2 pa ba yan", "waiting sa resibo", "saan yung proof", "may evidence ba o vibes lang",
  "source: sariling isip", "trust me bro talaga", "very convincing, almost", "grabe yung confidence mo",
  "confidence level: unlimited", "evidence level: unavailable", "ang tapang mo naman sa chat",
  "malakas talaga pag keyboard ang hawak", "keyboard warrior arc na naman", "online ka lang pala malakas",
  "parang final boss pero tutorial stage", "boss fight daw pero intro pa lang", "main character syndrome detected",
  "akala mo may audience", "may sariling teleserye", "may sariling storyline", "ikaw gumawa ng problema tapos ikaw din bida",
  "ang cinematic naman ng kwento mo", "parang movie pero walang budget", "ang taas ng expectation sa sarili",
  "hindi ka ba nauubusan ng confidence", "walang preno yung yabang", "sige lang, support kita sa delusion",
  "keep believing", "manifest mo lang baka mangyari", "baka sakali", "malay natin", "baka bukas", "maybe someday",
  "almost believable", "nice attempt", "close enough", "good effort", "10/10 sa confidence", "2/10 sa logic",
  "5/10 sa effort", "100/10 sa kapal ng mukha",

  // Bardagulan
  "kala mo may impact lahat ng sinasabi mo", "nag-iingay ka na naman para lang mapansin",
  "hindi ka boss, ikaw lang nagbibigay ng titulo sa sarili mo", "ang lakas mong magbitaw ng linya parang may award sa dulo",
  "ang ingay mo pero parang walang laman", "wala ka namang kwenta kausap", "sige patuloy mo lang pagpapanggap mo",
  "ikaw na ang magaling palakpakan natin", "puro ka yabang pero sablay naman", "wala na bang bago? gasgas na yan",
  "sarili mo lang niloloko mo dyan", "ang galing mong gumawa ng sarili mong pelikula", "hindi ka nakakatakot, nakakatawa ka lang",
  "tumigil ka na, ang sakit mo sa ulo", "parang sirang plaka, paulit-ulit", "daldal mo sobra, wala namang sustansya",
  "sumagot ka pa, halatang pikon ka na", "huli ka na sa balita, nagmamagaling ka pa", "hinay-hinay lang sa pag-iisip baka maubos agad",
  "tama na sa pagpapanggap, hindi bagay sa'yo", "puro ka amba pero walang resibo", "tingin mo angat ka na, nasa imbento ka pa lang",
  "bro huminga ka muna baka mapano ka sa kakadada", "ang lakas ng loob mo kaso hindi suportado ng utak",
  "kala mo may audience ka sa bawat galaw mo", "sobrang confident kahit walang basehan", "hina ng connection mo sa realidad bro",
  "ang tapang ng salita mo, nasaan yung gawa", "puro intro walang main event", "ang dami mong sinasabi para sa taong walang point",
  "nagpapaka-bida ka na naman", "di lahat ng iniisip mo kailangan sabihin", "may mute button ka ba sa sarili mo",
  "sobra na yung confidence, kulang na yung sense", "parang kailangan mo ng reality check", "wag mong seryosohin sarili mo nang ganyan",
  "ang taas ng tingin mo sa sarili mo", "pero bakit parang walang sumasang-ayon", "puro ka flex wala namang maipakita",
  "yabang muna bago utak", "puro ka salita, gawa wala", "kung yabang ang sukatan panalo ka na", "kaso hindi yabang ang labanan dito",
  "ang lakas mong manghusga parang perfect ka", "may checklist ka ba ng sariling mali", "tingnan mo muna sarili mo bago iba",
  "ang bilis mong pumuna pero mabagal umintindi", "parang gusto mong manalo kahit walang laban", "pinipilit mong maging relevant",
  "hindi ka naman kailangan i-ignore, kusa kang nawawala", "ang effort mong maging annoying", "successful ka naman",
  "successful maging istorbo", "ang consistent mo sa pagiging ganyan", "at least may talent ka sa pang-iinis",
  "may ambag ka naman pala", "ambag sa ingay", "hindi kita kailangang kontrahin, ginagawa mo naman mag-isa",
  "sige lang tuloy mo yung self-destruction", "ikaw na mismo nagbibigay ng dahilan para pagtawanan ka",

  // Cold / Deadpan
  "noted", "interesting", "irrelevant", "okay then", "good for you", "that's nice", "if you say so",
  "whatever works for you", "do what you want", "your choice", "carry on", "continue", "proceed", "go ahead",
  "i'll let you have that", "sure", "alright", "understood", "received", "message received", "noted with concern",
  "noted with amusement", "that's one way to think about it", "interesting perspective", "valid attempt",
  "noted, anyway", "okay, moving on", "anyway", "back to reality", "let's not", "we're not doing this",
  "i'm not entertaining this", "wrong audience", "wrong person", "wrong timing", "not today", "maybe next time",
  "pass muna", "skip muna tayo", "wala akong comment", "no comment", "i have nothing to add", "nothing to discuss",
  "end of discussion", "case closed", "next topic", "moving on", "that's enough", "we're done here",

  // Mocking
  "bro really thought that would work", "bro typed all that with confidence", "bro thought he cooked",
  "bro forgot the evidence", "bro forgot the point", "bro is fighting an imaginary opponent", "bro arguing with himself again",
  "bro created his own enemy", "bro is in his own universe", "bro wrote a whole paragraph just to say nothing",
  "bro needs a map", "bro lost the plot", "bro skipped common sense", "bro needs to restart", "bro needs an update",
  "bro is running outdated logic", "bro's connection to reality is unstable", "bro is buffering", "bro is still loading",
  "bro hasn't finished processing", "bro's brain entered maintenance mode", "bro needs technical support",
  "bro needs a reality patch", "bro is confidently incorrect", "bro is speedrunning embarrassment", "bro is farming reactions",
  "bro wants attention badly", "bro really wants the spotlight", "bro thinks this is a tournament",
  "bro treating the group chat like a stage", "bro brought an entire presentation", "bro made a thesis",
  "bro wrote a novel", "bro needs an editor", "bro needs to shorten that", "bro lost me at the first sentence",
  "bro somehow made it worse", "bro kept talking and proved the point", "bro is helping the allegations",
  "bro is beating the allegations by becoming them", "bro is not beating the allegations", "bro thought nobody noticed",
  "bro thought we forgot", "bro really said that publicly", "bro chose violence against his own reputation",
  "bro woke up and chose nonsense", "bro woke up with too much confidence", "bro needs sleep", "bro needs water",
  "bro needs to log out",

  // Internet & Heavy
  "brodie chill", "luh ano yan", "ano yan lods", "grabe naman bossing", "kalmahan mo lods", "wala ka sa wisyo",
  "ano ba yan pre", "wag ganyan pre", "pre tama na", "pre huminga ka", "boss relax", "bossing ano yan", "lods naman",
  "kuya tama na", "beh enough", "beh kalma", "tol ano yan", "tol wag mo na ituloy", "pare ang lala", "pare naman",
  "idol wag", "idol kalma", "master naman", "sir enough", "chief relax", "chief ano yan", "brother please",
  "bro please", "bro stop", "bro enough", "bro relax", "bro calm down", "bro what are you doing", "bro why",
  "bro how", "bro really", "bro seriously", "bro nah", "nah bro", "no way bro", "ain't no way", "what is bro doing",
  "what are you cooking", "who let bro cook", "take the stove away", "turn off the stove", "bro burned the kitchen",
  "wala nang pag-asa yung niluluto mo", "sunog na pre", "lutong-luto na", "overcooked", "medyo sablay",
  "hindi naman kita pinipigilan magsalita, pero sana may sense din minsan", "kung confidence lang ang puhunan mo, mayaman ka na siguro",
  "ang problema hindi ka madaldal, wala lang talagang patutunguhan yung sinasabi mo", "hindi mo kailangang lakasan boses mo para magmukhang tama",
  "kahit ilang beses mong sabihin, hindi nagiging tama dahil lang paulit-ulit", "hindi porket confident ka ibig sabihin tama ka",
  "may difference ang pagiging prangka sa pagiging walang sense", "ang hirap makipagtalo sa taong sarili lang ang source",
  "parang ikaw yung debate, ikaw din yung judge, ikaw din yung panalo", "ang convenient ng logic mo, ikaw lagi ang tama kahit walang proof"
];

function loadConfig() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    }
  } catch (e) {}
  return { active: false };
}

function saveConfig(data) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  } catch (e) {}
}

// ===== EVENT HANDLER =====
module.exports.handleEvent = async function ({ api, event }) {
  const { threadID, senderID, body, messageID } = event;

  if (!body || senderID === api.getCurrentUserID()) return;

  const config = loadConfig();
  if (!config.active) return;

  // ADMIN ONLY FILTER
  if (!ADMIN_IDS.includes(String(senderID))) return;

  // 10-Second Delay Checker
  const now = Date.now();
  const lastTime = threadCooldowns.get(threadID) || 0;
  const fixedDelay = 10000; // 10 seconds

  if (now - lastTime < fixedDelay) return;
  threadCooldowns.set(threadID, now);

  // 1. KUNG DOT LANG ANG TINYPE: Magrereact ng heart pagkalipas ng 10 seconds
  if (body.trim() === "." || /^\.+$/.test(body.trim())) {
    setTimeout(() => {
      try {
        api.setMessageReaction("❤️", messageID, (err) => {}, true);
      } catch (e) {}
    }, fixedDelay);
    return;
  }

  // 2. KUNG MAY MENSAHE: Anti-paulit-ulit na pagpili mula sa buong listahan ng replies
  if (body.startsWith("/")) return;

  let previous = recentReplies.get(threadID) || [];
  let available = ALL_REPLIES.filter(reply => !previous.includes(reply));
  let source = available.length > 0 ? available : ALL_REPLIES;
  
  let selectedReply = source[Math.floor(Math.random() * source.length)];

  previous.push(selectedReply);
  if (previous.length > 15) previous.shift();
  recentReplies.set(threadID, previous);

  setTimeout(() => {
    try {
      if (typeof api.sendTypingIndicator === "function") {
        api.sendTypingIndicator(threadID, true);
      }
    } catch (err) {}

    setTimeout(() => {
      try {
        if (typeof api.sendTypingIndicator === "function") {
          api.sendTypingIndicator(threadID, false);
        }
      } catch (err) {}

      api.sendMessage({ body: selectedReply }, threadID, (err, info) => {}, messageID);
    }, 2000); 
  }, fixedDelay);
};

// ===== COMMAND CONTROLLER =====
module.exports.run = async function ({ api, event, args }) {
  const { threadID, senderID, messageID } = event;

  if (!ADMIN_IDS.includes(String(senderID))) {
    return api.sendMessage("❌ Hindi ka authorized gumamit nito.", threadID, messageID);
  }

  const sub = (args[0] || "").toLowerCase();
  const config = loadConfig();

  if (sub === "on") {
    config.active = true;
    saveConfig(config);
    threadCooldowns.clear();
    recentReplies.clear();
    return api.sendMessage("✅ Halimaw ON (All Replies Loaded & Active)", threadID, messageID);
  }

  if (sub === "off") {
    config.active = false;
    saveConfig(config);
    return api.sendMessage("❌ Halimaw OFF", threadID, messageID);
  }

  if (sub === "status") {
    return api.sendMessage(
      `📊 Status: ${config.active ? "ONLINE" : "OFFLINE"}\nTotal Replies Loaded: ${ALL_REPLIES.length}`,
      threadID,
      messageID
    );
  }

  return api.sendMessage(
    "/halimaw on | off | status",
    threadID,
    messageID
  );
};
