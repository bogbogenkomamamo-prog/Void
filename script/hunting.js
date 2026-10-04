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
    // Reply pacing
    MIN_REPLY_DELAY: 7000,
    MAX_REPLY_DELAY: 12000,

    // Small delay after typing starts
    MIN_TYPING_DELAY: 1000,
    MAX_TYPING_DELAY: 2500,

    // Duplicate protection
    DUPLICATE_WINDOW: 30000,

    // Spam protection
    SPAM_WINDOW: 60000,
    MAX_MESSAGES_PER_WINDOW: 8,

    // Reconnect
    INITIAL_RECONNECT_DELAY: 5000,
    MAX_RECONNECT_DELAY: 60000,

    // Health
    HEALTH_INTERVAL: 30000,

    // Queue
    MAX_QUEUE_PER_THREAD: 3
};

// ============================================================
// DIRECTORY SETUP
// ============================================================

function ensureDirectory(dir) {
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, {
                recursive: true
            });
        }
    } catch (error) {
        console.error(
            chalk.red(
                `[FS] Failed creating directory: ${dir}`
            ),
            error.message
        );
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
        if (!fs.existsSync(file)) {
            return fallback;
        }

        const raw = fs.readFileSync(
            file,
            "utf8"
        );

        if (!raw.trim()) {
            return fallback;
        }

        return JSON.parse(raw);

    } catch (error) {
        console.error(
            chalk.yellow(
                `[JSON] Failed reading ${file}`
            ),
            error.message
        );

        return fallback;
    }
}

function writeJSON(file, data) {
    try {
        const tempFile = `${file}.tmp`;

        fs.writeFileSync(
            tempFile,
            JSON.stringify(
                data,
                null,
                2
            ),
            "utf8"
        );

        fs.renameSync(
            tempFile,
            file
        );

        return true;

    } catch (error) {
        console.error(
            chalk.red(
                `[JSON] Failed writing ${file}`
            ),
            error.message
        );

        return false;
    }
}

// ============================================================
// LOAD CONFIG
// ============================================================

const BOT_CONFIG = readJSON(
    CONFIG_FILE,
    []
);

// ============================================================
// GLOBAL UTILS
// ============================================================

