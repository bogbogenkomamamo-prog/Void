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
   SETTINGS
========================= */

const REPLY_DELAY = 5000; // 5 seconds per reply
const TYPING_MIN = 500;
const TYPING_MAX = 1500;

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
   REPLIES (100 BANAT)
========================= */

const REPLIES = [
	"hinay-hinay lang sa pagiisip baka maubos agad",
	"ang ingay mo pero parang walang laman",
	"tama na sa pagpapanggap, hindi bagong sa'yo",
	"puro ka amba pero walang resibo",
	"tingin mo angat ka na, nasa imbento ka pa lang",
	"bro, huminga ka muna baka mapano ka sa kakadada",
	"ang lakas ng loob mo, kaso hindi suportado ng utak",
	"puro ka salita, kulang sa substance",
	"hindi lahat ng maingay may kwenta",
	"kala mo may audience ka sa bawat galaw mo",
	"sobrang confident, kahit walang basehan",
	"hindi ka boss, ikaw lang nagbibigay ng titulo sa sarili mo",
	"kapag may premyo sa kadaldalan, siguradong kampeon ka",
	"tama na ang eksena, hindi ito pelikula",
	"ang dami mong alam pero parang walang naiintindihan",
	"nagpapaka-importanteng tao, eh walang nagtatanong",
	"puro ka clout, kulang ka sa content",
	"bro, hindi lahat ng opinyon mo kailangang marinig",
	"sobrang lakas ng ego, pero walang maipakita",
	"hindi ka nakakatakot, nakakatawa ka lang",
	"ang hirap mo kausap, parang walang signal",
	"naghahanap ka ng away kahit walang nag-iimbita",
	"puro ka pahirap sa sarili mong eksena",
	"kala mo ikaw ang main character sa lahat",
	"hindi ka naligaw, sadyang walang direksyon ang argumento mo",
	"tambay ka ba sa imbentong scenario?",
	"ang bilis mong magreply, sana ganon din kabilis ang pag-unawa mo",
	"hindi lahat ng may capslock, may point",
	"bro, parang wifi ka, mahina ang connection sa realidad",
	"ang dami mong sinasabi, pero walang direksyon",
	"nagpakalat ka na naman ng kalokohan",
	"puro ka flex, wala namang context",
	"kung may kompetisyon sa memahan, may tropeo ka na",
	"hindi ka pinapansin, gumaawa ka na naman ng ingay",
	"sobrang ganda ng imagination mo, sayang hindi totoo",
	"kala mo may point ka na, paulit-ulit lang pala",
	"hindi ka pinag-usapan, ikaw lang ang nag-aassume",
	"ang tapang mo sa chat, parang may sariling mundo",
	"puro ka reklamo, wala namang solusyon",
	"ang lakas mong magpaliwanag, kaso ikaw mismo hindi mo intindihin",
	"bro, magpahinga ka muna sa pagiging sentro ng atensyon",
	"ang dami mong alibi, parang may script ka",
	"hindi ka nagwawin, nagpapahaba ka lang ng usapan",
	"puro ka parinig, diretsuhin mo kung may sasabihin ka",
	"kala mo may impact lahat ng sinasabi mo",
	"hindi ka mahina, pero mahina ang argumento mo",
	"ang bilis mong maghusga, sana bilisan mo rin ang pag-unawa",
	"naghahabol ka ng clout na parang may utang sa'yo",
	"hindi ito paligsahan ng ego, bro",
	"ang dami mong angas, kulang sa common sense",
	"tama na ang pag-iimbento, nasa realidad tayo",
	"parang bot ka na paulit-ulit ang linya",
	"kahit ilang beses mong ulitin, hindi magiging totoo",
	"nagpakalimutan ka na naman sa sarili mong sinabi",
	"bro, walang nagpapataas ng score sa dami ng chat",
	"ang dami mong energy, sana may direksyon din",
	"hindi ka nakakalito, wala lang talagang koneksyon ang sinasabi mo",
	"nag-iingay ka na naman para lang mapansin",
	"puro ka teorya, nasan ang konkretong punto?",
	"kala mo may mic ka, lahat na lang may announcement",
	"hindi ka laging tama kahit ikaw pa ang pinaka-maingay",
	"parang comment section ang utak mo, puro reaksiyon",
	"ang hirap magpakatalino kapag walang pinanghawakan",
	"naghahanap ka ng issue kahit walang problema",
	"bro, hindi kailangang may last word ka palagi",
	"puro ka palabas, kulang sa nilalaman",
	"ang ganda ng kwento mo, kahit ikaw lang ang naniniwala",
	"hindi ka nakakalamang, nagpapaliguy-liguy ka lang",
	"may point ka ba o nagpra-practice ka lang magtype?",
	"kala mo may tropa ka sa likod ng bawat banat",
	"ang dami mong sinasabi, parang may bayad bawat letra",
	"nagpapaka-expert sa bagay na hindi mo naman maipaliwanag",
	"hindi lahat ng pagtatalo, kailangang panalunan",
	"sobrang dami mong claims, kulang naman sa ebidensiya",
	"bro, ang haba ng reply mo, pero walang diretso sagot",
	"kung may bayad ang pagmamahal sa sarili, mayaman ka na",
	"ang dami mong plano, kahit isa walang nagtutugma",
	"puro ka pa-cool, pero halatang pilit",
	"hindi ka nakakaprovoke, nakakatawa ka lang",
	"nagpapakalakas ka sa sarili mong kwento",
	"parang sirang record ang mga banat mo",
	"bro, hindi ka kailangang maging maingay para maging interesante",
	"ang dami mong alam sa buhay ng iba, sana may update din sa sarili mo",
	"hindi ka pinag-usapan, pero gusto mong may issue",
	"kala mo nakakalamang ka, paulit-ulit ka lang naman",
	"napakahaba ng eksena, pero walang kwentang plot",
	"puro ka pabida, wala namang nag-aaudition",
	"ang lakas mong magbitaw ng linya, parang may award sa dulo",
	"hindi ka nagpapatawa, pero ikaw ang naging joke",
	"ang dami mong sinasabi, kahit sarili mong argumento hindi mo masundan",
	"hindi ka kulang sa tapang, kulang ka lang sa paksa",
	"bro, hindi lahat ng pagtitype mo may katumbas na talino",
	"puro ka pa-epal, wala namang naghingi ng opinyon mo",
	"ang gulo ng kwento mo, parang random generator",
	"naghahanap ka ng kakalaban sa comment section",
	"hindi ka nakakatakot, mas nakakalito ka pa",
	"ang dami mong sinasabi, pero parang hangin lang",
	"tama na ang pagpapanggap na may alam sa lahat",
	"bro, mag-update ka naman ng bagong banat",
	"peace out na lang, sayang oras sa walang katapusang usapan"
];

