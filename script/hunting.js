"use strict";

const fs = require("fs-extra");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const STATE_FILE = path.join(DATA_DIR, "human-state.json");

fs.ensureDirSync(DATA_DIR);

/* =========================
   ADMINS
========================= */

const ADMINS = new Set([
	"61594616562680",
	"61594981323552",
	"61594951192638"
]);

/* =========================
   SETTINGS (Anti-Detection)
========================= */

const DELAY_MIN = 8000;
const DELAY_MAX = 14000;

const TYPING_MIN = 800;
const TYPING_MAX = 2000;

const DUPLICATE_WINDOW = 60000;
const MAX_MESSAGE_LENGTH = 500;

/* =========================
   STATE
========================= */

let state = {
	threads: {}
};

function loadState() {
	try {
		if (!fs.existsSync(STATE_FILE)) {
			saveState();
			return;
		}

		const data = fs.readJsonSync(STATE_FILE);

		state = {
			threads: data.threads || {}
		};
	} catch (err) {
		console.error(
			"[HUMAN] Failed to load state:",
			err.message
		);
	}
}

function saveState() {
	try {
		fs.writeJsonSync(
			STATE_FILE,
			state,
			{ spaces: 2 }
		);
	} catch (err) {
		console.error(
			"[HUMAN] Failed to save state:",
			err.message
		);
	}
}

loadState();

/* =========================
   HELPERS
========================= */

function sleep(ms) {
	return new Promise(resolve =>
		setTimeout(resolve, ms)
	);
}

function random(min, max) {
	return Math.floor(
		Math.random() * (max - min + 1)
	) + min;
}

function pick(array) {
	return array[
		Math.floor(
			Math.random() * array.length
		)
	];
}

