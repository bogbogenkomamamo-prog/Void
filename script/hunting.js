/**
 * Command: Hunting & Count Engine System (Admin Only + Non-Repeating Words)
 * Design/Theme: VOIDLESS4LGNG
 */

if (!global.huntingState) global.huntingState = new Map();
if (!global.countEngineState) global.countEngineState = new Map();

// Trackers para maiwasan ang pag-uulit ng salita
let usedReplies = [];
let usedSuffixes = [];

// Helper for Human Mimicker (Diacritics)
function humanizeText(text) {
	const replacements = {
		'a': ['a', 'à', 'ā', 'ą', 'ä', 'â', 'á', 'å'],
		'e': ['e', 'ē', 'ê', 'ë', 'è', 'é'],
		'i': ['i', 'ī', 'î', 'ï', 'í', 'ì'],
		'o': ['o', 'ō', 'ó', 'ö', 'ô', 'ò'],
		'u': ['u', 'ū', 'û', 'ü', 'ú', 'ù']
	};

	return text.split('').map(char => {
		const lower = char.toLowerCase();
		if (replacements[lower] && Math.random() < 0.3) {
			const sub = replacements[lower][Math.floor(Math.random() * replacements[lower].length)];
			return char === char.toUpperCase() ? sub.toUpperCase() : sub;
		}
		return char;
	}).join('');
}

// Malaking listahan ng Main Replies
const baseReplies = [
	"wag ka mawawala lods 🥷🔥",
	"ops nawala ako bigla 🤡🤣",
	"nawala ata ako san ka napunta 💩",
	"bawal waterbreak at pahinga dito 🩸⚔️",
	"moka ka tabo bro hahaha 🤪🪠",
	"san ka na pupunta haha takbo pa 🏃‍♂️💨",
	"hanggang madaling araw to boy wag ka susuko 🥷🩸",
	"tulog ka na ba agad mahina ka pala 😴💤",
	"galaw galaw baka pumanaw ka diyan 💀⚰️",
	"bawal magpahinga dito laban lang 🥊🔥",
	"isa pa nga diyan bawi ka dali 🎯",
	"umiyak ka na lang sa gilid bro 🥺😂",
	"palag ka pa ba o tameme ka na? 🤫🥷",
	"parang di mo man lang kinaya ah 📉🤪",
	"pasok sa banga ka nanaman boy 🗑️💥",
	"ipahinga mo na yang kamay mo nanginginig na 🤏🤣",
	"ngawit ka na ba mag-type? 🦾🤖",
	"wala ka palang maipakita eh 📉👎",
	"asan na yung tapang mo kanina? 👻⚡",
	"kala ko ba palag ka bat parang nag-aagaw buhay ka na? 🧟‍♂️🩸",
	"hinga ka muna malalim baka atakihin ka 🫁💨",
	"lutang ka na ata sa puyat boss 😵‍💫🌌",
	"yan na ba pinakamabilis mo mag-type? bagal ah 🐢⏱️",
	"sumuko ka na lang para di ka na mahirapan 🏳️🥷",
	"i-iyak mo na lang yan walang makakakita 🥲🌧",
	"tulog na yung kalaban antok na antok na 🥱🛌",
	"may tubig pa ba diyan? tagak ka na eh 💧🥵",
	"parang computer icon lang lods, stock up ka na 🖥️🤡",
	"nag-iisip ka pa ba ng ire-reply o umiiyak ka na? 🧠💥",
	"subukan mo ulit baka sakaling pumasa ka na 📝🔥"
];

// Malaking listahan ng Suffixes
const baseSuffixes = [
	"dami mong sinasabi papansin ka lang 🗣️🤡",
	"sunod sunod ah galit na galit yarn? 🤬🔥",
	"hinay hinay lang lods baka mapagod ka 🐢💨",
	"spammer yarn? pondo muna lods 📦🤣",
	"iyak na yarn haha sige pa 😭🩸",
	"hinga muna baka mahimatay ka 😮‍💨💀",
	"bagsak ka nanaman boy aral ka muna 📚📉",
	"tuloy mo lang yan hanggang bukas 🗓️🥷",
	"mabilis mag-type pero walang laman 🗑️🤷‍♂️",
	"paulit-ulit na lang sinasabi mo 🔁🤦‍♂️",
	"walang epekto yang ginagawa mo 🧊⚡",
	"pumipiyok ka na ata sa chat 🐥🔊",
	"ubos na ba linyahan mo? tulungan kita 📖🤡",
	"pukpok mo muna sa pader yang ulo mo baka magising ka 🧱🔨"
];

function UniqueReply() {
	if (usedReplies.length >= baseReplies.length) usedReplies = [];
	let available = baseReplies.filter(item => !usedReplies.includes(item));
	let chosen = available[Math.floor(Math.random() * available.length)];
	usedReplies.push(chosen);
	return chosen;
}

function UniqueSuffix() {
	if (usedSuffixes.length >= baseSuffixes.length) usedSuffixes = [];
	let available = baseSuffixes.filter(item => !usedSuffixes.includes(item));
	let chosen = available[Math.floor(Math.random() * available.length)];
	usedSuffixes.push(chosen);
	return chosen;
}