const Utils = {
    commands: new Map(),
    handleEvent: new Map(),
    account: new Map(),
    cooldowns: new Map(),
    connections: new Map(),
    reconnecting: new Set()
};

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
        return new Promise(
            resolve => setTimeout(
                resolve,
                ms
            )
        );
    }

    random(min, max) {
        return Math.floor(
            Math.random() *
            (max - min + 1)
        ) + min;
    }

    randomReplyDelay() {
        return this.random(
            SETTINGS.MIN_REPLY_DELAY,
            SETTINGS.MAX_REPLY_DELAY
        );
    }

    randomTypingDelay() {
        return this.random(
            SETTINGS.MIN_TYPING_DELAY,
            SETTINGS.MAX_TYPING_DELAY
        );
    }

    hash(value) {
        let hash = 0;

        const text =
            String(value || "");

        for (
            let i = 0;
            i < text.length;
            i++
        ) {
            hash =
                ((hash << 5) - hash) +
                text.charCodeAt(i);

            hash |= 0;
        }

        return String(hash);
    }

    getMessageKey(event) {
        if (!event) {
            return null;
        }

        const threadID =
            event.threadID || "";

        const senderID =
            event.senderID || "";

        const body =
            event.body || "";

        if (!body) {
            return null;
        }

        return [
            threadID,
            senderID,
            this.hash(body)
        ].join(":");
    }

    isDuplicate(event) {
        const key =
            this.getMessageKey(event);

        if (!key) {
            return false;
        }

        const now =
            Date.now();

        const previous =
            this.lastMessages.get(key);

        if (
            previous &&
            now - previous <
            SETTINGS.DUPLICATE_WINDOW
        ) {
            return true;
        }

        this.lastMessages.set(
            key,
            now
        );

        this.cleanupMap(
            this.lastMessages,
            SETTINGS.DUPLICATE_WINDOW
        );

        return false;
    }

    isSpam(event) {
        if (!event) {
            return false;
        }

        const senderID =
            event.senderID;

        if (!senderID) {
            return false;
        }

        const now =
            Date.now();

        let messages =
            this.userMessages.get(
                senderID
            ) || [];

        messages =
            messages.filter(
                timestamp =>
                    now - timestamp <
                    SETTINGS.SPAM_WINDOW
            );

        messages.push(now);

        this.userMessages.set(
            senderID,
            messages
        );

        return (
            messages.length >
            SETTINGS.MAX_MESSAGES_PER_WINDOW
        );
    }

    cleanupMap(
        map,
        lifetime
    ) {
        const now =
            Date.now();

        for (
            const [
                key,
                timestamp
            ] of map.entries()
        ) {
            if (
                now - timestamp >
                lifetime
            ) {
                map.delete(key);
            }
        }
    }

    async waitBeforeReply() {
        const delay =
            this.randomReplyDelay();

        await this.sleep(
            delay
        );

        return delay;
    }

    async sendTyping(
        api,
        threadID
    ) {
        if (
            !api ||
            !threadID
        ) {
            return;
        }

        try {
            if (
                typeof api.sendTypingIndicator ===
                "function"
            ) {
                await new Promise(
                    resolve => {
                        try {
                            api.sendTypingIndicator(
                                threadID,
                                () => resolve()
                            );
                        } catch (error) {
                            resolve();
                        }
                    }
                );
            }
        } catch (error) {
            // Typing failure should never kill the bot.
        }
    }

    async prepareReply(
        api,
        event
    ) {
        if (!event) {
            return false;
        }

        if (
            this.isDuplicate(event)
        ) {
            return false;
        }

        if (
            this.isSpam(event)
        ) {
            return false;
        }

        const threadID =
            event.threadID;

        if (!threadID) {
            return false;
        }

        if (
            this.processingThreads.has(
                threadID
            )
        ) {
            return false;
        }

        this.processingThreads.add(
            threadID
        );

        try {
            await this.waitBeforeReply();

            await this.sendTyping(
                api,
                threadID
            );

            await this.sleep(
                this.randomTypingDelay()
            );

            return true;

        } catch (error) {
            this.finish(event);

            return false;
        }
    }

    finish(event) {
        if (
            !event ||
            !event.threadID
        ) {
            return;
        }

        this.processingThreads.delete(
            event.threadID
        );
    }

    async safeReply(
        api,
        event,
        message
    ) {
        if (
            !api ||
            !event ||
            !message
        ) {
            return false;
        }

        const allowed =
            await this.prepareReply(
                api,
                event
            );

        if (!allowed) {
            return false;
        }

        try {
            await new Promise(
                (
                    resolve,
                    reject
                ) => {
                    api.sendMessage(
                        message,
                        event.threadID,
                        error => {
                            if (error) {
                                reject(error);
                            } else {
                                resolve();
                            }
                        }
                    );
                }
            );

            this.finish(event);

            return true;

        } catch (error) {
            this.finish(event);

            console.error(
                chalk.red(
                    "[SAFE REPLY ERROR]"
                ),
                error.message ||
                error
            );

            return false;
        }
    }

    addToQueue(
        threadID,
        task
    ) {
        if (!threadID) {
            return;
        }

        let queue =
            this.replyQueues.get(
                threadID
            );

        if (!queue) {
            queue = [];

            this.replyQueues.set(
                threadID,
                queue
            );
        }

        if (
            queue.length >=
            SETTINGS.MAX_QUEUE_PER_THREAD
        ) {
            return;
        }

        queue.push(task);

        this.processQueue(
            threadID
        );
    }

    async processQueue(
        threadID
    ) {
        const queue =
            this.replyQueues.get(
                threadID
            );

        if (
            !queue ||
            queue.length === 0
        ) {
            return;
        }

        if (
            this.processingThreads.has(
                `queue:${threadID}`
            )
        ) {
            return;
        }

        this.processingThreads.add(
            `queue:${threadID}`
        );

        try {
            while (
                queue.length > 0
            ) {
                const task =
                    queue.shift();

                if (
                    typeof task !==
                    "function"
                ) {
                    continue;
                }

                try {
                    await task();
                } catch (error) {
                    console.error(
                        chalk.red(
                            "[QUEUE ERROR]"
                        ),
                        error.message
                    );
                }
            }

        } finally {
            this.processingThreads.delete(
                `queue:${threadID}`
            );

            if (
                queue.length === 0
            ) {
                this.replyQueues.delete(
                    threadID
                );
            }
        }
    }

    getStats() {
        return {
            duplicateCache:
                this.lastMessages.size,

            trackedUsers:
                this.userMessages.size,

            activeThreads:
                this.processingThreads.size,

            queuedThreads:
                this.replyQueues.size
        };
    }
}

