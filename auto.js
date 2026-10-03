"use strict";

const fs = require("fs");
const path = require("path");
const login = require("ws3-fca");
const chalk = require("chalk");

const ROOT = __dirname;

const DATA_DIR = path.join(ROOT, "data");
const SESSION_DIR = path.join(DATA_DIR, "session");
const SCRIPT_DIR = path.join(ROOT, "script");

const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const DATABASE_FILE = path.join(DATA_DIR, "database.json");
const RUNTIME_FILE = path.join(DATA_DIR, "runtime.json");

for (const dir of [
    DATA_DIR,
    SESSION_DIR,
    SCRIPT_DIR
]) {
    fs.mkdirSync(dir, {
        recursive: true
    });
}

function readJSON(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            return fallback;
        }

        const raw = fs.readFileSync(
            file,
            "utf8"
        ).trim();

        if (!raw) {
            return fallback;
        }

        return JSON.parse(raw);
    } catch (error) {
        console.error(
            `[JSON READ] ${file}:`,
            error.message
        );

        return fallback;
    }
}

function writeJSON(file, data) {
    try {
        fs.mkdirSync(
            path.dirname(file),
            {
                recursive: true
            }
        );

        const temp =
            `${file}.${process.pid}.tmp`;

        fs.writeFileSync(
            temp,
            JSON.stringify(
                data,
                null,
                2
            ),
            "utf8"
        );

        fs.renameSync(
            temp,
            file
        );

        return true;
    } catch (error) {
        console.error(
            `[JSON WRITE] ${file}:`,
            error.message
        );

        return false;
    }
}

function defaultConfig() {
    return {
        masterKey: {
            admin: []
        },

        devMode: false,
        database: false,

        restartTime: 15,
        forceLogin: true,

        listenEvents: true,

        logLevel: "silent",

        updatePresence: true,
        selfListen: true,

        userAgent:
            "Mozilla/5.0 " +
            "(Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 " +
            "(KHTML, like Gecko) " +
            "Chrome/120.0.0.0 Safari/537.36",

        online: true,

        autoMarkDelivery: false,
        autoMarkRead: false
    };
}

function ensureFiles() {
    if (!fs.existsSync(CONFIG_FILE)) {
        writeJSON(
            CONFIG_FILE,
            [defaultConfig()]
        );
    }

    if (!fs.existsSync(HISTORY_FILE)) {
        writeJSON(
            HISTORY_FILE,
            []
        );
    }

    if (!fs.existsSync(DATABASE_FILE)) {
        writeJSON(
            DATABASE_FILE,
            {}
        );
    }
}

ensureFiles();

const configData = readJSON(
    CONFIG_FILE,
    [defaultConfig()]
);

const config =
    Array.isArray(configData) &&
    configData.length
        ? configData[0]
        : defaultConfig();

const Utils = {
    commands: new Map(),
    handleEvent: new Map(),
    account: new Map(),
    cooldowns: new Map()
};

const Runtime = {
    startedAt: Date.now(),

    receivedMessages: 0,
    processedMessages: 0,
    sentMessages: 0,

    suppressedDuplicates: 0,
    suppressedBurst: 0,
    queueDrops: 0,
    commandErrors: 0,

    lastMessageAt: null,
    lastReplyAt: null,
    lastError: null
};

