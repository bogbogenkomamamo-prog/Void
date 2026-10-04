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
	"61594981323552"
]);

/* =========================
   SETTINGS
========================= */

const REPLY_DELAY = 10000; // 10 seconds
const TYPING_MIN = 700;
const TYPING_MAX = 1800;

const THREAD_COOLDOWN = 10000;
const DUPLICATE_WINDOW = 60000;
const MAX_MESSAGE_LENGTH = 500;

/* =========================
   STATE
========================= */

let state = {
	enabled: false,
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
			enabled: Boolean(data.enabled),
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
			lastMessage: 0,
			lastReply: 0,
			lastInput: "",
			lastInputTime: 0,
			replyCount: 0
		};
	}

	return state.threads[threadID];
}

/* =========================
   REPLIES
========================= */

const REPLIES = [
	"ano ba yan",
	"eto na naman",
	"ikaw na naman",
	"wala ka bang ibang alam",
	"ang kulit mo",
	"di ka pa tapos",
	"may ambag ka ba",
	"seryoso ka ba",
	"ano bang trip mo",
	"umayos ka nga",
	"tigil mo yan",
	"wag ka ngang ganyan",
	"corny mo",
	"ang ingay mo",
	"ayan na naman siya",
	"feeling mo naman",
	"lakas mo ah",
	"mayabang ka na naman",
	"kalma ka lang",
	"hinga muna",
	"wag kang excited",
	"di kita kinakausap",
	"bakit ka nandito",
	"sinong nagtawag sayo",
	"may kailangan ka",
	"ano gusto mo",
	"gusto mo medal",
	"congrats sayo",
	"wow proud ka",
	"edi ikaw na",
	"ikaw na magaling",
	"wow naman",
	"grabe ka na",
	"napaka kulit",
	"wala kang preno",
	"di ka talaga tumitigil",
	"hanggang dyan ka lang",
	"ayan ka na naman eh",
	"pinipilit mo talaga",
	"wag mo kong simulan",
	"baka maiyak ka",
	"kalma baka maiyak",
	"iyak ka muna",
	"arte mo",
	"dramatic mo",
	"nakakahiya ka",
	"tama na yan",
	"pagbigyan na kita",
	"swerte mo kausap mo",
	"special ka",
	"feeling main character",
	"may pa entry ka pa",
	"required ba yan",
	"sinong nagtanong",
	"may nagtatanong ba",
	"interesting hindi",
	"noted next",
	"okay ka lang",
	"parang may problema ka",
	"kulang ka lang sa tulog",
	"matulog ka na",
	"kumain ka muna",
	"baka gutom ka lang",
	"wag ka magkalat",
	"tahimik ka muna",
	"ge lang nang ge",
	"push mo yan mag isa",
	"support kita from afar",
	"bahala ka sa buhay mo",
	"good luck sayo",
	"malala na ata to",
	"wala na pag asa",
	"ayoko na sayo",
	"joke lang baka seryosohin mo",
	"wag kang pikon",
	"pikon ka ba",
	"galit agad",
	"easy ka lang",
	"konti lang asar",
	"mahina ka naman pala",
	"di ka kaya dito",
	"subukan mo pa",
	"yan lang",
	"yun na yon",
	"bitin naman",
	"wala bang mas maganda",
	"next topic",
	"skip natin yan",
	"nakakatamad ka kausap",
	"mamaya na kita aasarin",
	"save muna energy mo",

	"bat ganyan ka",
	"ano trip mo",
	"ikaw na naman",
	"edi wow",
	"ge ikaw na",
	"luh pikon",
	"weh",
	"seryoso ka ba",
	"fr ang kulit mo",
	"tbh ang ingay mo",
	"ngl corny mo",
	"idk sayo",
	"wdym ikaw nga",
	"alr tama na",
	"bruh ano yan",
	"bro kalma",
	"bro pls",
	"ah basta",
	"ge lang",
	"ikaw bahala",
	"malay ko sayo",
	"ewan sayo",
	"di ko gets sayo",
	"ano nanaman",
	"may bago ka bang script",
	"paulit ulit ka",
	"same script nanaman",
	"wala ka bang ibang banat"
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
	"malay ko",
	"ikaw bahala",
	"ano naman",
	"bat",
	"seryoso",
	"pikon"
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
	"ano tingin mo",
	"di ko sure",
	"baka ikaw may alam",
	"tanong mo sa iba",
	"bakit ako",
	"ako pa tinanong mo"
];