const humanHandler =
    new HumanHandler();

// ============================================================
// COMMAND LOADER
// ============================================================

function normalizeAliases(value) {
    if (
        Array.isArray(value)
    ) {
        return [
            ...value
        ];
    }

    if (
        typeof value === "string" &&
        value.length > 0
    ) {
        return [
            value
        ];
    }

    return [];
}

function installCommand(
    filePath
) {
    try {
        delete require.cache[
            require.resolve(
                filePath
            )
        ];

        const loaded =
            require(filePath);

        if (
            !loaded ||
            !loaded.config
        ) {
            return;
        }

        const rawConfig =
            loaded.config;

        const name =
            rawConfig.name ||
            rawConfig.Name ||
            path.basename(
                filePath,
                ".js"
            );

        const aliases =
            normalizeAliases(
                rawConfig.aliases ||
                rawConfig.Aliases
            );

        const lowerName =
            String(
                name
            ).toLowerCase();

        if (
            !aliases.includes(
                lowerName
            )
        ) {
            aliases.push(
                lowerName
            );
        }

        const commandData = {
            name,

            role:
                rawConfig.role ??
                rawConfig.hasPermission ??
                0,

            run:
                loaded.run,

            aliases,

            description:
                rawConfig.description ||
                "",

            usage:
                rawConfig.usage ||
                "",

            version:
                rawConfig.version ||
                "1.0.0",

            hasPrefix:
                rawConfig.hasPrefix !==
                undefined
                    ? rawConfig.hasPrefix
                    : true,

            credits:
                rawConfig.credits ||
                "",

            cooldown:
                Number(
                    rawConfig.cooldown ||
                    0
                ),

            dev:
                Boolean(
                    rawConfig.dev
                )
        };

        if (
            typeof loaded.run ===
            "function"
        ) {
            Utils.commands.set(
                aliases,
                commandData
            );
        }

        if (
            typeof loaded.handleEvent ===
            "function"
        ) {
            Utils.handleEvent.set(
                aliases,
                {
                    ...commandData,

                    handleEvent:
                        loaded.handleEvent
                }
            );
        }

        console.log(
            chalk.green(
                `[COMMAND] Loaded: ${name}`
            )
        );

    } catch (error) {
        console.error(
            chalk.red(
                `[COMMAND] Failed loading ${filePath}:`
            ),
            error.message
        );
    }
}

function loadCommands() {
    if (
        !fs.existsSync(
            SCRIPT_DIR
        )
    ) {
        console.log(
            chalk.yellow(
                "[COMMAND] Script directory does not exist."
            )
        );

        return;
    }

    const files =
        fs.readdirSync(
            SCRIPT_DIR
        );

    for (
        const file of files
    ) {
        const fullPath =
            path.join(
                SCRIPT_DIR,
                file
            );

        let stats;

        try {
            stats =
                fs.statSync(
                    fullPath
                );
        } catch (error) {
            continue;
        }

        if (
            stats.isDirectory()
        ) {
            let children;

            try {
                children =
                    fs.readdirSync(
                        fullPath
                    );
            } catch (error) {
                continue;
            }

            for (
                const child
                of children
            ) {
                if (
                    child.endsWith(
                        ".js"
                    )
                ) {
                    installCommand(
                        path.join(
                            fullPath,
                            child
                        )
                    );
                }
            }

        } else if (
            stats.isFile() &&
            file.endsWith(".js")
        ) {
            installCommand(
                fullPath
            );
        }
    }
}

