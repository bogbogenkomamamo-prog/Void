"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const chalk = require("chalk");
const cron = require("node-cron");
const fsExtra = require("fs-extra");
const login = require("fca-unofficial");

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;

const DATA_DIR = path.join(ROOT, "data");
const SESSION_DIR = path.join(DATA_DIR, "session");
const SCRIPT_DIR = path.join(ROOT, "script");
const CACHE_DIR = path.join(SCRIPT_DIR, "cache");

const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const DATABASE_FILE = path.join(DATA_DIR, "database.json");
const DEV_FILE = path.join(ROOT, "dev.json");

// ============================================================
// SETTINGS
// ============================================================

const SETTINGS = {
    MIN_REPLY_DELAY: 7000,
    MAX_REPLY_DELAY: 12000,
    MIN_TYPING_DELAY: 1000,
    MAX_TYPING_DELAY: 2500,
    DUPLICATE_WINDOW: 30000,
    SPAM_WINDOW: 60000,
    MAX_MESSAGES_PER_WINDOW: 8,
    INITIAL_RECONNECT_DELAY: 5000,
    MAX_RECONNECT_DELAY: 60000,
    HEALTH_INTERVAL: 30000,
    MAX_QUEUE_PER_THREAD: 3
};

// ============================================================
// DIRECTORY SETUP
// ============================================================

function ensureDirectory(dir) {
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    } catch (error) {
        console.error(chalk.red(`[FS] Failed creating directory: ${dir}`), error.message);
    }
}

ensureDirectory(DATA_DIR);
ensureDirectory(SESSION_DIR);
ensureDirectory(CACHE_DIR);

// ============================================================
// JSON HELPERS
// ============================================================

function readJSON(file, fallback) {
    try {
        if (!fs.existsSync(file)) return fallback;
        const raw = fs.readFileSync(file, "utf8");
        if (!raw.trim()) return fallback;
        return JSON.parse(raw);
    } catch (error) {
        return fallback;
    }
}

function writeJSON(file, data) {
    try {
        const tempFile = `${file}.tmp`;
        fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf8");
        fs.renameSync(tempFile, file);
        return true;
    } catch (error) {
        return false;
    }
}

const BOT_CONFIG = readJSON(CONFIG_FILE, []);

const Utils = {
    commands: new Map(),
    handleEvent: new Map(),
    account: new Map(),
    cooldowns: new Map(),
    connections: new Map(),
    reconnecting: new Set()
};

// ============================================================
// COMMAND LOADER
// ============================================================

function normalizeAliases(value) {
    if (Array.isArray(value)) return [...value];
    if (typeof value === "string" && value.length > 0) return [value];
    return [];
}

function installCommand(filePath) {
    try {
        delete require.cache[require.resolve(filePath)];
        const loaded = require(filePath);
        if (!loaded || !loaded.config) return;

        const rawConfig = loaded.config;
        const name = rawConfig.name || rawConfig.Name || path.basename(filePath, ".js");
        const aliases = normalizeAliases(rawConfig.aliases || rawConfig.Aliases);
        const lowerName = String(name).toLowerCase();

        if (!aliases.includes(lowerName)) {
            aliases.push(lowerName);
        }

        const commandData = {
            name,
            role: rawConfig.role ?? rawConfig.hasPermission ?? 0,
            run: loaded.run,
            aliases,
            description: rawConfig.description || "",
            usage: rawConfig.usage || "",
            version: rawConfig.version || "1.0.0",
            hasPrefix: rawConfig.hasPrefix !== undefined ? rawConfig.hasPrefix : true,
            credits: rawConfig.credits || "",
            cooldown: Number(rawConfig.cooldown || 0),
            dev: Boolean(rawConfig.dev)
        };

        if (typeof loaded.run === "function") {
            for (const alias of aliases) {
                Utils.commands.set(alias, commandData);
            }
        }

        if (typeof loaded.handleEvent === "function") {
            for (const alias of aliases) {
                Utils.handleEvent.set(alias, {
                    ...commandData,
                    handleEvent: loaded.handleEvent
                });
            }
        }

        console.log(chalk.green(`[COMMAND] Loaded: ${name}`));
    } catch (error) {
        console.error(chalk.red(`[COMMAND] Failed loading ${filePath}:`), error.message);
    }
}

function loadCommands() {
    if (!fs.existsSync(SCRIPT_DIR)) return;
    const files = fs.readdirSync(SCRIPT_DIR);

    for (const file of files) {
        const fullPath = path.join(SCRIPT_DIR, file);
        let stats;
        try {
            stats = fs.statSync(fullPath);
        } catch (error) {
            continue;
        }

        if (stats.isDirectory()) {
            let children;
            try {
                children = fs.readdirSync(fullPath);
            } catch (error) {
                continue;
            }
            for (const child of children) {
                if (child.endsWith(".js")) {
                    installCommand(path.join(fullPath, child));
                }
            }
        } else if (stats.isFile() && file.endsWith(".js")) {
            installCommand(fullPath);
        }
    }
}

loadCommands();

// ============================================================
// HUMAN HANDLER
// ============================================================