const Traffic = {
    users: new Map(),
    duplicates: new Map(),
    queues: new Map(),
    lastReply: new Map(),

    maxBurst: 3,
    burstWindow: 10000,
    burstCooldown: 30000,

    duplicateWindow: 5000,

    replyInterval: 10000,

    maxQueuePerThread: 5,

    cleanupTimer: null,

    normalize(text) {
        return String(text || "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
    },

    duplicateKey(
        threadID,
        senderID,
        body
    ) {
        return [
            threadID,
            senderID,
            this.normalize(body)
        ].join(":");
    },

    isDuplicate(
        threadID,
        senderID,
        body
    ) {
        const key = this.duplicateKey(
            threadID,
            senderID,
            body
        );

        const current = Date.now();
        const last = this.duplicates.get(key);

        this.duplicates.set(
            key,
            current
        );

        if (
            last &&
            current - last <
            this.duplicateWindow
        ) {
            Runtime.suppressedDuplicates++;
            return true;
        }

        return false;
    },

    isBursting(
        threadID,
        senderID
    ) {
        const key =
            `${threadID}:${senderID}`;

        const current = Date.now();

        let timestamps =
            this.users.get(key) || [];

        timestamps = timestamps.filter(
            time =>
                current - time <
                this.burstWindow
        );

        timestamps.push(current);

        this.users.set(
            key,
            timestamps
        );

        if (
            timestamps.length >
            this.maxBurst
        ) {
            Runtime.suppressedBurst++;
            return true;
        }

        return false;
    },

    getQueue(threadID) {
        if (!this.queues.has(threadID)) {
            this.queues.set(
                threadID,
                []
            );
        }

        return this.queues.get(threadID);
    },

    enqueueSend(
        api,
        message,
        threadID,
        messageID
    ) {
        return new Promise(resolve => {
            const queue =
                this.getQueue(threadID);

            if (
                queue.length >=
                this.maxQueuePerThread
            ) {
                Runtime.queueDrops++;

                resolve(false);
                return;
            }

            queue.push({
                api,
                message,
                threadID,
                messageID,
                resolve
            });

            this.processQueue(
                threadID
            );
        });
    },

    async processQueue(threadID) {
        const queue =
            this.getQueue(threadID);

        if (
            queue.processing
        ) {
            return;
        }

        queue.processing = true;

        try {
            while (queue.length) {
                const item =
                    queue.shift();

                const previous =
                    this.lastReply.get(
                        threadID
                    ) || 0;

                const wait =
                    Math.max(
                        0,
                        this.replyInterval -
                        (
                            Date.now() -
                            previous
                        )
                    );

                if (wait > 0) {
                    await sleep(wait);
                }

                let success = false;

                try {
                    await new Promise(
                        resolve => {
                            item.api.sendMessage(
                                item.message,
                                item.threadID,
                                () => resolve()
                            );
                        }
                    );

                    success = true;

                    this.lastReply.set(
                        threadID,
                        Date.now()
                    );

                    Runtime.sentMessages++;
                    Runtime.lastReplyAt =
                        new Date().toISOString();
                } catch (error) {
                    Runtime.lastError =
                        error.message;

                    console.error(
                        "[SEND ERROR]",
                        error.message
                    );
                }

                item.resolve(success);
            }
        } finally {
            queue.processing = false;
        }
    },

    cleanup() {
        const current =
            Date.now();

        for (
            const [
                key,
                timestamps
            ] of this.users
        ) {
            const fresh =
                timestamps.filter(
                    time =>
                        current - time <
                        this.burstWindow
                );

            if (fresh.length) {
                this.users.set(
                    key,
                    fresh
                );
            } else {
                this.users.delete(key);
            }
        }

        for (
            const [
                key,
                time
            ] of this.duplicates
        ) {
            if (
                current - time >
                this.duplicateWindow
            ) {
                this.duplicates.delete(key);
            }
        }

        for (
            const [
                threadID,
                time
            ] of this.lastReply
        ) {
            if (
                current - time >
                120000
            ) {
                this.lastReply.delete(
                    threadID
                );
            }
        }
    },

    start() {
        this.cleanupTimer =
            setInterval(
                () => this.cleanup(),
                30000
            );
    },

    stop() {
        if (this.cleanupTimer) {
            clearInterval(
                this.cleanupTimer
            );

            this.cleanupTimer = null;
        }
    }
};

Traffic.start();

function sleep(ms) {
    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );
}

function safeSend(
    api,
    message,
    threadID,
    messageID
) {
    if (
        !api ||
        !threadID ||
        message == null
    ) {
        return Promise.resolve(false);
    }

    return Traffic.enqueueSend(
        api,
        message,
        threadID,
        messageID
    );
}

function normalizeCommandConfig(
    command
) {
    if (
        !command ||
        !command.config
    ) {
        return null;
    }

    const cfg =
        command.config;

    const name =
        String(
            cfg.name || ""
        )
        .trim()
        .toLowerCase();

    if (!name) {
        return null;
    }

    const aliases =
        Array.isArray(cfg.aliases)
            ? cfg.aliases
                .map(x =>
                    String(x)
                        .trim()
                        .toLowerCase()
                )
                .filter(Boolean)
            : [];

    let role = 0;

    if (
        typeof cfg.role === "number"
    ) {
        role = cfg.role;
    } else if (
        typeof cfg.hasPermission === "number"
    ) {
        role = cfg.hasPermission;
    }

    return {
        name,

        aliases,

        version:
            cfg.version || "1.0.0",

        description:
            cfg.description ||
            "No description.",

        usage:
            cfg.usage || "",

        credits:
            cfg.credits || "Unknown",

        hasPrefix:
            cfg.hasPrefix ??
            cfg.usePrefix ??
            true,

        role,

        cooldown:
            Number(cfg.cooldown) || 0,

        dev:
            Boolean(cfg.dev),

        category:
            cfg.category ||
            "General"
    };
}