loadCommands();

// ============================================================
// EXPRESS
// ============================================================

app.use(
    express.static(
        path.join(
            ROOT,
            "public"
        )
    )
);

app.use(
    express.json({
        limit: "10mb"
    })
);

// ============================================================
// HEALTH
// ============================================================

app.get(
    "/health",
    (req, res) => {
        res.json({
            status: "online",

            uptime:
                process.uptime(),

            accounts:
                Utils.account.size,

            commands:
                Utils.commands.size,

            connections:
                Utils.connections.size,

            reconnecting:
                Utils.reconnecting.size,

            human:
                humanHandler.getStats(),

            timestamp:
                new Date().toISOString()
        });
    }
);

// ============================================================
// INFO
// ============================================================

app.get(
    "/info",
    (req, res) => {
        const data =
            Array.from(
                Utils.account.values()
            ).map(
                account => ({
                    name:
                        account.name ||
                        "Unknown",

                    profileUrl:
                        account.profileUrl ||
                        "",

                    thumbSrc:
                        account.thumbSrc ||
                        "",

                    time:
                        Number(
                            account.time ||
                            0
                        )
                })
            );

        res.json(data);
    }
);

// ============================================================
// RECONNECT MANAGER
// ============================================================

const reconnectTimers =
    new Map();

const reconnectAttempts =
    new Map();

function getReconnectDelay(
    userId
) {
    const attempts =
        reconnectAttempts.get(
            userId
        ) || 0;

    const exponential =
        SETTINGS.INITIAL_RECONNECT_DELAY *
        Math.pow(
            2,
            Math.min(
                attempts,
                5
            )
        );

    const delay =
        Math.min(
            exponential,
            SETTINGS.MAX_RECONNECT_DELAY
        );

    // Small jitter
    const jitter =
        Math.floor(
            Math.random() *
            1500
        );

    return delay + jitter;
}

function reconnectAccount(
    state,
    userId
) {
    if (!state) {
        return;
    }

    if (
        reconnectTimers.has(
            userId
        )
    ) {
        return;
    }

    if (
        Utils.reconnecting.has(
            userId
        )
    ) {
        return;
    }

    Utils.reconnecting.add(
        userId
    );

    const attempts =
        (
            reconnectAttempts.get(
                userId
            ) || 0
        ) + 1;

    reconnectAttempts.set(
        userId,
        attempts
    );

    const delay =
        getReconnectDelay(
            userId
        );

    console.log(
        chalk.yellow(
            `[RECONNECT] ${userId} retry #${attempts} in ${delay}ms`
        )
    );

    const timer =
        setTimeout(
            () => {
                reconnectTimers.delete(
                    userId
                );

                Utils.reconnecting.delete(
                    userId
                );

                try {
                    accountLogin(
                        state,
                        userId,
                        false
                    );

                } catch (error) {
                    console.error(
                        chalk.red(
                            `[RECONNECT ERROR] ${userId}:`
                        ),
                        error.message
                    );

                    reconnectAccount(
                        state,
                        userId
                    );
                }
            },
            delay
        );

    reconnectTimers.set(
        userId,
        timer
    );
}

function resetReconnectAttempts(
    userId
) {
    reconnectAttempts.delete(
        userId
    );
}

// ============================================================
// LOGIN
// ============================================================