const SHORT_REPLIES = [
	"ano",
	"bakit",
	"ha",
	"weh",
	"luh",
	"ge",
	"alr",
	"edi wow",
	"tapos",
	"so",
	"ah",
	"oh",
	"hmm",
	"ewan",
	"malay ko"
];

const QUESTION_REPLIES = [
	"ewan",
	"di ko alam",
	"malay ko",
	"baka",
	"siguro",
	"depende",
	"bat mo natanong",
	"pano ko malalaman",
	"ikaw kaya sumagot",
	"ano tingin mo"
];

/* =========================
   SPAM PROTECTION
========================= */

function isSpamLike(text) {
	const value = normalize(text);

	if (!value) return true;

	if (value.length > MAX_MESSAGE_LENGTH) {
		return true;
	}

	if (/(.)\1{9,}/i.test(value)) {
		return true;
	}

	if (/[!?]{8,}/.test(value)) {
		return true;
	}

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
		return pick([
			"uy",
			"oh",
			"ano",
			"bakit",
			"yo",
			"hey"
		]);
	}

	if (
		/[?]$/.test(text) ||
		/\b(what|why|how|when|where|who)\b/i.test(text)
	) {
		return pick(QUESTION_REPLIES);
	}

	if (Math.random() < 0.25) {
		return pick(SHORT_REPLIES);
	}

	return pick(REPLIES);
}

/* =========================
   MIMIC
========================= */

function mimic(input, reply) {
	const text = String(input || "");

	if (Math.random() > 0.35) {
		return reply;
	}

	if (text === text.toLowerCase()) {
		reply = reply.toLowerCase();
	}

	return reply.trim();
}

/* =========================
   TYPING INDICATOR
========================= */

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
	const lower = text.toLowerCase();
	const senderID = String(event.senderID || event.author || "");

	if (lower === "human on" || lower === "human off") {
		if (!ADMINS.has(senderID)) return;

		if (lower === "human on") {
			thread.enabled = true;
			saveState();
			return api.sendMessage("human mode on sa thread na ito.", threadID, event.messageID);
		}

		if (lower === "human off") {
			thread.enabled = false;
			saveState();
			return api.sendMessage("human mode off sa thread na ito.", threadID, event.messageID);
		}
		return;
	}

	if (!thread.enabled) return;

	if (ADMINS.has(senderID)) {
		return;
	}

	if (isSpamLike(text)) return;
	if (isDuplicate(thread, text)) return;

	thread.lastInput = normalize(text);
	thread.lastInputTime = Date.now();
	saveState();

	// 5 seconds delay bawat reply sa bawat mensahe
	await sleep(REPLY_DELAY);

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
		version: "6.1",
		author: "Sinzu",
		countDown: 0,
		role: 0,
		description: {
			en: "Thread-specific Tagalog human mimicker with 5s delay",
			tl: "Thread-specific Tagalog human mimicker with 5s delay"
		},
		category: "system",
		guide: {
			en: "human on\nhuman off",
			tl: "human on\nhuman off"
		}
	},

	run: async function ({ api, event, args }) {
		const senderID = String(event.senderID || event.senderId || "");
		const threadID = event.threadID;

		if (!ADMINS.has(senderID)) {
			return api.sendMessage("admin only.", threadID, event.messageID);
		}

		const thread = getThread(threadID);
		const action = String(args[0] || "").toLowerCase();

		if (action === "on") {
			thread.enabled = true;
			saveState();
			return api.sendMessage("human mode on sa thread na ito.", threadID, event.messageID);
		}

		if (action === "off") {
			thread.enabled = false;
			saveState();
			return api.sendMessage("human mode off sa thread na ito.", threadID, event.messageID);
		}

		return api.sendMessage(`Human mode sa thread na ito ay: ${thread.enabled ? "ON" : "OFF"}`, threadID, event.messageID);
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