/* =========================
   SPAM PROTECTION
========================= */

function isSpamLike(text) {
	const value = normalize(text);

	if (!value) return true;

	if (
		value.length >
		MAX_MESSAGE_LENGTH
	) {
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
		Date.now() -
			thread.lastInputTime <
			DUPLICATE_WINDOW
	);
}

/* =========================
   REPLY GENERATOR
========================= */

function generateReply(input) {
	const text = String(input || "").trim();
	const lower = text.toLowerCase();

	if (
		/^(hi|hello|hey|yo|sup|hoy|uy)$/i.test(text)
	) {
		return pick([
			"uy",
			"oh",
			"ano",
			"bakit",
			"yo",
			"hey",
			"eto nanaman"
		]);
	}

	if (
		/[?]$/.test(text) ||
		/\b(what|why|how|when|where|who)\b/i.test(text)
	) {
		return pick(QUESTION_REPLIES);
	}

	if (
		/\b(lol|lmao|haha|hahaha|hehe)\b/i.test(lower)
	) {
		return pick([
			"ano nakakatawa",
			"tawa ka nang tawa",
			"lakas tawa",
			"okay ka lang",
			"corny",
			"seryoso ka",
			"ayan nanaman",
			"di naman nakakatawa",
			"ge tawa pa"
		]);
	}

	if (
		/\b(bakit|bat)\b/i.test(lower)
	) {
		return pick([
			"ewan",
			"wala lang",
			"trip ko lang",
			"basta",
			"di ko alam",
			"bat ba",
			"malay ko",
			"ganun lang",
			"ikaw kasi"
		]);
	}

	if (
		/\b(ano|anong)\b/i.test(lower)
	) {
		return pick([
			"ano",
			"bakit",
			"e ano",
			"anong meron",
			"malay ko",
			"ewan",
			"ano naman",
			"bat mo gusto malaman"
		]);
	}

	// Hindi automatic na sumasang-ayon.
	if (
		/\b(oo|opo|yes|yeah|yea|yup)\b/i.test(lower)
	) {
		return pick([
			"ge",
			"edi sige",
			"tapos",
			"so",
			"ano next",
			"okay na",
			"ayan",
			"noted",
			"ikaw bahala"
		]);
	}

	if (
		/\b(hindi|di|no|nah|nope)\b/i.test(lower)
	) {
		return pick([
			"ah",
			"okay",
			"ge",
			"edi wag",
			"bahala ka",
			"ikaw bahala",
			"noted",
			"tapos"
		]);
	}

	if (Math.random() < 0.30) {
		return pick(SHORT_REPLIES);
	}

	return pick(REPLIES);
}

/* =========================
   MIMIC
========================= */

function mimic(input, reply) {
	const text = String(input || "");
	const lower = text.toLowerCase();

	if (Math.random() > 0.35) {
		return reply;
	}

	if (text === text.toLowerCase()) {
		reply = reply.toLowerCase();
	}

	const abbreviations = [
		"bat",
		"di",
		"ge",
		"alr",
		"fr",
		"tbh",
		"ngl",
		"idk",
		"wdym",
		"wym",
		"rn",
		"btw"
	];

	const hasAbbreviation =
		abbreviations.some(word =>
			new RegExp(
				`(^|\\s)${word}(\\s|$)`,
				"i"
			).test(lower)
		);

	if (
		hasAbbreviation &&
		Math.random() < 0.60
	) {
		const suffix = pick([
			"ah",
			"eh",
			"oh",
			"ig",
			"tbh",
			"fr",
			"lang",
			"naman"
		]);

		if (
			!reply
				.toLowerCase()
				.includes(suffix)
		) {
			reply += " " + suffix;
		}
	}

	return reply.trim();
}

/* =========================
   TYPING INDICATOR
========================= */

async function typingOn(message) {
	try {
		if (
			typeof message.sendTypingIndicator ===
			"function"
		) {
			await message.sendTypingIndicator();
			return;
		}

		if (
			message.api &&
			message.threadID &&
			typeof message.api.sendTypingIndicator ===
			"function"
		) {
			message.api.sendTypingIndicator(
				message.threadID,
				true
			);
		}
	} catch (_) {}
}