function accountLogin(
    state,
    userId,
    saveToDisk = true
) {
    if (
        !state ||
        typeof state !==
        "object"
    ) {
        console.error(
            chalk.red(
                `[LOGIN] Invalid appState for ${userId}`
            )
        );

        return;
    }

    const fcaOption =
        BOT_CONFIG[0]?.fcaOption ||
        {
            forceLogin: true,

            listenEvents: true,

            logLevel: "silent",

            updatePresence: true,

            selfListen: true
        };

    // ========================================================
    // SAVE SESSION
    // ========================================================

    if (saveToDisk) {
        try {
            const sessionFile =
                path.join(
                    SESSION_DIR,
                    `${userId}.json`
                );

            fs.writeFileSync(
                sessionFile,
                JSON.stringify(
                    state,
                    null,
                    2
                ),
                "utf8"
            );

        } catch (error) {
            console.error(
                chalk.red(
                    `[SESSION] Failed to save session for ${userId}:`
                ),
                error.message
            );
        }
    }

    // ========================================================
    // LOGIN
    // ========================================================

    try {
        login(
            {
                appState:
                    state
            },

            fcaOption,

            async (
                err,
                api
            ) => {
                if (err) {
                    console.error(
                        chalk.red(
                            `[LOGIN] Failed for user ${userId}:`
                        ),
                        err.error ||
                        err
                    );

                    Utils.account.delete(
                        userId
                    );

                    Utils.connections.delete(
                        userId
                    );

                    reconnectAccount(
                        state,
                        userId
                    );

                    return;
                }

                resetReconnectAttempts(
                    userId
                );

                console.log(
                    chalk.green(
                        `[LOGIN] Successfully logged in for ID: ${userId}`
                    )
                );

                // =============================================
                // GET ACCOUNT INFO
                // =============================================

                try {
                    const userInfo =
                        await new Promise(
                            resolve => {
                                api.getUserInfo(
                                    userId,

                                    (
                                        infoError,
                                        ret
                                    ) => {
                                        if (
                                            infoError ||
                                            !ret ||
                                            !ret[userId]
                                        ) {
                                            resolve({
                                                name:
                                                    "User",

                                                profileUrl:
                                                    "",

                                                thumbSrc:
                                                    ""
                                            });

                                            return;
                                        }

                                        resolve({
                                            name:
                                                ret[userId].name ||
                                                "User",

                                            profileUrl:
                                                ret[userId].profileUrl ||
                                                "",

                                            thumbSrc:
                                                ret[userId].thumbSrc ||
                                                ""
                                        });
                                    }
                                );
                            }
                        );

                    Utils.account.set(
                        userId,
                        {
                            api,

                            ...userInfo,

                            time:
                                Date.now()
                        }
                    );

                    Utils.connections.set(
                        userId,
                        {
                            api,

                            state,

                            connectedAt:
                                Date.now()
                        }
                    );

                    console.log(
                        chalk.green(
                            `[ACCOUNT] ${userInfo.name} is ready.`
                        )
                    );

                } catch (error) {
                    console.error(
                        chalk.red(
                            "[SETUP ERROR]"
                        ),
                        error.message
                    );
                }

                // =============================================
                // LISTENER
                // =============================================

                try {
                    api.listenMqtt(
                        (
                            listenerError,
                            event
                        ) => {
                            // =================================
                            // CONNECTION ERROR
                            // =================================

                            if (
                                listenerError
                            ) {
                                console.error(
                                    chalk.red(
                                        `[LISTENER ERROR] ${userId}:`
                                    ),
                                    listenerError.error ||
                                    listenerError
                                );

                                Utils.account.delete(
                                    userId
                                );

                                Utils.connections.delete(
                                    userId
                                );

                                reconnectAccount(
                                    state,
                                    userId
                                );

                                return;
                            }

                            if (!event) {
                                return;
                            }

                            // =================================
                            // DUPLICATE PROTECTION
                            // =================================

                            if (
                                humanHandler.isDuplicate(
                                    event
                                )
                            ) {
                                return;
                            }

                            // =================================
                            // SPAM PROTECTION
                            // =================================

                            if (
                                humanHandler.isSpam(
                                    event
                                )
                            ) {
                                return;
                            }

                            // =================================
                            // UPDATE ACCOUNT ACTIVITY
                            // =================================

                            const account =
                                Utils.account.get(
                                    userId
                                );

                            if (account) {
                                account.time =
                                    Date.now();

                                Utils.account.set(
                                    userId,
                                    account
                                );
                            }

                            // =================================
                            // RUN EVENT COMMANDS
                            // =================================

                            for (
                                const cmd
                                of Utils.handleEvent.values()
                            ) {
                                try {

                                    const context = {
                                        api,

                                        event,

                                        humanHandler,

                                        accountID:
                                            userId,

                                        utils:
                                            Utils
                                    };

                                    if (
                                        typeof cmd.handleEvent ===
                                        "function"
                                    ) {
                                        Promise.resolve(
                                            cmd.handleEvent(
                                                context
                                            )
                                        ).catch(
                                            error => {
                                                console.error(
                                                    chalk.red(
                                                        "[HANDLE EVENT ERROR]"
                                                    ),
                                                    error.message ||
                                                    error
                                                );
                                            }
                                        );
                                    }

                                    if (
                                        typeof cmd.onChat ===
                                        "function"
                                    ) {
                                        Promise.resolve(
                                            cmd.onChat(
                                                context
                                            )
                                        ).catch(
                                            error => {
                                                console.error(
                                                    chalk.red(
                                                        "[ON CHAT ERROR]"
                                                    ),
                                                    error.message ||
                                                    error
                                                );
                                            }
                                        );
                                    }

                                } catch (error) {
                                    console.error(
                                        chalk.red(
                                            "[EVENT ERROR]"
                                        ),
                                        error.message ||
                                        error
                                    );
                                }
                            }
                        }
                    );

                } catch (error) {
                    console.error(
                        chalk.red(
                            `[LISTENER START ERROR] ${userId}:`
                        ),
                        error.message
                    );

                    reconnectAccount(
                        state,
                        userId
                    );
                }
            }
        );

    } catch (error) {
        console.error(
            chalk.red(
                `[LOGIN EXCEPTION] ${userId}:`
            ),
            error.message
        );

        reconnectAccount(
            state,
            userId
        );
    }
}