// Helper Function para sa Auto Counting Engine (Max 50 + Resibo)
async function startCounting(api, threadID, message, mentionText = "") {
	let count = 1;
	const maxCount = 50;
	global.countEngineState.set(threadID, true);

	const startTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

	while (global.countEngineState.get(threadID) === true && count <= maxCount) {
		await message.send(`${count}`);
		
		if (count === maxCount) {
			global.countEngineState.set(threadID, false);

			const endTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

			const resiboMessage = 
				`🧾 🥷🩸 VOIDLESS4LGNG OFFICIAL RESIBO 🩸🥷 🧾\n` +
				`━━━━━━━━━━━━━━━━━━━\n` +
				`🎯 TARGET: ${mentionText ? mentionText : "EVERYONE"}\n` +
				`📊 TOTAL COUNT: ${maxCount} / ${maxCount}\n` +
				`⏰ START TIME: ${startTime}\n` +
				`⏱ FINISH TIME: ${endTime}\n` +
				`STATUS: COMPLETED & VICTORY! 🏆💥\n` +
				`━━━━━━━━━━━━━━━━━━━\n` +
				`🔥 VOIDLESS4LGNG COUNT ENGINE FINISHED 🔥`;

			await new Promise(resolve => setTimeout(resolve, 500));
			return message.send(resiboMessage);
		}

		count++;
		await new Promise(resolve => setTimeout(resolve, 500));
	}
}

module.exports = {
	config: {
		name: "hunting",
		version: "3.5",
		author: "User",
		countDown: 0,
		role: 1, // Admin Only
		description: {
			en: "Admin-Only Hunting Autoreply and VOIDLESS4LGNG Count Engine",
			tl: "Admin-Only na Hunting Autoreply at VOIDLESS4LGNG Count Engine"
		},
		category: "fun",
		guide: {
			en: ".start | .off | /count on | /count off",
			tl: ".start | .off | /count on | /count off"
		}
	},

	onStart: async function ({ args, message, event }) {
		const threadID = event.threadID;
		const option = args[0] ? args[0].toLowerCase() : "";

		if (option === "start" || option === "on") {
			global.huntingState.set(threadID, true);
			return message.reply("🔥 Hunting Autoreply mode activated! 🥷🩸");
		} else if (option === "off") {
			global.huntingState.set(threadID, false);
			return message.reply("💤 Hunting Autoreply mode deactivated.");
		} else {
			return message.reply(
				"🥷🩸 VOIDLESS4LGNG COUNT ENGINE 🩸🥷\n\n" +
				"• .start / .off\n" +
				"• /count on\n" +
				"• /count on @mention\n" +
				"• /count off"
			);
		}
	},

	onChat: async function ({ api, event, message, role }) {
		const { threadID, senderID, body, mentions } = event;

		if (senderID === api.getCurrentUserID() || !body) return;

		const text = body.trim().toLowerCase();

		// 1. NINJA REACTION TEST
		if (text === ".") {
			if (api.setMessageReaction) {
				return api.setMessageReaction("🥷", event.messageID, (err) => {}, true);
			}
		}

		// ADMIN CHECKER (Requirement para sa control commands)
		const isAdmin = role >= 1; // 1 = Group Admin / Bot Admin

		// 2. TOGGLE COMMANDS (.start & .off) - ADMIN ONLY
		if (text === ".start" || text === "start") {
			if (!isAdmin) return message.reply("⚠️ Admin lang ang pwedeng mag-turn ON ng Hunting Mode! 🥷");
			global.huntingState.set(threadID, true);
			return message.reply("🔥 Hunting Autoreply mode activated! 🥷🩸");
		}

		if (text === ".off" || text === "off") {
			if (!isAdmin) return message.reply("⚠️ Admin lang ang pwedeng mag-turn OFF ng Hunting Mode! 🥷");
			global.huntingState.set(threadID, false);
			return message.reply("💤 Hunting Autoreply mode deactivated.");
		}

		// 3. COUNT ENGINE COMMANDS - ADMIN ONLY
		if (text.startsWith("/count")) {
			if (!isAdmin) return message.reply("⚠️ Admin lang ang pwedeng gumamit ng Count Engine! 🥷");

			if (text === "/count naba ako" || text === "/count") {
				return message.reply(
					"🥷🩸 VOIDLESS4LGNG COUNT ENGINE 🩸🥷\n\n" +
					"• .start / .off\n" +
					"• /count on\n" +
					"• /count on @mention\n" +
					"• /count off"
				);
			}

			if (text.startsWith("/count on")) {
				if (global.countEngineState.get(threadID)) {
					return message.reply("⚠️ Naka-ON na ang Count Engine! 🥷");
				}
				
				let mentionText = "";
				if (mentions && Object.keys(mentions).length > 0) {
					const targetID = Object.keys(mentions)[0];
					mentionText = `@${mentions[targetID]}`;
				}

				message.reply(`🥷🩸 VOIDLESS4LGNG COUNT ENGINE ACTIVATED ${mentionText} 🩸🥷\n🎯 Target: Up to 50 Count!`);
				startCounting(api, threadID, message, mentionText);
				return;
			}

			if (text === "/count off") {
				global.countEngineState.set(threadID, false);
				return message.reply("🛑 VOIDLESS4LGNG COUNT ENGINE DEACTIVATED.");
			}
		}

		// 4. DYNAMIC NON-REPEATING HUNTING AUTOREPLY SYSTEM
		const isHuntingActive = global.huntingState.get(threadID);
		if (!isHuntingActive) return;

		try {
			if (api.sendTypingIndicator) api.sendTypingIndicator(threadID);
		} catch (e) {}

		let selectedLine = UniqueReply();

		if (body.length < 5 || body.includes("!") || body.length > 30) {
			const extraSuffix = UniqueSuffix();
			selectedLine += " " + extraSuffix;
		}

		const humanizedMessage = humanizeText(selectedLine);
		const delay = Math.floor(Math.random() * 1000) + 1000;

		setTimeout(async () => {
			return message.send(humanizedMessage);
		}, delay);
	}
};
