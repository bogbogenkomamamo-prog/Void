"use strict";

const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "halimaw",
  version: "25.0.0",
  role: 0,
  hasPrefix: false,
  aliases: ["halimaw", "mimic", "tropa"],
  description: "Prefixless Tarantadong Halimaw - Mega Toxic Asar Edition (Auto-Reply All)",
  usage: "Auto-replies to all messages",
  credits: "sinzu (Pure Asar Optimized)",
  cooldown: 1
};

// =====================================================
// ADMIN IDS (Optional na kung gagamitin pa)
// =====================================================

const ADMIN_IDS = new Set([
  "61594951192638",
  "61594616562680",
  "61594370023022" // id mo
]);

// =====================================================
// SETTINGS (ANTI-BAN OPTIMIZED)
// =====================================================

const MIN_REPLY_DELAY = 6000;
const MAX_REPLY_DELAY = 14000;
const RECENT_REPLY_LIMIT = 50;

// =====================================================
// RUNTIME MEMORY
// =====================================================

const recentReplies = new Map();
const threadCooldowns = new Map();

// =====================================================
// PURE NANG AASAR REPLY POOL (Extended 1000+ Toxic Lines)
// =====================================================

const ALL_REPLIES = [
  // Original Pool
  "edi wow", "ha?", "sus", "ewan", "weh",
  "so?", "then?", "and?", "ayan na naman", "eto na naman tayo", "wala na naman", 
  "ano na naman yan", "anong pake ko", "pakialam ko", "sino nagtanong", "may nagtanong ba", 
  "bahala ka sa buhay mong pang-etneb", "ikaw na ang feeling sikat", "edi ikaw na ang tanga", 
  "ang angas mo ah, pero pulubi naman sa totoong buhay", "kalma, pikon ka na agad e", 
  "iyak ka na dyan", "pikon?", "galit ka na naman, triggered ka kuys?", 
  "affected yarn?", "tinamaan ka ba sa katotohanan?", "aray, tinamaan ang bobo", 
  "luh, nagmamagaling na naman ang tanga", "hala, lumalabas na naman ang kabobohan mo", 
  "ulol", "ampota", "angas mo mukha namang kangag", 
  "ano bang pinaglalaban mo, wala namang naniniwala sayo", "normal ka pa ba o sabog ka lang sa rugby", 
  "ano na naman pinag-iisip ng sabaw mong utak", "relax ka lang, wag masyadong feelingero", 
  "confidence lang kulang naman sa evidence", "may resibo ka ba o puro ka lang dakdak", 
  "saan ang source mo? sa pwet mo?", "source: trust me bro, gawa-gawa ko lang sa imahinasyon mo", 
  "ang bobo naman ng take mo, galing basurahan", "skill issue yan tol, wag kang umiyak", 
  "reading comprehension left the chat", "comprehension mo na-scam na naman", 
  "logic mo nag-offline na kasi walang laman ang ulo", "system error: walang kwenta sinabi mo", 
  "404 point not found", "proof muna bago ka magyabang dito, duwag", 
  "resibo muna bago satsat", "pakita mo muna kung may ibubuga ka bukod sa hangin", 
  "puro ka salita, wala ka namang narating", "predictable ka masyado, ang boring ng pagkatao mo", 
  "very original ah, galing sa basurahan nyo", "iyak ka na dyan sa sulok habang nagmumukmok", 
  "parang tanga lang umasta", "ulol mo", "hinto na sa kakahol dyan",
  "tumahol ka pa, mukha kang asong ulol", "ano na, iyak na sa madilim na sulok?", 
  "puro ka yabang wala ka namang laman sa utak", "lakas ng trip mo ah, tonta naman", 
  "sows, pampam ka na naman sa GC", "huli ka na sa balita, inutil ka kasi",
  "anong klaseng katangahan na naman yan", "ulol mo tatlo", "daming mong satsat wala namang sustansya",
  "kumain ka na ba? baka kaya ka ganyan kase gutom na ang tanga", "magsalita ka pa para mas lalo kang ibrushup as tanga",

  // 1000+ Dagdag na Pang-asar at Pamimikon
  "hanggang ngayon ba naman bobo ka pa rin", "wala ka bang ibang alam kundi maging pabigat",
  "pulubi ng taon award goes to you", "ang cringe ng ugali mo pramis", "kadiri ka naman pumorma",
  "mukha kang basahan na nilagyan ng mukha", "amoy araw ka pa rin ba hanggang ngayon",
  "nagmamarunong ka nanaman e hindi mo naman alam pinagsasabi mo", "utak talangka realness",
  "sunod mong iyak pakinggan ko ha", "yabang mo eh wala ka namang ambag sa lipunan",
  "literal na basura ang opinyon mo", "patingin nga ng mukha mo baka matakot pa yung salamin",
  "huli ka na sa uso, mukha ka pa ring sinauna", "anong klaseng sabaw na almusal kinain mo at ganyan ka kabobo",
  "iyak na pogi kuno", "hangin sa utak mo pwede nang pam-puno ng gulong", "daming hanash wala namang laman",
  "sarap mong tapakan sa mukha", "puro ka porma sablay naman sa diskarte", "laos ka na kahit kailan di ka sumikat",
  "epal alert", "pabigat ng pamilya", "sanay ka na sigurong mapahiya no", "kapal ng mukha mo pwede nang pang-aspalto",
  "di ka na nahiya sa itsura mo", "muka kang ewan", "tigilan mo na yang pagpapapansin mo wala namang may paki",
  "kala mo kagwapuhan/kagandahan eh mukha ka namang paa", "ulol ulitin mo pa baka sakaling may maniwala",
  "panis na ba yang joke mo kagaya ng mukha mo", "sabog ka na naman no", "bawas-bawasan ang pagiging mangmang",
  "wala ka talagang mararating sa buhay kinginang yan", "puro ka ngawa parang baklang kanal",
  "iyak kana niyan? dampian ko ng tissue yang mata mo", "hindi nakakatawa katangahan mo, nakakaawa na",
  "palibhasa walang nagmamahal kaya ka ganyan", "puro kachapanan pinagsasabi mo", "sige i-push mo pa yang katangahan mo",
  "magsama kayo ng mga inutil mong tropa", "sarap mong ibato sa dagat-dagatan", "wala kang kwenta kausap",
  "puro yabang sa chat sa personal duwag naman", "huli sa akto na tanga ka nga talaga", "pakyu ka ng marami",
  "sumuka ka na ba ng katotohanan o puros kasinungalingan pa rin", "nag-iisip ka ba o palamuti lang yang utak mo",
  "ikaw na pinakamagaling sa pagiging inutil", "muka kang tapon", "wala ka talagang kwenta sa mundo",
  "tumigil ka na baka masuka pa ako sa pinagsasabi mo", "puro ka satsat parang sirang plaka",
  "ikaw ba yung tipong tinapon nung pinanganak ka", "bobo na nga, pilay pa sa diskarte", "ulol mo pabaliktad",
  "hanggang dyan na lang ba ang itlog mo", "duwag ka naman pala e", "lakas mang asar pikon na pala",
  "yan tayo eh, pagtalo tahimik na", "muntanga ka kasi", "huwad na nilalang", "peke ang tapang mo",
  "parang timang e", "sabaw overload", "sablay na naman ang putak mo", "kumahol ka pa aso",
  "ampaw yung laman ng bungo mo", "hanggang internet lang ang tapang mo", "bugok ka eh",
  "wala ka talagang ibubuga kundi laway", "puro ka dada", "saksak mo sa baga mo yang opinyon mo",
  "walang may gusto sa sinabi mo", "epal mo sa totoo lang", "pwe", "yuck kadiri ka",
  "magsara ka na nga ng bunganga", "baho ng hininga mo hanggang dito", "tumahimik ka na lang kung wala kang kwenta",
  "hinding-hindi ka uunlad sa ganyang ugali", "isip-bata ka pa rin hanggang ngayon", "kala mo naman ang talino mo",
  "tanga certified", "kingina mo rin paminsan-minsan", "puro kapalpakan", "palpak sa buhay",
  "bagsak sa lahat ng subject", "wala kang future", "buhay mo comedy pero sad ending",
  "pulubi ng social media", "spam pa more ng katangahan", "ikaw na ang hari ng mga ulol",
  "puro ka reklamo wala ka namang ambag", "napaka-usisa mo wala ka namang alam", "chismosang palaka",
  "baklang kanal moves", "feeling main character eh extra ka lang", "background props ka lang sa mundong ito",
  "laos ka na noon pa", "pulot mo sa basurahan yung ugali mo", "sunod mong hirit pambenta sa junkshop",
  "basurang-basura ang atake mo", "walang kwentang nilalang", "epal ng taon", "pabebe ka pa mukha ka namang kargador",
  "lakas ng tama mo sa ulo", "hindi ka na nagbago, inutil ka pa rin", "puro ka porma sablay naman ang bayag",
  "iyak well", "sige iyak pa", "iyak ka pa hanggang lumubog ang araw", "iyak sa gilid",
  "pikit mata sa katangahan", "himbing ng tulog ng mga bobo", "gising na, tanga ka pa rin",
  "kahit anong gawin mo bobo ka pa rin", "walang lunas sa katangahan mo", "operahan na ang utak mo kung may laman pa",
  "puro hangin", "mababa ang iq", "negative ang comprehension", "walang patutunguhan",
  "palamunin ng lipunan", "pasan mo ang katangahan ng buong angkan nyo", "pamilya nyo proud sa pagiging tanga mo",
  "ulol level 999", "masterclass sa pagiging inutil", "puro ka daldal wala ka namang ibubuga",
  "suntukin ko kaya ngipin mo", "angas mo ha", "tigas ng mukha mo", "kapal ng apog",
  "walang hiya ka talaga", "salot sa lipunan", "peste ka", "bwisit sa buhay",
  "pabigat sa GC", "kick na yan", "alis ka na dito", "walang nagmamahal sayo",
  "ampaw", "tanga-tangahan effect", "nagmamalinis e madumi naman", "hipokrito",
  "balatkayo", "plastik", "user", "paki mo ba", "edi magpakamatay ka",
  "dami mong satsat", "ulol mo pang-apat", "pang-lima", "pang-anim", "paulit-ulit ka na lang",
  "gasgas na yang linya mo", "laos na yan", "wala ka na bang bago", "bobo na nga paulit-ulit pa",
  "sarap mong ibitin patiwarik", "tarantado ka talaga", "gago", "hinayupak",
  "lintik ka", "salbahe ka", "demonyo", "anak ng tokwa", "bwisit",
  ...Array.from({ length: 900 }, (_, i) => `tanga combo number ${i + 1}: ${["tumigil ka na", "wala kang mararating", "pulubi ka", "iyak ka na", "inutil ka", "epal ka", "bobo ka", "panget mo"][i % 8]}`)
];

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
// MAIN EVENT HANDLER (AUTO-REPLY ALL)
// =====================================================

module.exports.handleEvent = async function ({ api, event }) {
  const { threadID, senderID, body, messageID } = event;

  if (!body) return;

  let botID = null;
  try {
    botID = api.getCurrentUserID();
  } catch (e) {}

  // Huwag sagutin ang sarili mong bot
  if (botID && String(senderID) === String(botID)) {
    return;
  }

  // Optional cooldown per thread para hindi ma-spam block agad
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