function loadCommand(filePath) {
    try {
        delete require.cache[
            require.resolve(filePath)
        ];

        const command =
            require(filePath);

        const cfg =
            normalizeCommandConfig(
                command
            );

        if (
            !cfg ||
            typeof command.run !==
            "function"
        ) {
            return;
        }

        const names = [
            cfg.name,
            ...cfg.aliases
        ];

        for (const name of names) {
            Utils.commands.set(
                name,
                {
                    ...command,
                    config: cfg,
                    filePath
                }
            );
        }

        console.log(
            chalk.green(
                `[COMMAND] ${cfg.name}`
            )
        );
    } catch (error) {
        console.error(
            `[COMMAND LOAD ERROR] ${filePath}`,
            error.message
        );
    }
}

function loadEvent(filePath) {
    try {
        delete require.cache[
            require.resolve(filePath)
        ];

        const event =
            require(filePath);

        if (
            !event ||
            !event.config ||
            typeof event.handleEvent !==
            "function"
        ) {
            return;
        }

        const name =
            event.config.name ||
            path.basename(
                filePath,
                ".js"
            );

        Utils.handleEvent.set(
            name,
            {
                ...event,
                filePath
            }
        );

        console.log(
            chalk.cyan(
                `[EVENT] ${name}`
            )
        );
    } catch (error) {
        console.error(
            `[EVENT LOAD ERROR] ${filePath}`,
            error.message
        );
    }
}

function loadScripts(directory) {
    if (!fs.existsSync(directory)) {
        return;
    }

    const entries =
        fs.readdirSync(
            directory,
            {
                withFileTypes: true
            }
        );

    for (const entry of entries) {
        const fullPath =
            path.join(
                directory,
                entry.name
            );

        if (entry.isDirectory()) {
            loadScripts(fullPath);
            continue;
        }

        if (
            !entry.name.endsWith(".js")
        ) {
            continue;
        }

        try {
            delete require.cache[
                require.resolve(fullPath)
            ];

            const module =
                require(fullPath);

            if (
                module &&
                module.config &&
                typeof module.run ===
                "function"
            ) {
                loadCommand(fullPath);
            } else if (
                module &&
                module.config &&
                typeof module.handleEvent ===
                "function"
            ) {
                loadEvent(fullPath);
            }
        } catch (error) {
            console.error(
                `[SCRIPT ERROR] ${fullPath}`,
                error.message
            );
        }
    }
}

loadScripts(SCRIPT_DIR);

function findCommand(name) {
    if (!name) {
        return null;
    }

    return Utils.commands.get(
        String(name)
            .toLowerCase()
            .trim()
    ) || null;
}

function getCommandList() {
    const unique =
        new Map();

    for (
        const command
        of Utils.commands.values()
    ) {
        const cfg =
            command.config;

        if (
            !unique.has(cfg.name)
        ) {
            unique.set(
                cfg.name,
                {
                    name: cfg.name,
                    aliases: cfg.aliases,
                    version: cfg.version,
                    description:
                        cfg.description,
                    usage: cfg.usage,
                    credits: cfg.credits,
                    hasPrefix:
                        cfg.hasPrefix,
                    role: cfg.role,
                    cooldown:
                        cfg.cooldown,
                    dev: cfg.dev,
                    category:
                        cfg.category
                }
            );
        }
    }

    return [
        ...unique.values()
    ].sort(
        (a, b) =>
            a.name.localeCompare(
                b.name
            )
    );
}

function getHuntingState() {
    return {
        enabled:
            Boolean(
                global.huntingState
            ),

        countEnabled:
            Boolean(
                global.countEngineState
            ),

        replyEnabled:
            global.huntingReplyState !==
            false,

        sending:
            Boolean(
                global.activeSendingState
            ),

        duplicateProtection:
            global.huntingDuplicateState !==
            false,

        stats:
            global.huntingStats ||
            {},

        nickname:
            global.nicknameState ||
            {},

        nameLock:
            global.gcNameLockState ||
            {}
    };
}