async function typingOff(message) {
	try {
		if (
			message.api &&
			message.threadID &&
			typeof message.api.sendTypingIndicator ===
			"function"
		) {
			message.api.sendTypingIndicator(
				message.threadID,
				false
			);
		}
	} catch (_) {}
}

/* =========================
   COMMAND
   PREFIXLESS
========================= */

module.exports = {

	config: {
		name: "human",
		version: "5.0",
		author: "Sinzu",
		countDown: 0,
		role: 0,

		description: {
			en: "Prefixless Tagalog human mimicker",
			tl: "Prefixless Tagalog human mimicker"
		},

		category: "system",

		guide: {
			en: "human on\nhuman off",
			tl: "human on\nhuman off"
		}
	},

	/*
	 * Optional prefixed usage:
	 * human on
	 * human off
	 */
	onStart: async function ({
		args,
		message
	}) {

		const senderID =
			message.senderID ||
			message.senderId;

		if (
			!ADMINS.has(
				String(senderID)
			)
		) {
			return message.reply(
				"admin only."
			);
		}

		const action =
			String(
				args[0] || ""
			).toLowerCase();

		if (action === "on") {
			state.enabled = true;
			saveState();

			return message.reply(
				"human mode on."
			);
		}

		if (action === "off") {
			state.enabled = false;
			saveState();

			return message.reply(
				"human mode off."
			);
		}

		return message.reply(
			"human on / human off"
		);
	},

	/*
	 * Prefixless detector
	 */
	handleEvent: async function ({
		event,
		message
	}) {

		if (!event) return;

		const body =
			event.body ||
			event.message ||
			"";

		if (!body) return;

		const text =
			String(body).trim();

		const lower =
			text.toLowerCase();

		/*
		 * =========================
		 * PREFIXLESS ON / OFF
		 * =========================
		 */

		if (
			lower === "human on" ||
			lower === "human off"
		) {

			const senderID =
				event.senderID ||
				event.author;

			if (
				!ADMINS.has(
					String(senderID)
				)
			) {
				return;
			}

			if (lower === "human on") {
				state.enabled = true;
				saveState();

				return message.reply(
					"human mode on."
				);
			}

			if (lower === "human off") {
				state.enabled = false;
				saveState();

				return message.reply(
					"human mode off."
				);
			}

			return;
		}

		/*
		 * Don't process commands while
		 * human mode is disabled.
		 */

		if (!state.enabled) return;

		/*
		 * Ignore obvious bot/self messages.
		 */

		if (
			event.isSelf ||
			event.isBot
		) {
			return;
		}

		const senderID =
			event.senderID ||
			event.author;

		if (
			senderID &&
			ADMINS.has(
				String(senderID)
			)
		) {
			return;
		}

		const threadID =
			event.threadID ||
			message.threadID;

		if (!threadID) return;

		if (isSpamLike(text)) {
			return;
		}

		const thread =
			getThread(threadID);

		/*
		 * Duplicate protection.
		 */

		if (
			isDuplicate(
				thread,
				text
			)
		) {
			return;
		}

		/*
		 * Save incoming activity.
		 */

		thread.lastMessage =
			Date.now();

		thread.lastInput =
			normalize(text);

		thread.lastInputTime =
			Date.now();

		saveState();

		/*
		 * 10-second cooldown.
		 */

		if (
			Date.now() -
				Number(
					thread.lastReply || 0
				) <
			THREAD_COOLDOWN
		) {
			return;
		}

		/*
		 * Generate response.
		 */

		let reply =
			generateReply(text);

		reply =
			mimic(
				text,
				reply
			);

		/*
		 * Wait exactly 10 seconds.
		 */

		await sleep(
			REPLY_DELAY
		);

		/*
		 * Typing indicator.
		 */

		await typingOn(message);

		await sleep(
			random(
				TYPING_MIN,
				TYPING_MAX
			)
		);

		try {

			await message.reply(
				reply
			);

			thread.lastReply =
				Date.now();

			thread.replyCount =
				Number(
					thread.replyCount || 0
				) + 1;

			saveState();

		} catch (err) {

			console.error(
				"[HUMAN] Reply error:",
				err.message
			);

		} finally {

			await typingOff(
				message
			);

		}
	}
};