class HumanHandler {
    constructor() {
        this.lastMessages = new Map();
        this.userMessages = new Map();
        this.processingThreads = new Set();
        this.replyQueues = new Map();
        this.messageHashes = new Map();
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    random(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    randomReplyDelay() {
        return this.random(SETTINGS.MIN_REPLY_DELAY, SETTINGS.MAX_REPLY_DELAY);
    }

    randomTypingDelay() {
        return this.random(SETTINGS.MIN_TYPING_DELAY, SETTINGS.MAX_TYPING_DELAY);
    }

    hash(value) {
        let hash = 0;
        const text = String(value || "");
        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0;
        }
        return String(hash);
    }

    getMessageKey(event) {
        if (!event) return null;
        const threadID = event.threadID || "";
        const senderID = event.senderID || "";
        const body = event.body || "";
        if (!body) return null;
        return [threadID, senderID, this.hash(body)].join(":");
    }

    isDuplicate(event) {
        const key = this.getMessageKey(event);
        if (!key) return false;
        const now = Date.now();
        const previous = this.lastMessages.get(key);
        if (previous && now - previous < SETTINGS.DUPLICATE_WINDOW) {
            return true;
        }
        this.lastMessages.set(key, now);
        this.cleanupMap(this.lastMessages, SETTINGS.DUPLICATE_WINDOW);
        return false;
    }

    isSpam(event) {
        if (!event) return false;
        const senderID = event.senderID;
        if (!senderID) return false;
        const now = Date.now();
        let messages = this.userMessages.get(senderID) || [];
        messages = messages.filter(timestamp => now - timestamp < SETTINGS.SPAM_WINDOW);
        messages.push(now);
        this.userMessages.set(senderID, messages);
        return messages.length > SETTINGS.MAX_MESSAGES_PER_WINDOW;
    }

    cleanupMap(map, lifetime) {
        const now = Date.now();
        for (const [key, timestamp] of map.entries()) {
            if (now - timestamp > lifetime) {
                map.delete(key);
            }
        }
    }

    getStats() {
        return {
            duplicateCache: this.lastMessages.size,
            trackedUsers: this.userMessages.size,
            activeThreads: this.processingThreads.size,
            queuedThreads: this.replyQueues.size
        };
    }
}

const humanHandler = new HumanHandler();

// ============================================================
// EXPRESS & ROUTES
// ============================================================

app.use(express.static(path.join(ROOT, "public")));
app.use(express.json({ limit: "10mb" }));

app.get("/health", (req, res) => {
    res.json({
        status: "online",
        uptime: process.uptime(),
        accounts: Utils.account.size,
        commands: Utils.commands.size,
        connections: Utils.connections.size,
        reconnecting: Utils.reconnecting.size,
        human: humanHandler.getStats(),
        timestamp: new Date().toISOString()
    });
});

app.get("/info", (req, res) => {
    const data = Array.from(Utils.account.values()).map(account => ({
        name: account.name || "Unknown",
        profileUrl: account.profileUrl || "",
        thumbSrc: account.thumbSrc || "",
        time: Number(account.time || 0)
    }));
    res.json(data);
});

// ============================================================
// RECONNECT MANAGER
// ============================================================

const reconnectTimers = new Map();
const reconnectAttempts = new Map();

function getReconnectDelay(userId) {
    const attempts = reconnectAttempts.get(userId) || 0;
    const exponential = SETTINGS.INITIAL_RECONNECT_DELAY * Math.pow(2, Math.min(attempts, 5));
    const delay = Math.min(exponential, SETTINGS.MAX_RECONNECT_DELAY);
    const jitter = Math.floor(Math.random() * 1500);
    return delay + jitter;
}

function reconnectAccount(state, userId) {
    if (!state) return;
    if (reconnectTimers.has(userId)) return;
    if (Utils.reconnecting.has(userId)) return;

    Utils.reconnecting.add(userId);
    const attempts = (reconnectAttempts.get(userId) || 0) + 1;
    reconnectAttempts.set(userId, attempts);

    const delay = getReconnectDelay(userId);
    console.log(chalk.yellow(`[RECONNECT] ${userId} retry #${attempts} in ${delay}ms`));

    const timer = setTimeout(() => {
        reconnectTimers.delete(userId);
        Utils.reconnecting.delete(userId);
        try {
            accountLogin(state, userId, false);
        } catch (error) {
            reconnectAccount(state, userId);
        }
    }, delay);

    reconnectTimers.set(userId, timer);
}

function resetReconnectAttempts(userId) {
    reconnectAttempts.delete(userId);
}

// ============================================================
// LOGIN FUNCTION & PERSISTENCE
// ============================================================

function accountLogin(state, userId, saveToDisk = true) {
    if (!state || typeof state !== "object") {
        console.error(chalk.red(`[LOGIN] Invalid appState for ${userId}`));
        return;
    }

    const fcaOption = BOT_CONFIG[0]?.fcaOption || {
        forceLogin: true,
        listenEvents: true,
        logLevel: "silent",
        updatePresence: true,
        selfListen: true
    };

    if (saveToDisk) {
        try {
            const sessionFile = path.join(SESSION_DIR, `${userId}.json`);
            fs.writeFileSync(sessionFile, JSON.stringify(state, null, 2), "utf8");
        } catch (error) {
            console.error(chalk.red(`[SESSION] Failed to save session for ${userId}:`), error.message);
        }
    }

    try {
        login({ appState: state }, fcaOption, async (err, api) => {
            if (err) {
                console.error(chalk.red(`[LOGIN] Failed for user ${userId}:`), err.error || err);
                Utils.account.delete(userId);
                Utils.connections.delete(userId);
                reconnectAccount(state, userId);
                return;
            }

            resetReconnectAttempts(userId);
            console.log(chalk.green(`[LOGIN] Successfully logged in for ID: ${userId}`));

            try {
                const userInfo = await new Promise(resolve => {
                    api.getUserInfo(userId, (infoError, ret) => {
                        if (infoError || !ret || !ret[userId]) {
                            resolve({ name: "User", profileUrl: "", thumbSrc: "" });
                            return;
                        }
                        resolve({
                            name: ret[userId].name || "User",
                            profileUrl: ret[userId].profileUrl || "",
                            thumbSrc: ret[userId].thumbSrc || ""
                        });
                    });
                });

                Utils.account.set(userId, { api, ...userInfo, time: Date.now() });
                Utils.connections.set(userId, { api, state, connectedAt: Date.now() });

                console.log(chalk.green(`[ACCOUNT] ${userInfo.name} is ready.`));
            } catch (error) {
                console.error(chalk.red("[SETUP ERROR]"), error.message);
            }

            try {
                api.listenMqtt(async (listenerError, event) => {
                    if (listenerError) {
                        console.error(chalk.red(`[LISTENER ERROR] ${userId}:`), listenerError.error || listenerError);
                        Utils.account.delete(userId);
                        Utils.connections.delete(userId);
                        reconnectAccount(state, userId);
                        return;
                    }

                    if (!event) return;
                    if (humanHandler.isDuplicate(event)) return;
                    if (humanHandler.isSpam(event)) return;

                    const account = Utils.account.get(userId);
                    if (account) {
                        account.time = Date.now();
                        Utils.account.set(userId, account);
                    }

                    // Command Handler
                    if (event.type === "message" || event.type === "message_reply") {
                        const args = event.body ? event.body.trim().split(/ +/) : [];
                        let commandName = args.shift()?.toLowerCase();
                        const prefix = "!"; // Palitan kung iba ang prefix mo

                        if (commandName && commandName.startsWith(prefix)) {
                            commandName = commandName.slice(prefix.length);
                            if (Utils.commands.has(commandName)) {
                                const command = Utils.commands.get(commandName);
                                try {
                                    await command.run({ api, event, args, commandName, humanHandler, accountID: userId, utils: Utils });
                                } catch (e) {
                                    console.error(chalk.red(`[COMMAND ERROR]`), e.message);
                                }
                            }
                        }
                    }

                    // Event Handler
                    for (const cmd of Utils.handleEvent.values()) {
                        try {
                            const context = { api, event, humanHandler, accountID: userId, utils: Utils };
                            if (typeof cmd.handleEvent === "function") {
                                Promise.resolve(cmd.handleEvent(context)).catch(() => {});
                            }
                            if (typeof cmd.onChat === "function") {
                                Promise.resolve(cmd.onChat(context)).catch(() => {});
                            }
                        } catch (error) {}
                    }
                });
            } catch (error) {
                reconnectAccount(state, userId);
            }
        });
    } catch (error) {
        reconnectAccount(state, userId);
    }
}

app.post("/login", async (req, res) => {
    try {
        const { appState, userid } = req.body;
        if (!appState) {
            return res.status(400).json({ success: false, message: "Missing appState" });
        }

        const uid = userid || "default";
        accountLogin(appState, uid, true);

        return res.json({ success: true, message: "Login process initiated and session saved." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});

// ============================================================
// ERROR HANDLERS & SERVER START
// ============================================================

process.on("uncaughtException", error => {});
process.on("unhandledRejection", reason => {});

const server = app.listen(PORT, () => {
    console.log(chalk.green(`Server is running on port ${PORT}`));
});

async function main() {
    loadCommands();

    if (!fs.existsSync(SESSION_DIR)) return;

    let files;
    try {
        files = fs.readdirSync(SESSION_DIR);
    } catch (error) {
        return;
    }

    const sessionFiles = files.filter(file => file.endsWith(".json"));
    if (sessionFiles.length === 0) return;

    for (const file of sessionFiles) {
        const userId = path.basename(file, ".json");
        const sessionPath = path.join(SESSION_DIR, file);

        try {
            const rawState = fs.readFileSync(sessionPath, "utf8");
            const appState = JSON.parse(rawState);

            if (appState) {
                console.log(chalk.yellow(`[SESSION] Auto-logging in saved account: ${userId}`));
                accountLogin(appState, userId, false);
            }
        } catch (error) {}
    }
}

main().catch(error => {
    console.error(chalk.red("[MAIN] Fatal startup error:"), error.message);
});