function getRuntime() {
    const accounts = [];

    for (
        const account
        of Utils.account.values()
    ) {
        accounts.push({
            userid:
                account.userid,

            name:
                account.name || "Unknown",

            online:
                Boolean(account.online),

            uptime:
                account.time || 0
        });
    }

    return {
        online:
            accounts.some(
                account =>
                    account.online
            ),

        updatedAt:
            new Date().toISOString(),

        workerPid:
            process.pid,

        startedAt:
            new Date(
                Runtime.startedAt
            ).toISOString(),

        uptime:
            Math.floor(
                (
                    Date.now() -
                    Runtime.startedAt
                ) / 1000
            ),

        accounts,

        commands:
            getCommandList(),

        events:
            [...Utils.handleEvent.values()]
                .map(event => ({
                    name:
                        event.config?.name ||
                        "event"
                })),

        hunting:
            getHuntingState(),

        stats: {
            receivedMessages:
                Runtime.receivedMessages,

            processedMessages:
                Runtime.processedMessages,

            sentMessages:
                Runtime.sentMessages,

            suppressedDuplicates:
                Runtime.suppressedDuplicates,

            suppressedBurst:
                Runtime.suppressedBurst,

            queueDrops:
                Runtime.queueDrops,

            commandErrors:
                Runtime.commandErrors,

            lastMessageAt:
                Runtime.lastMessageAt,

            lastReplyAt:
                Runtime.lastReplyAt,

            lastError:
                Runtime.lastError
        }
    };
}

function publishRuntime() {
    const runtime =
        getRuntime();

    writeJSON(
        RUNTIME_FILE,
        runtime
    );

    if (
        typeof process.send ===
        "function"
    ) {
        try {
            process.send({
                type: "runtime",
                data: runtime
            });
        } catch {}
    }
}

let runtimeTimer =
    setInterval(
        publishRuntime,
        5000
    );

publishRuntime();

const activeLogins =
    new Set();

function getAdminIDs() {
    const list =
        config.masterKey &&
        Array.isArray(
            config.masterKey.admin
        )
            ? config.masterKey.admin
            : [];

    return list.map(
        id => String(id)
    );
}

function isAdmin(userID) {
    return getAdminIDs()
        .includes(
            String(userID)
        );
}

function getSenderID(event) {
    return String(
        event.senderID ||
        event.author ||
        event.from ||
        ""
    );
}

function getThreadID(event) {
    return String(
        event.threadID ||
        ""
    );
}

function getMessageID(event) {
    return String(
        event.messageID ||
        ""
    );
}

function getBody(event) {
    return String(
        event.body ||
        ""
    ).trim();
}

function checkCooldown(
    commandName,
    senderID,
    cooldown
) {
    if (!cooldown) {
        return false;
    }

    const key =
        `${commandName}:${senderID}`;

    const current =
        Date.now();

    const last =
        Utils.cooldowns.get(
            key
        ) || 0;

    if (
        current - last <
        cooldown * 1000
    ) {
        return true;
    }

    Utils.cooldowns.set(
        key,
        current
    );

    return false;
}

async function processMessageCommand(
    api,
    event,
    account
) {
    const body =
        getBody(event);

    if (!body) {
        return false;
    }

    const senderID =
        getSenderID(event);

    const threadID =
        getThreadID(event);

    const messageID =
        getMessageID(event);

    const prefix =
        String(
            config.prefix ||
            process.env.PREFIX ||
            ""
        );

    let commandName = "";
    let args = [];

    let hasPrefix = false;

    if (
        prefix &&
        body.startsWith(prefix)
    ) {
        hasPrefix = true;

        const content =
            body
                .slice(prefix.length)
                .trim();

        const parts =
            content.split(/\s+/);

        commandName =
            (
                parts.shift() ||
                ""
            ).toLowerCase();

        args = parts;
    } else {
        const parts =
            body.split(/\s+/);

        commandName =
            (
                parts.shift() ||
                ""
            ).toLowerCase();

        args = parts;
    }

    const command =
        findCommand(
            commandName
        );

    if (!command) {
        return false;
    }

    const cfg =
        command.config;

    if (
        cfg.hasPrefix &&
        !hasPrefix
    ) {
        return false;
    }

    if (
        cfg.dev &&
        !isAdmin(senderID)
    ) {
        return false;
    }

    if (
        cfg.role >= 2 &&
        !isAdmin(senderID)
    ) {
        return false;
    }

    if (
        checkCooldown(
            cfg.name,
            senderID,
            cfg.cooldown
        )
    ) {
        return true;
    }

    Runtime.processedMessages++;

    try {
        await command.run({
            api,
            event,

            args,

            body,

            threadID,
            messageID,
            senderID,

            prefix,

            commands:
                Utils.commands,

            handleEvent:
                Utils.handleEvent,

            account,

            config,

            safeSend,

            sleep
        });

        return true;
    } catch (error) {
        Runtime.commandErrors++;
        Runtime.lastError =
            error.message;

        console.error(
            `[COMMAND ERROR] ${cfg.name}:`,
            error
        );

        return true;
    }
}

