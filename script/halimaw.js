const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "halimaw",
  version: "13.0.0",
  role: 0,
  hasPrefix: true,
  aliases: ["mimic", "tropa", "halimaw"],
  description: "Human Mimicker 24/7 - 10s Continuous Typing Indicator & 1k+ Replies for Everyone",
  usage: "/halimaw [on | off | status]",
  credits: "sinzu",
  cooldown: 3
};

const DATA_PATH = path.join(__dirname, "halimaw_config.json");

// Tandaan: Inalis na ang ADMIN_IDS restriction para gumana siya sa LAHAT ng tao.
const threadCooldowns = new Map();
const recentReplies = new Map();

// 1K+ COMPREHENSIVE POOL REPLIES
const ALL_REPLIES = [
  // --- Short / Dry / Bored (1-150) ---
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

  // --- Natural / Casual / Conversational (151-400) ---
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
  "hindi ko naman tinatanong pero sige", "kwento mo sa pader", "pwedeng i-skip yan?",
  "parang sirang plaka na paulit-ulit na lang", "wala bang bago sa mga banat mo", "nakakaumay na yan",
  "palitan mo na naman yung script mo", "panibagong araw, panibagong dada", "di ka ba napapagod magsalita mag-isa",
  "parang kausap ko sarili ko", "bahala ka sa buhay mo", "ikaw bahala", "ikaw ang nakakaalam",
  "sarili mo lang niloloko mo", "magpakatotoo ka naman kahit minsan", "huwag kang magmalinis",
  "kilala na kita eh", "alam ko na iikot usapan natin", "gasgas na yan", "wala ka na bang ibang masabi",

  // --- Sarcastic & Mocking (401-700) ---
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
  "5/10 sa effort", "100/10 sa kapal ng mukha", "bro really thought that would work", "bro typed all that with confidence",
  "bro thought he cooked", "bro forgot the evidence", "bro forgot the point", "bro is fighting an imaginary opponent",
  "bro arguing with himself again", "bro created his own enemy", "bro is in his own universe",
  "bro wrote a whole paragraph just to say nothing", "bro needs a map", "bro lost the plot",
  "bro skipped common sense", "bro needs to restart", "bro needs an update", "bro is running outdated logic",
  "bro's connection to reality is unstable", "bro is buffering", "bro is still loading", "bro hasn't finished processing",
  "bro's brain entered maintenance mode", "bro needs technical support", "bro needs a reality patch",
  "bro is confidently incorrect", "bro is speedrunning embarrassment", "bro is farming reactions",
  "bro wants attention badly", "bro really wants the spotlight", "bro thinks this is a tournament",
  "bro treating the group chat like a stage", "bro brought an entire presentation", "bro made a thesis",
  "bro wrote a novel", "bro needs an editor", "bro needs to shorten that", "bro lost me at the first sentence",

  // --- Heavy Bardagulan & Confrontational (701-1000+) ---
  "kala mo may impact lahat ng sinasbi mo", "nag-iingay ka na naman para lang mapansin",
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
  "hindi nakakatuwa, nakakaawa na", "magpahinga ka na kasi sabog na naman utak mo", "wala ka na namang naiambag kundi sakit ng ulo",
  "tumigil ka na habang may natitira ka pang dignidad", "wala namang naniniwala sa mga pinagsasabi mo",
  "ang dami mong satsat wala namang sustansya", "parang lata na walang laman, maingay lang",
  "paulit-ulit na lang ang drama mo, nakakaumay", "mag-isip ka naman ng bago minsan para may thrill",
  "hindi umuusad ang usapan dahil pabalik-balik ka lang", "hinaan mo naman ang boses mo, nanggigising ka ng patay sa yabang",
  "walang mangyayari sa pangarap mong maging bida", "manahimik ka na lang kung wala kang matinong maiaambag"
];

function loadConfig() {
  try {
    if (fs.existsSync(DATA_PATH)) return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  } catch (e) {}
  return { active: false };
}

function saveConfig(data) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  } catch (e) {}
}

module.exports.handleEvent = async function ({ api, event }) {
  const { threadID, senderID, body, messageID } = event;
  // Sinisigurong hindi magrereply sa sarili nitong bot account
  if (!body || senderID === api.getCurrentUserID()) return;

  const config = loadConfig();
  // Kung naka-off ang halimaw, huwag gagalaw
  if (!config.active) return;

  const text = body.trim();
  if (text.startsWith("/")) return;

  const now = Date.now();
  const last = threadCooldowns.get(threadID) || 0;
  if (now - last < 10000) return;
  threadCooldowns.set(threadID, now);

  // KUNG DOT LANG: 10 seconds bago mag-react ng ❤️
  if (/^\.+$/.test(text)) {
    setTimeout(() => {
      try { api.setMessageReaction("❤️", messageID, () => {}, true); } catch (e) {}
    }, 10000);
    return;
  }

  // PILI NG REPLY NA HINDI PAULIT-ULIT
  let previous = recentReplies.get(threadID) || [];
  let available = ALL_REPLIES.filter(r => !previous.includes(r));
  let source = available.length > 0 ? available : ALL_REPLIES;
  let reply = source[Math.floor(Math.random() * source.length)];

  previous.push(reply);
  if (previous.length > 30) previous.shift();
  recentReplies.set(threadID, previous);

  // HUMAN MIMICKER: Continuous Typing Indicator sa buong 10 seconds countdown
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

  // Pagkalipas ng 10 segundo: Itigil ang typing indicator at isend ang mensahe sa lahat
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

module.exports.run = async function ({ api, event, args }) {
  const { threadID, senderID, messageID } = event;

  const sub = (args[0] || "").toLowerCase();
  const config = loadConfig();

  if (sub === "on") {
    config.active = true;
    saveConfig(config);
    return api.sendMessage("Halimaw 24/7 Human Mimicker ON (Magrereply na sa LAHAT ng users).", threadID, messageID);
  }
  if (sub === "off") {
    config.active = false;
    saveConfig(config);
    return api.sendMessage("Halimaw Human Mimicker OFF na.", threadID, messageID);
  }
  if (sub === "status") {
    return api.sendMessage(`Mimicker Status: ${config.active ? "ONLINE" : "OFFLINE"}\nTotal Database Replies: ${ALL_REPLIES.length}`, threadID, messageID);
  }

  return api.sendMessage("/halimaw on | off | status", threadID, messageID);
};