// ============================================================
// LOGIN ROUTE
// ============================================================

app.post(
    "/login",
    async (
        req,
        res
    ) => {
        try {
            const {
                appState,
                userid
            } = req.body;

            if (!appState) {
                return res
                    .status(400)
                    .json({
                        success: false,

                        message:
                            "Missing appState"
                    });
            }

            const uid =
                userid ||
                "default";

            accountLogin(
                appState,
                uid,
                true
            );

            return res.json({
                success: true,

                message:
                    "Login process initiated and session saved."
            });

        } catch (error) {
            console.error(
                chalk.red(
                    "[LOGIN ROUTE ERROR]"
                ),
                error.message
            );

            return res
                .status(500)
                .json({
                    success: false,

                    message:
                        "Internal server error"
                });
        }
    }
);

// ============================================================
// GLOBAL ERROR PROTECTION
// ============================================================

process.on(
    "uncaughtException",
    error => {
        console.error(
            chalk.red(
                "[UNCAUGHT EXCEPTION]"
            ),
            error.stack ||
            error.message ||
            error
        );

        /*
         * Do not process.exit().
         *
         * The bot remains alive and existing
         * connections continue running whenever
         * the error is recoverable.
         */
    }
);

process.on(
    "unhandledRejection",
    reason => {
        console.error(
            chalk.red(
                "[UNHANDLED REJECTION]"
            ),
            reason
        );
    }
);

// ============================================================
// PROCESS SIGNALS
// ============================================================

process.on(
    "SIGTERM",
    () => {
        console.log(
            chalk.yellow(
                "[SYSTEM] SIGTERM received."
            )
        );

        /*
         * Let the hosting platform terminate
         * the process normally.
         */
    }
);