async function processEvents(
    api,
    event
) {
    for (
        const handler
        of Utils.handleEvent.values()
    ) {
        try {
            await handler.handleEvent({
                api,
                event,
                safeSend
            });
        } catch (error) {
            console.error(
                `[EVENT ERROR] ${
                    handler.config?.name ||
                    "event"
                }:`,
                error.message
            );
        }
    }
}

async function handleIncomingEvent(
    api,
    event,
    account
) {
    if (!event) {
        return;
    }

    const type =
        event.type;

    if (
        type !== "message" &&
        type !== "message_reply" &&
        type !== "event"
    ) {
        return;
    }

    const threadID =
        getThreadID(event);

    const senderID =
        getSenderID(event);

    const body =
        getBody(event);

    if (!threadID) {
        return;
    }

    Runtime.receivedMessages++;
    Runtime.lastMessageAt =
        new Date().toISOString();

    if (
        event.senderID ===
        account.userid
    ) {
        return;
    }

    if (
        body &&
        Traffic.isDuplicate(
            threadID,
            senderID,
            body
        )
    ) {
        return;
    }

    if (
        body &&
        Traffic.isBursting(
            threadID,
            senderID
        )
    ) {
        return;
    }

    let database =
        readJSON(
            DATABASE_FILE,
            {}
        );

    if (!database[threadID]) {
        database[threadID] = {
            threadID,
            createdAt:
                new Date().toISOString(),
            adminIDs: []
        };

        writeJSON(
            DATABASE_FILE,
            database
        );
    }

    await processMessageCommand(
        api,
        event,
        account
    );

    await processEvents(
        api,
        event
    );

    publishRuntime();
}

function addThisUser(
    userid,
    name,
    api
) {
    Utils.account.set(
        String(userid),
        {
            userid: String(userid),
            name: name || "Unknown",
            time: 0,
            online: true,
            api
        }
    );

    const history =
        readJSON(
            HISTORY_FILE,
            []
        );

    const exists =
        history.some(
            item =>
                String(item.userid) ===
                String(userid)
        );

    if (!exists) {
        history.push({
            userid: String(userid),
            name: name || "Unknown",
            time:
                new Date().toISOString()
        });

        writeJSON(
            HISTORY_FILE,
            history
        );
    }

    const sessionFile =
        path.join(
            SESSION_DIR,
            `${userid}.json`
        );

    try {
        const appState =
            api.getAppState
                ? api.getAppState()
                : [];

        writeJSON(
            sessionFile,
            appState
        );
    } catch {}
}