function normalize(text) {
	return String(text || "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

function getThread(threadID) {
	if (!state.threads[threadID]) {
		state.threads[threadID] = {
			enabled: false,
			lastInput: "",
			lastInputTime: 0,
			replyCount: 0
		};
	}

	return state.threads[threadID];
}

/* =========================
   REPLIES (WITH ABBREVIATIONS & SLANG)
========================= */

const REPLIES = [
	"hinay hinay lng s pagiisip bka maubos agad",
	"ang ingay mo nman pero prang wlang laman",
	"tama n s pagpapanggap, hndi bago syo",
	"puro k amba pero wlang resibo",
	"tingin mo angat k n, s imbento k p lng",
	"bro, huminga k muna bka mapano k s kakadada",
	"ang lakas ng loob mo, kso hndi suportado ng utak",
	"puro k slita, kulang s substance",
	"hndi lht ng maingay may kwenta",
	"kla mo may audience k s bawat galaw mo",
	"sobrang confident, khit wlang basehan",
	"hndi k boss, ikaw lng nagbibigay ng titulo s sili mo",
	"kpag may premyo s kadaldalan, siguradong kampeon ka",
	"tama n ang eksena, hndi ito pelikula",
	"ang dami mong alam pero prang wlang naiintindihan",
	"nagpapaka-importanteng tao, eh wlang nagtatanong",
	"puro k clout, kulang k s content",
	"bro, hndi lht ng opinyon mo kailangang marinig",
	"sobrang lakas ng ego, pero wlang maipakita",
	"hndi k nakakatakot, nakakatawa k lng",
	"ang hirap mo kausap, prang wlang signal",
	"naghahanap k ng away khit wlang nag-iimbita",
	"puro k pahirap s saring eksena",
	"kala mo ikaw ang main character s lht",
	"hndi k naligaw, sadyang wlang direksyon ang argumento mo",
	"tambay k b s imbentong scenario?",
	"ang bilis mong magreply, sna ganon din kabilis ang pag-unawa mo",
	"hndi lht ng may capslock, may point",
	"bro, prang wifi k, mahina ang connection s realidad",
	"ang dami mong ssbhin, pero wlang direksyon",
	"nagpakalat k n nman ng kalokohan",
	"puro k flex, wla namang context",
	"kung may kompetisyon s memahan, may tropeo k n",
	"hndi k pinapansin, gumagawa k n nman ng ingay",
	"sobrang ganda ng imagination mo, syang hndi totoong",
	"kala mo may point k n, paulit-ulit lng pala",
	"hndi k pinag-usapan, ikaw lng ang nag-aassume",
	"ang tapang mo s chat, prang may sariling mundo",
	"puro k reklamo, wla namang solusyon",
	"ang lakas mong magpaliwanag, kso ikaw mismo hndi mo intindihin",
	"bro, magpahinga k muna s pagiging sentro ng atensyon",
	"ang dami mong alibi, prang may script ka",
	"hndi k nagwawin, nagpapahaba k lng ng usapan",
	"puro k parinig, diretsuhin mo kung may ssbhin ka",
	"kala mo may impact lht ng ssbhin mo",
	"hndi k mahina, pero mahina ang argumento mo",
	"ang bilis mong maghusga, sna bilisan mo rin ang pag-unawa",
	"naghahabol k ng clout na prang may utang syo",
	"hndi ito paligsahan ng ego, bro",
	"ang dami mong angas, kulang s common sense",
	"tama n ang pag-iimbento, nsa realidad tyo",
	"prang bot k n paulit-ulit ang linya",
	"khit ilang beses mong ulitin, hndi magiging totoong",
	"nagpakalimutan k n nman s saring sinabi",
	"bro, wlang nagpapataas ng score s dami ng chat",
	"ang dami mong energy, sna may direksyon din",
	"hndi k nakakalito, wla lng tlgang koneksyon ang ssshin mo",
	"nag-iingay k n nman para lng mapansin",
	"puro k teorya, nsan ang konkretong punto?",
	"kala mo may mic k, lht n lng may announcement",
	"hndi k laging tama khit ikaw p ang pinaka-maingay",
	"prang comment section ang utak mo, puro reaksiyon",
	"ang hirap magpakatalino kpag wlang pinanghawakan",
	"naghahanap k ng issue khit wlang problema",
	"bro, hndi kailangang may last word k palagi",
	"puro k palabas, kulang s nilalaman",
	"ang ganda ng kwento mo, khit ikaw lng ang naniniwala",
	"hndi k nakakalamang, nagpapaliguy-liguy k lng",
	"may point b k o nagpra-practice k lng magtype?",
	"kala mo may tropa k s likod ng bawat banat",
	"ang dami mong ssbhin, prang may bayad bawat letra",
	"nagpapaka-expert s bagay na hndi mo naman maipaliwanag",
	"hndi lht ng pagtatalo, kailangang panalunan",
	"sobrang dami mong claims, kulang naman s ebidensiya",
	"bro, ang haba ng reply mo, pero wlang diretso sagot",
	"kung may bayad ang pagmamahal s sili, mayaman k n",
	"ang dami mong plano, khit isa wlang nagtutugma",
	"puro k pa-cool, pero halatang pilit",
	"hndi k nakakaprovoke, nakakatawa k lng",
	"nagpapakalakas k s saring kwento",
	"prang sirang record ang mga banat mo",
	"bro, hndi k kailangang maging maingay para maging interesante",
	"ang dami mong alam s buhay ng iba, sna may update din s sili mo",
	"hndi k pinag-usapan, pero gusto mong may issue",
	"kala mo nakakalamang k, paulit-ulit k lng naman",
	"napakahaba ng eksena, pero wlang kwentang plot",
	"puro k pabida, wla namang nag-aaudition",
	"ang lakas mong magbitaw ng linya, prang may award s dulo",
	"hndi k nagpapatawa, pero ikaw ang naging joke",
	"ang dami mong ssbhin, khit saring argumento hndi mo masundan",
	"hndi k kulang s tapang, kulang k lng s paksa",
	"bro, hndi lht ng pagtitype mo may katumbas na talino",
	"puro k pa-epal, wla namang naghingi ng opinyon mo",
	"ang gulo ng kwento mo, prang random generator",
	"naghahanap k ng kakalaban s comment section",
	"hndi k nakakatakot, mas nakakalito k pa",
	"ang dami mong ssbhin, pero prang hangin lng",
	"tama n ang pagpapanggap na may alam s lht",
	"bro, mag-update k nman ng bagong banat",
	"peace out n lng, sayang oras s wlang katapusang usapan",
	"lakas mong magyabang, pero s personal tahimik k naman",
	"anong klaseng lohika 'yan, galing b s panaginip mo?",
	"paulit-ulit n lng ang argumento mo, wla n bang iba?",
	"nagmamagaling k nman eh hndi mo naman alam pinagsasasabi mo",
	"taas ng ihi mo ah, bka madapa k s saring baha",
	"umayos k n ng tayo, hndi mo hawak ang mundo",
	"puro k hanash, wla namang napatunayan",
	"sige lng, ituloy mo lng 'yan hanggang mapagod ka",
	"naka-energy drink k b o sadyang sabog lng",
	"wala k bang ibang libangan bukod s mamerwisyo dito?",
	"ang lala ng sabog mo ngayon ah, uminom k n b ng gamot?",
	"nakakatawa k kpag seryoso k s mga pinagsasabi mo",
	"hinaan mo boses mo, khit text 'yan naririnig ko ang yabang mo",
	"akala mo naman nakakatuwa ka, hndi mukha k lng ewan",
	"magtigil k n kung walang matino kang maibubuga",
	"puro k drama, may pa-thesis k pang nalalaman",
	"kumain k muna ng saging para tumalino k naman kahit konti",
	"hndi lht ng nagpapapansin, pinagbibigyan",
	"hanggang dito n lng b ang kaya ng utak mo?",
	"utak mo prang clearance sale, luma at wlang bumibili",
	"huwag masyadong magmamagaling kung napaghahalataan kng sablay",
	"napakaingay mo para s isang taong wlang kwenta magsalita",
	"magkano b bayad syo para maging istorbo?",
	"sili mo munang problema ayusin mo bago k makisawsaw",
	"dami mong ebas, wla namang pumapansin",
	"huwag k iiyak ha p pag nasupalpal ka",
	"himbing ng tulog ng mga may matinong isip, ikaw gising n gising s katangahan",
	"subukan mo kayang tumahimik paminsan-minsan para may silbi k naman",
	"nag-aaksaya k lng ng kuryente at oras s mga pinaggagagawa mo",
	"ikaw n ang pinakamagaling, ikaw n ang perpekto s paningin mo"
];

const SHORT_REPLIES = [
	"ano", "bakit", "ha", "weh", "luh", "ge", "alr", "edi wow", "tapos", "so", "ah", "oh", "hmm", "ewan", "malay ko", "sus", "pake ko", "ha?", "wehh", "dko alm", "wla", "cge"
];

const QUESTION_REPLIES = [
	"ewan", "di ko alam", "malay ko", "baka", "siguro", "depende", "bat mo natanong", "pano ko malalaman", "ikaw kaya sumagot", "ano tingin mo", "sino nagsabi", "ikaw n bahala mag-isip", "dko dn alam"
];

/* =========================
   SPAM PROTECTION
========================= */

function isSpamLike(text) {
	const value = normalize(text);
	if (!value) return true;
	if (value.length > MAX_MESSAGE_LENGTH) return true;
	if (/(.)\1{9,}/i.test(value)) return true;
	if (/[!?]{8,}/.test(value)) return true;
	return false;
}

function isDuplicate(thread, text) {
	const value = normalize(text);
	return (
		thread.lastInput === value &&
		Date.now() - thread.lastInputTime < DUPLICATE_WINDOW
	);
}

/* =========================
   REPLY GENERATOR
========================= */

function generateReply(input) {
	const text = String(input || "").trim();

	if (/^(hi|hello|hey|yo|sup|hoy|uy)$/i.test(text)) {
		return pick(["uy", "oh", "ano", "bakit", "yo", "hey", "ano n nman"]);
	}

	if (/[?]$/.test(text) || /\b(what|why|how|when|where|who)\b/i.test(text)) {
		return pick(QUESTION_REPLIES);
	}

	if (Math.random() < 0.25) {
		return pick(SHORT_REPLIES);
	}

	return pick(REPLIES);
}

function mimic(input, reply) {
	const text = String(input || "");
	if (Math.random() > 0.35) return reply;
	if (text === text.toLowerCase()) reply = reply.toLowerCase();
	return reply.trim();
}

async function typingOn(api, threadID) {
	try {
		if (api && typeof api.sendTypingIndicator === "function") {
			api.sendTypingIndicator(threadID, true);
		}
	} catch (_) {}
}

async function typingOff(api, threadID) {
	try {
		if (api && typeof api.sendTypingIndicator === "function") {
			api.sendTypingIndicator(threadID, false);
		}
	} catch (_) {}
}

/* =========================
   MAIN LOGIC HANDLER
========================= */

async function handleIncomingMessage({ api, event }) {
	if (!event) return;

	if (event.isSelf || event.senderID === api.getCurrentUserID?.()) {
		return;
	}

	const threadID = event.threadID;
	if (!threadID) return;

	const thread = getThread(threadID);

	const body = event.body || event.message || "";
	if (!body) return;

	const text = String(body).trim();
	const senderID = String(event.senderID || event.author || "");

	if (text === ".") {
		if (!ADMINS.has(senderID)) return;

		thread.enabled = !thread.enabled;
		saveState();

		try {
			if (typeof api.setMessageReaction === "function") {
				await api.setMessageReaction("❤️", event.messageID, () => {}, true);
			}
		} catch (e) {}

		return;
	}

	if (!thread.enabled) return;
	if (ADMINS.has(senderID)) return;
	if (isSpamLike(text)) return;
	if (isDuplicate(thread, text)) return;

	thread.lastInput = normalize(text);
	thread.lastInputTime = Date.now();
	saveState();

	const currentDelay = random(DELAY_MIN, DELAY_MAX);
	await sleep(currentDelay);

	await typingOn(api, threadID);
	await sleep(random(TYPING_MIN, TYPING_MAX));

	let reply = generateReply(text);
	reply = mimic(text, reply);

	try {
		await api.sendMessage(reply, threadID, event.messageID);
		thread.replyCount = Number(thread.replyCount || 0) + 1;
		saveState();
	} catch (err) {
		console.error("[HUMAN] Reply error:", err.message);
	} finally {
		await typingOff(api, threadID);
	}
}

/* =========================
   EXPORT MODULE
========================= */

module.exports = {
	config: {
		name: "human",
		version: "6.7",
		author: "Sinzu",
		countDown: 0,
		role: 0,
		description: {
			en: "Anti-detection human mimicker with conversational abbreviations and slangs",
			tl: "Anti-detection human mimicker with conversational abbreviations and slangs"
		},
		category: "system",
		guide: {
			en: ".",
			tl: "."
		}
	},

	run: async function ({ api, event, args }) {
		const senderID = String(event.senderID || event.senderId || "");
		const threadID = event.threadID;

		if (!ADMINS.has(senderID)) {
			return api.sendMessage("admin only.", threadID, event.messageID);
		}

		const thread = getThread(threadID);
		thread.enabled = !thread.enabled;
		saveState();

		try {
			if (typeof api.setMessageReaction === "function") {
				await api.setMessageReaction("❤️", event.messageID, () => {}, true);
			}
		} catch (e) {}
	},

	handleEvent: async function (context) {
		return await handleIncomingMessage(context);
	},

	onChat: async function (context) {
		return await handleIncomingMessage(context);
	},

	onMessage: async function (context) {
		return await handleIncomingMessage(context);
	}
};