process.on(
    "SIGINT",
    () => {
        console.log(
            chalk.yellow(
                "[SYSTEM] SIGINT received."
            )
        );
    }
);

// ============================================================
// PERIODIC CLEANUP
// ============================================================

setInterval(
    () => {
        try {
            humanHandler.cleanupMap(
                humanHandler.lastMessages,
                SETTINGS.DUPLICATE_WINDOW
            );

            const now =
                Date.now();

            for (
                const [
                    senderID,
                    timestamps
                ]
                of humanHandler.userMessages.entries()
            ) {
                const recent =
                    timestamps.filter(
                        timestamp =>
                            now - timestamp <
                            SETTINGS.SPAM_WINDOW
                    );

                if (
                    recent.length === 0
                ) {
                    humanHandler.userMessages.delete(
                        senderID
                    );
                } else {
                    humanHandler.userMessages.set(
                        senderID,
                        recent
                    );
                }
            }

        } catch (error) {
            console.error(
                chalk.red(
                    "[CLEANUP ERROR]"
                ),
                error.message
            );
        }
    },
    SETTINGS.HEALTH_INTERVAL
);

// ============================================================
// SERVER
// ============================================================

const server =
    app.listen(
        PORT,
        () => {
            console.log(
                chalk.green(
                    `Server is running on port ${PORT}`
                )
            );

            console.log(
                chalk.cyan(
                    "=========================================="
                )
            );

            console.log(
                chalk.cyan(
                    "       AUTO.JS ONLINE"
                )
            );

            console.log(
                chalk.cyan(
                    "       Human Handler: ENABLED"
                )
            );

            console.log(
                chalk.cyan(
                    "       Reconnect System: ENABLED"
                )
            );

            console.log(
                chalk.cyan(
                    "       Long-Run Protection: ENABLED"
                )
            );

            console.log(
                chalk.cyan(
                    "=========================================="
                )
            );
        }
    );

// ============================================================
// AUTO LOAD SAVED SESSIONS
// ============================================================

async function main() {
    console.log(
        chalk.cyan(
            "=========================================="
        )
    );

    console.log(
        chalk.cyan(
            "       BOT STARTING & CHECKING SESSIONS"
        )
    );

    console.log(
        chalk.cyan(
            "=========================================="
        )
    );

    if (
        !fs.existsSync(
            SESSION_DIR
        )
    ) {
        console.log(
            chalk.yellow(
                "[SESSION] No session directory."
            )
        );

        return;
    }

    let files;

    try {
        files =
            fs.readdirSync(
                SESSION_DIR
            );
    } catch (error) {
        console.error(
            chalk.red(
                "[SESSION] Cannot read session directory:"
            ),
            error.message
        );

        return;
    }

    const sessionFiles =
        files.filter(
            file =>
                file.endsWith(
                    ".json"
                )
        );

    if (
        sessionFiles.length === 0
    ) {
        console.log(
            chalk.yellow(
                "[SESSION] No saved accounts found."
            )
        );

        return;
    }

    for (
        const file
        of sessionFiles
    ) {
        const userId =
            path.basename(
                file,
                ".json"
            );

        const sessionPath =
            path.join(
                SESSION_DIR,
                file
            );

        try {
            const rawState =
                fs.readFileSync(
                    sessionPath,
                    "utf8"
                );

            const appState =
                JSON.parse(
                    rawState
                );

            if (
                appState
            ) {
                console.log(
                    chalk.yellow(
                        `[SESSION] Auto-logging in saved account: ${userId}`
                    )
                );

                accountLogin(
                    appState,
                    userId,
                    false
                );
            }

        } catch (error) {
            console.error(
                chalk.red(
                    `[SESSION] Failed to load session for ${userId}:`
                ),
                error.message
            );
        }
    }
}

// ============================================================
// START
// ============================================================

main().catch(
    error => {
        console.error(
            chalk.red(
                "[MAIN] Fatal startup error:"
            ),
            error.message
        );
    }
);