function accountLogin(
    state
) {
    return new Promise(
        resolve => {
            login(
                {
                    appState: state
                },
                async (
                    error,
                    api
                ) => {
                    if (error) {
                        console.error(
                            "[LOGIN ERROR]",
                            error
                        );

                        resolve(false);
                        return;
                    }

                    try {
                        const userid =
                            String(
                                api.getCurrentUserID()
                            );

                        if (
                            activeLogins.has(
                                userid
                            )
                        ) {
                            resolve(true);
                            return;
                        }

                        activeLogins.add(
                            userid
                        );

                        let name =
                            "Unknown";

                        try {
                            const info =
                                await new Promise(
                                    resolveInfo => {
                                        api.getUserInfo(
                                            userid,
                                            (
                                                err,
                                                data
                                            ) => {
                                                if (
                                                    err ||
                                                    !data
                                                ) {
                                                    resolveInfo(
                                                        null
                                                    );
                                                } else {
                                                    resolveInfo(
                                                        data
                                                    );
                                                }
                                            }
                                        );
                                    }
                                );

                            if (
                                info &&
                                info[userid]
                            ) {
                                name =
                                    info[
                                        userid
                                    ].name ||
                                    name;
                            }
                        } catch {}

                        addThisUser(
                            userid,
                            name,
                            api
                        );

                        api.setOptions({
                            listenEvents:
                                config.listenEvents,

                            selfListen:
                                config.selfListen,

                            updatePresence:
                                config.updatePresence,

                            online:
                                config.online,

                            autoMarkDelivery:
                                config.autoMarkDelivery,

                            autoMarkRead:
                                config.autoMarkRead,

                            userAgent:
                                config.userAgent
                        });

                        const account =
                            Utils.account.get(
                                userid
                            );

                        api.listenMqtt(
                            async (
                                listenError,
                                event
                            ) => {
                                if (
                                    listenError
                                ) {
                                    Runtime.lastError =
                                        listenError.message ||
                                        String(
                                            listenError
                                        );

                                    console.error(
                                        "[MQTT]",
                                        listenError
                                    );

                                    return;
                                }

                                if (
                                    account
                                ) {
                                    account.time++;
                                }

                                try {
                                    await handleIncomingEvent(
                                        api,
                                        event,
                                        account
                                    );
                                } catch (
                                    handlerError
                                ) {
                                    Runtime.lastError =
                                        handlerError.message;

                                    console.error(
                                        "[EVENT HANDLER]",
                                        handlerError
                                    );
                                }
                            }
                        );

                        publishRuntime();

                        console.log(
                            chalk.green(
                                `[LOGIN] ${name} (${userid})`
                            )
                        );

                        resolve(true);
                    } catch (loginError) {
                        Runtime.lastError =
                            loginError.message;

                        console.error(
                            "[ACCOUNT ERROR]",
                            loginError
                        );

                        resolve(false);
                    }
                }
            );
        }
    );
}

async function main() {
    console.log(
        chalk.cyan(
            "======================================"
        )
    );

    console.log(
        chalk.cyan(
            "        SANZU AI BOT WORKER"
        )
    );

    console.log(
        chalk.cyan(
            "======================================"
        )
    );

    console.log(
        `[COMMANDS] ${getCommandList().length}`
    );

    console.log(
        `[EVENTS] ${Utils.handleEvent.size}`
    );

    const history =
        readJSON(
            HISTORY_FILE,
            []
        );

    const sessions =
        fs.readdirSync(
            SESSION_DIR
        )
        .filter(
            file =>
                file.endsWith(".json")
        );

    if (
        sessions.length
    ) {
        for (
            const file
            of sessions
        ) {
            const sessionPath =
                path.join(
                    SESSION_DIR,
                    file
                );

            const state =
                readJSON(
                    sessionPath,
                    null
                );

            if (
                !Array.isArray(state) ||
                !state.length
            ) {
                continue;
            }

            console.log(
                `[SESSION] Loading ${file}`
            );

            await accountLogin(
                state
            );

            await sleep(2000);
        }
    } else if (
        history.length
    ) {
        console.log(
            "[SESSION] History found but no session files."
        );
    } else {
        console.log(
            "[SESSION] No saved sessions."
        );
    }

    publishRuntime();

    console.log(
        chalk.green(
            "[WORKER] Ready."
        )
    );
}

async function shutdown(
    signal
) {
    console.log(
        `[WORKER] Shutdown: ${signal}`
    );

    if (runtimeTimer) {
        clearInterval(
            runtimeTimer
        );

        runtimeTimer = null;
    }

    Traffic.stop();

    for (
        const account
        of Utils.account.values()
    ) {
        account.online = false;

        try {
            if (
                account.api &&
                typeof account.api.logout ===
                "function"
            ) {
                await new Promise(
                    resolve => {
                        account.api.logout(
                            () => resolve()
                        );
                    }
                );
            }
        } catch {}
    }

    publishRuntime();

    setTimeout(
        () => process.exit(0),
        500
    );
}

process.on(
    "SIGINT",
    () => shutdown("SIGINT")
);

process.on(
    "SIGTERM",
    () => shutdown("SIGTERM")
);

process.on(
    "uncaughtException",
    error => {
        Runtime.lastError =
            error.message;

        console.error(
            "[UNCAUGHT EXCEPTION]",
            error
        );

        publishRuntime();

        process.exitCode = 1;
    }
);

process.on(
    "unhandledRejection",
    error => {
        Runtime.lastError =
            error?.message ||
            String(error);

        console.error(
            "[UNHANDLED REJECTION]",
            error
        );

        publishRuntime();
    }
);

main().catch(error => {
    Runtime.lastError =
        error.message;

    console.error(
        "[FATAL]",
        error
    );

    publishRuntime();

    process.exitCode = 1;
});
