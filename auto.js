"use strict";

const fs = require("fs");
const path = require("path");
const login = require("ws3-fca");
const express = require("express");
const chalk = require("chalk");
const cron = require("node-cron");
const fsExtra = require("fs-extra");

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
// DIRECTORIES
// ============================================================

function ensureDirectory(dir) {
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    } catch (error) {
        console.error(
            chalk.red(`[FS] Failed creating directory: ${dir}`),
            error.message
        );
    }
}

ensureDirectory(DATA_DIR);
ensureDirectory(SESSION_DIR);
ensureDirectory(CACHE_DIR);

// ============================================================
// SAFE FILE HELPERS
// ============================================================

function readJSON(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            return fallback;
        }

        const raw = fs.readFileSync(file, "utf8");

        if (!raw.trim()) {
            return fallback;
        }

        return JSON.parse(raw);
    } catch (error) {
        console.error(
            chalk.red(`[JSON] Failed reading ${file}:`),
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
            JSON.stringify(data, null, 2),
            "utf8"
        );

        fs.renameSync(tempFile, file);

        return true;
    } catch (error) {
        console.error(
            chalk.red(`[JSON] Failed writing ${file}:`),
            error.message
        );

        return false;
    }
}

// ============================================================
// DEFAULT FILES
// ============================================================

function createConfig() {
    const data = [{
        masterKey: {
            admin: [],
            devMode: false,
            database: false,
            restartTime: 15
        },

        fcaOption: {
            forceLogin: true,
            listenEvents: true,
            logLevel: "silent",
            updatePresence: true,
            selfListen: true,
            userAgent:
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            online: true,
            autoMarkDelivery: false,
            autoMarkRead: false
        }
    }];

    writeJSON(CONFIG_FILE, data);

    return data;
}

if (!fs.existsSync(CONFIG_FILE)) {
    createConfig();
}

if (!fs.existsSync(HISTORY_FILE)) {
    writeJSON(HISTORY_FILE, []);
}

if (!fs.existsSync(DATABASE_FILE)) {
    writeJSON(DATABASE_FILE, []);
}

const BOT_CONFIG = readJSON(CONFIG_FILE, createConfig());

const DEV_USERS = readJSON(DEV_FILE, []);

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
    if (Array.isArray(value)) {
        return [...value];
    }

    if (typeof value === "string" && value.length > 0) {
        return [value];
    }

    return [];
}

function installCommand(filePath) {
    try {
        const loaded = require(filePath);

        if (!loaded || !loaded.config) {
            return;
        }

        const rawConfig = loaded.config;

        const name =
            rawConfig.name ||
            rawConfig.Name ||
            path.basename(filePath, ".js");

        const aliases = normalizeAliases(
            rawConfig.aliases || rawConfig.Aliases
        );

        if (!aliases.includes(String(name).toLowerCase())) {
            aliases.push(String(name).toLowerCase());
        }

        const commandData = {
            name,
            role: rawConfig.role ?? rawConfig.hasPermission ?? 0,
            run: loaded.run,
            aliases,
            description: rawConfig.description || "",
            usage: rawConfig.usage || "",
            version: rawConfig.version || "1.0.0",
            hasPrefix:
                rawConfig.hasPrefix !== undefined
                    ? rawConfig.hasPrefix
                    : true,
            credits: rawConfig.credits || "",
            cooldown: Number(rawConfig.cooldown || 0),
            dev: Boolean(rawConfig.dev)
        };

        if (typeof loaded.run === "function") {
            Utils.commands.set(aliases, commandData);
        }

        if (typeof loaded.handleEvent === "function") {
            Utils.handleEvent.set(aliases, {
                ...commandData,
                handleEvent: loaded.handleEvent
            });
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
            error.stack || error.message
        );
    }
}

function loadCommands() {
    if (!fs.existsSync(SCRIPT_DIR)) {
        console.warn(
            chalk.yellow(
                `[COMMAND] Missing script directory: ${SCRIPT_DIR}`
            )
        );
        return;
    }

    let files;

    try {
        files = fs.readdirSync(SCRIPT_DIR);
    } catch (error) {
        console.error(
            chalk.red("[COMMAND] Cannot read script directory:"),
            error.message
        );
        return;
    }

    for (const file of files) {
        const fullPath = path.join(SCRIPT_DIR, file);

        let stats;

        try {
            stats = fs.statSync(fullPath);
        } catch {
            continue;
        }

        if (stats.isDirectory()) {
            let children = [];

            try {
                children = fs.readdirSync(fullPath);
            } catch {
                continue;
            }

            for (const child of children) {
                if (!child.endsWith(".js")) continue;

                installCommand(
                    path.join(fullPath, child)
                );
            }

        } else if (
            stats.isFile() &&
            file.endsWith(".js")
        ) {
            installCommand(fullPath);
        }
    }
}

loadCommands();

// ============================================================
// EXPRESS
// ============================================================

app.use(express.static(path.join(ROOT, "public")));
app.use(express.json());

const routes = [
    {
        path: "/",
        file: "index.html"
    },
    {
        path: "/step_by_step_guide",
        file: "guide.html"
    },
    {
        path: "/online_user",
        file: "online.html"
    }
];

for (const route of routes) {
    app.get(route.path, (req, res) => {
        const file = path.join(
            ROOT,
            "public",
            route.file
        );

        if (!fs.existsSync(file)) {
            return res.status(404).send("Page not found.");
        }

        res.sendFile(file);
    });
}

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/health", (req, res) => {
    res.json({
        status: "online",
        uptime: process.uptime(),
        accounts: Utils.account.size,
        commands: Utils.commands.size,
        connections: Utils.connections.size,
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// INFO
// ============================================================

app.get("/info", (req, res) => {
    const data = Array.from(
        Utils.account.values()
    ).map(account => ({
        name: account.name,
        profileUrl: account.profileUrl,
        thumbSrc: account.thumbSrc,
        time: account.time
    }));

    res.json(data);
});

// ============================================================
// COMMANDS
// ============================================================

app.get("/commands", (req, res) => {
    const commandNames = new Set();

    const commands = [];

    for (const command of Utils.commands.values()) {
        if (!commandNames.has(command.name)) {
            commandNames.add(command.name);
            commands.push(command.name);
        }
    }

    const handleEvent = [];

    for (const command of Utils.handleEvent.values()) {
        if (!commandNames.has(command.name)) {
            commandNames.add(command.name);
            handleEvent.push(command.name);
        }
    }

    res.json({
        commands,
        handleEvent,
        roles: [
            ...new Set(
                Array.from(
                    Utils.commands.values()
                ).map(command => command.role)
            )
        ],
        aliases: Array.from(
            Utils.commands.values()
        ).map(command => ({
            name: command.name,
            aliases: command.aliases
        }))
    });
});

// ============================================================
// LOGIN ROUTE
// ============================================================

app.post("/login", async (req, res) => {
    const {
        state,
        prefix,
        admin
    } = req.body;

    try {
        if (!Array.isArray(state) || state.length === 0) {
            return res.status(400).json({
                error: true,
                message: "Missing or invalid app state data."
            });
        }

        const cUser = state.find(
            item => item && item.key === "c_user"
        );

        if (!cUser || !cUser.value) {
            return res.status(400).json({
                error: true,
                message: "Invalid appstate: c_user is missing."
            });
        }

        const existingUser =
            Utils.account.get(cUser.value);

        if (existingUser) {
            return res.status(400).json({
                error: false,
                message:
                    "Active user session detected; already logged in.",
                user: existingUser
            });
        }

        // Make sure admin is always an array.
        const adminList = Array.isArray(admin)
            ? admin
            : admin
                ? [admin]
                : [];

        await accountLogin(
            state,
            [],
            prefix || "",
            adminList
        );

        return res.status(200).json({
            success: true,
            message:
                "Authentication process completed successfully."
        });

    } catch (error) {
        console.error(
            chalk.red("[LOGIN]"),
            error.stack || error.message
        );

        return res.status(400).json({
            error: true,
            message: error.message || "Login failed."
        });
    }
});

// ============================================================
// SERVER
// ============================================================

const server = app.listen(PORT, () => {
    console.log(
        chalk.green(
            `Server is running on port ${PORT}`
        )
    );
});

// ============================================================
// ALIAS FINDER
// ============================================================

function aliases(command) {
    if (!command) return null;

    const target = String(command)
        .toLowerCase()
        .trim();

    for (const [commandAliases, data] of Utils.commands) {
        if (
            Array.isArray(commandAliases) &&
            commandAliases
                .map(x => String(x).toLowerCase())
                .includes(target)
        ) {
            return data;
        }
    }

    return null;
}

// ============================================================
// HANDLE EVENT ALIAS
// ============================================================

function findEventCommand(command) {
    if (!command) return null;

    const target = String(command)
        .toLowerCase()
        .trim();

    for (const [commandAliases, data] of Utils.handleEvent) {
        if (
            Array.isArray(commandAliases) &&
            commandAliases
                .map(x => String(x).toLowerCase())
                .includes(target)
        ) {
            return data;
        }
    }

    return null;
}

// ============================================================
// DATABASE
// ============================================================

async function createThread(threadID, api) {
    if (!threadID || !api) return [];

    try {
        const database = readJSON(
            DATABASE_FILE,
            []
        );

        if (!Array.isArray(database)) {
            return [];
        }

        const exists = database.some(
            item =>
                item &&
                Object.prototype.hasOwnProperty.call(
                    item,
                    threadID
                )
        );

        if (exists) {
            return database;
        }

        let threadInfo = null;

        try {
            threadInfo =
                await api.getThreadInfo(threadID);
        } catch (error) {
            console.error(
                chalk.yellow(
                    `[THREAD] Failed getting info ${threadID}:`
                ),
                error.message
            );
        }

        const adminIDs =
            threadInfo &&
            Array.isArray(threadInfo.adminIDs)
                ? threadInfo.adminIDs
                : [];

        const data = {};
        data[threadID] = adminIDs;

        database.push(data);

        writeJSON(
            DATABASE_FILE,
            database
        );

        return database;

    } catch (error) {
        console.error(
            chalk.red("[DATABASE]"),
            error.message
        );

        return [];
    }
}

// ============================================================
// SESSION STORAGE
// ============================================================

function addThisUser(
    userid,
    enableCommands,
    state,
    prefix,
    admin,
    blacklist = []
) {
    if (!userid) return;

    const history = readJSON(
        HISTORY_FILE,
        []
    );

    const existing = history.find(
        user => user && user.userid === userid
    );

    if (existing) {
        existing.prefix = prefix || existing.prefix || "";
        existing.admin = Array.isArray(admin)
            ? admin
            : existing.admin || [];
        existing.blacklist = Array.isArray(blacklist)
            ? blacklist
            : existing.blacklist || [];
        existing.enableCommands =
            enableCommands;

        writeJSON(
            HISTORY_FILE,
            history
        );

    } else {
        history.push({
            userid,
            prefix: prefix || "",
            admin: Array.isArray(admin)
                ? admin
                : [],
            blacklist: Array.isArray(blacklist)
                ? blacklist
                : [],
            enableCommands,
            time: 0
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

    if (!fs.existsSync(sessionFile)) {
        writeJSON(
            sessionFile,
            state
        );
    }
}

// ============================================================
// DELETE USER
// ============================================================

function deleteThisUser(userid) {
    if (!userid) return;

    const history = readJSON(
        HISTORY_FILE,
        []
    );

    const filtered = history.filter(
        item =>
            item &&
            item.userid !== userid
    );

    writeJSON(
        HISTORY_FILE,
        filtered
    );

    // NOTE:
    // Session is intentionally NOT deleted here
    // during connection errors.
}

// ============================================================
// REMOVE SESSION PERMANENTLY
// ============================================================

function deleteSession(userid) {
    if (!userid) return;

    const sessionFile =
        path.join(
            SESSION_DIR,
            `${userid}.json`
        );

    try {
        if (fs.existsSync(sessionFile)) {
            fs.unlinkSync(sessionFile);
        }
    } catch (error) {
        console.error(
            chalk.red(
                `[SESSION] Failed deleting ${userid}:`
            ),
            error.message
        );
    }
}

// ============================================================
// ACCOUNT LOGIN
// ============================================================

async function accountLogin(
    state,
    enableCommands = [],
    prefix = "",
    admin = [],
    blacklist = [],
    reconnectAttempt = 0
) {
    if (!Array.isArray(state) || state.length === 0) {
        throw new Error(
            "Invalid appstate."
        );
    }

    // Always enable currently loaded commands.
    const enabled = [
        {
            commands:
                Array.from(
                    Utils.commands.values()
                ).map(command => command.name)
        },
        {
            handleEvent:
                Array.from(
                    Utils.handleEvent.values()
                ).map(command => command.name)
        }
    ];

    return new Promise((resolve, reject) => {
        let settled = false;

        const finishResolve = value => {
            if (!settled) {
                settled = true;
                resolve(value);
            }
        };

        const finishReject = error => {
            if (!settled) {
                settled = true;
                reject(error);
            }
        };

        try {
            login(
                {
                    appState: state
                },
                async (error, api) => {

                    if (error) {
                        console.error(
                            chalk.red(
                                "[FCA LOGIN ERROR]"
                            ),
                            error.message || error
                        );

                        finishReject(error);
                        return;
                    }

                    if (!api) {
                        finishReject(
                            new Error(
                                "FCA returned no API object."
                            )
                        );
                        return;
                    }

                    let userid;

                    try {
                        userid =
                            await api.getCurrentUserID();
                    } catch (error) {
                        finishReject(error);
                        return;
                    }

                    if (!userid) {
                        finishReject(
                            new Error(
                                "Unable to get current user ID."
                            )
                        );
                        return;
                    }

                    console.log(
                        chalk.green(
                            `[ACCOUNT] Logged in: ${userid}`
                        )
                    );

                    addThisUser(
                        userid,
                        enabled,
                        state,
                        prefix,
                        admin,
                        blacklist
                    );

                    // ------------------------------------------------
                    // ACCOUNT INFO
                    // ------------------------------------------------

                    try {
                        const userInfo =
                            await api.getUserInfo(userid);

                        const info =
                            userInfo &&
                            userInfo[userid];

                        if (!info || !info.name) {
                            throw new Error(
                                "Unable to retrieve account information."
                            );
                        }

                        const history =
                            readJSON(
                                HISTORY_FILE,
                                []
                            );

                        const historyUser =
                            history.find(
                                user =>
                                    user &&
                                    user.userid === userid
                            );

                        Utils.account.set(
                            userid,
                            {
                                name:
                                    info.name ||
                                    "Unknown",
                                profileUrl:
                                    info.profileUrl ||
                                    "",
                                thumbSrc:
                                    info.thumbSrc ||
                                    "",
                                time:
                                    Number(
                                        historyUser?.time || 0
                                    )
                            }
                        );

                    } catch (error) {
                        console.error(
                            chalk.yellow(
                                `[ACCOUNT INFO] ${userid}:`
                            ),
                            error.message
                        );

                        Utils.account.set(
                            userid,
                            {
                                name: "Unknown",
                                profileUrl: "",
                                thumbSrc: "",
                                time: 0
                            }
                        );
                    }

                    // ------------------------------------------------
                    // TIME COUNTER
                    // ------------------------------------------------

                    if (!Utils.account.get(userid)._timer) {
                        const timer =
                            setInterval(() => {
                                const account =
                                    Utils.account.get(userid);

                                if (!account) {
                                    clearInterval(timer);
                                    return;
                                }

                                account.time =
                                    Number(account.time || 0) + 1;
                            }, 1000);

                        const account =
                            Utils.account.get(userid);

                        if (account) {
                            account._timer = timer;
                        }
                    }

                    // ------------------------------------------------
                    // OPTIONS
                    // ------------------------------------------------

                    const fcaOptions =
                        BOT_CONFIG?.[0]?.fcaOption || {};

                    try {
                        api.setOptions({
                            listenEvents:
                                fcaOptions.listenEvents !== false,

                            logLevel:
                                fcaOptions.logLevel ||
                                "silent",

                            updatePresence:
                                fcaOptions.updatePresence !== false,

                            selfListen:
                                fcaOptions.selfListen !== false,

                            forceLogin:
                                fcaOptions.forceLogin !== false,

                            online:
                                fcaOptions.online !== false,

                            autoMarkDelivery:
                                fcaOptions.autoMarkDelivery === true,

                            autoMarkRead:
                                fcaOptions.autoMarkRead === true
                        });
                    } catch (error) {
                        console.error(
                            chalk.yellow(
                                "[FCA OPTIONS]"
                            ),
                            error.message
                        );
                    }

                    // ------------------------------------------------
                    // CONNECTION STATE
                    // ------------------------------------------------

                    Utils.connections.set(
                        userid,
                        {
                            api,
                            state,
                            connectedAt: Date.now(),
                            reconnectAttempt
                        }
                    );

                    console.log(
                        chalk.green(
                            `[ONLINE] ${userid}`
                        )
                    );

                    // ------------------------------------------------
                    // MQTT LISTENER
                    // ------------------------------------------------

                    let reconnectStarted = false;

                    const startReconnect = () => {
                        if (reconnectStarted) {
                            return;
                        }

                        reconnectStarted = true;

                        Utils.connections.delete(
                            userid
                        );

                        scheduleReconnect(
                            userid,
                            state,
                            prefix,
                            admin,
                            blacklist,
                            reconnectAttempt + 1
                        );
                    };

                    try {
                        api.listenMqtt(
                            async (listenError, event) => {

                                // ------------------------------------
                                // CONNECTION ERROR
                                // ------------------------------------

                                if (listenError) {
                                    console.error(
                                        chalk.yellow(
                                            `[MQTT] ${userid}:`
                                        ),
                                        listenError.message ||
                                        listenError
                                    );

                                    if (
                                        typeof listenError ===
                                        "string" &&
                                        listenError
                                            .toLowerCase()
                                            .includes(
                                                "connection closed"
                                            )
                                    ) {
                                        startReconnect();
                                    }

                                    return;
                                }

                                // ------------------------------------
                                // INVALID EVENT
                                // ------------------------------------

                                if (!event) {
                                    return;
                                }

                                try {
                                    await processEvent({
                                        api,
                                        event,
                                        userid,
                                        prefix,
                                        admin,
                                        blacklist,
                                        enabled
                                    });
                                } catch (error) {
                                    console.error(
                                        chalk.red(
                                            `[EVENT] ${userid}:`
                                        ),
                                        error.stack ||
                                        error.message
                                    );
                                }
                            }
                        );

                    } catch (error) {
                        console.error(
                            chalk.red(
                                `[LISTENER] ${userid}:`
                            ),
                            error.stack ||
                            error.message
                        );

                        startReconnect();
                    }

                    finishResolve();
                }
            );

        } catch (error) {
            finishReject(error);
        }
    });
}

// ============================================================
// RECONNECT
// ============================================================

function scheduleReconnect(
    userid,
    state,
    prefix,
    admin,
    blacklist,
    attempt
) {
    if (Utils.reconnecting.has(userid)) {
        return;
    }

    Utils.reconnecting.add(userid);

    const MAX_DELAY = 5 * 60 * 1000;

    const delay =
        Math.min(
            5000 * Math.pow(2, Math.min(attempt, 6)),
            MAX_DELAY
        );

    console.log(
        chalk.yellow(
            `[RECONNECT] ${userid} in ${Math.round(
                delay / 1000
            )}s`
        )
    );

    setTimeout(async () => {
        Utils.reconnecting.delete(userid);

        try {
            await accountLogin(
                state,
                [],
                prefix,
                admin,
                blacklist,
                attempt
            );

            console.log(
                chalk.green(
                    `[RECONNECT] ${userid} connected again.`
                )
            );

        } catch (error) {
            console.error(
                chalk.red(
                    `[RECONNECT] ${userid} failed:`
                ),
                error.message
            );

            scheduleReconnect(
                userid,
                state,
                prefix,
                admin,
                blacklist,
                attempt + 1
            );
        }
    }, delay);
}

// ============================================================
// EVENT PROCESSOR
// ============================================================

async function processEvent({
    api,
    event,
    userid,
    prefix,
    admin,
    blacklist,
    enabled
}) {
    if (!event) {
        return;
    }

    const threadID =
        event.threadID;

    if (!threadID) {
        return;
    }

    const body =
        typeof event.body === "string"
            ? event.body.trim()
            : "";

    // --------------------------------------------------------
    // DATABASE
    // --------------------------------------------------------

    let database =
        readJSON(
            DATABASE_FILE,
            []
        );

    if (!Array.isArray(database)) {
        database = [];
    }

    let threadData =
        database.find(
            item =>
                item &&
                Object.prototype.hasOwnProperty.call(
                    item,
                    threadID
                )
        );

    if (!threadData) {
        database =
            await createThread(
                threadID,
                api
            );

        threadData =
            database.find(
                item =>
                    item &&
                    Object.prototype.hasOwnProperty.call(
                        item,
                        threadID
                    )
            );
    }

    // --------------------------------------------------------
    // CURRENT BLACKLIST
    // --------------------------------------------------------

    const history =
        readJSON(
            HISTORY_FILE,
            []
        );

    const currentUser =
        history.find(
            item =>
                item &&
                item.userid === userid
        );

    const currentBlacklist =
        Array.isArray(
            currentUser?.blacklist
        )
            ? currentUser.blacklist
            : blacklist || [];

    // --------------------------------------------------------
    // COMMAND
    // --------------------------------------------------------

    let command = "";
    let args = [];

    let usedPrefix = prefix || "";

    const firstWord =
        body
            .toLowerCase()
            .split(/\s+/)[0] || "";

    const noPrefixCommand =
        aliases(firstWord);

    if (
        noPrefixCommand &&
        noPrefixCommand.hasPrefix === false
    ) {
        usedPrefix = "";
    }

    if (
        usedPrefix &&
        body
            .toLowerCase()
            .startsWith(
                usedPrefix.toLowerCase()
            )
    ) {
        const content =
            body
                .substring(
                    usedPrefix.length
                )
                .trim();

        const parts =
            content
                ? content.split(/\s+/)
                : [];

        command =
            parts.shift()?.toLowerCase() || "";

        args = parts.map(
            item => item.trim()
        );
    } else if (
        !usedPrefix &&
        noPrefixCommand
    ) {
        const parts =
            body.split(/\s+/);

        command =
            parts.shift()
                ?.toLowerCase() || "";

        args = parts;
    }

    const commandInfo =
        aliases(command);

    // --------------------------------------------------------
    // PREFIX VALIDATION
    // --------------------------------------------------------

    if (
        usedPrefix &&
        commandInfo &&
        commandInfo.hasPrefix === false &&
        body
            .toLowerCase()
            .startsWith(
                usedPrefix.toLowerCase()
            )
    ) {
        try {
            await api.sendMessage(
                "Invalid usage. This command doesn't need a prefix.",
                threadID,
                event.messageID
            );
        } catch {}

        return;
    }

    // --------------------------------------------------------
    // DEV CHECK
    // --------------------------------------------------------

    if (body && commandInfo) {
        if (commandInfo.dev) {
            if (
                !DEV_USERS.includes(
                    String(event.senderID)
                )
            ) {
                try {
                    await api.sendMessage(
                        "You don't have access to this command. Developer access is required.",
                        threadID,
                        event.messageID
                    );
                } catch {}

                return;
            }
        }
    }

    // --------------------------------------------------------
    // ADMIN / THREAD ADMIN
    // --------------------------------------------------------

    if (body && commandInfo) {
        const role =
            Number(commandInfo.role || 0);

        const masterAdmins =
            Array.isArray(
                BOT_CONFIG?.[0]?.masterKey?.admin
            )
                ? BOT_CONFIG[0].masterKey.admin
                : [];

        const isAdmin =
            masterAdmins.includes(
                String(event.senderID)
            ) ||
            masterAdmins.includes(
                event.senderID
            ) ||
            (Array.isArray(admin) &&
                (
                    admin.includes(
                        String(event.senderID)
                    ) ||
                    admin.includes(
                        event.senderID
                    )
                ));

        const storedThreadAdmins =
            threadData?.[threadID] || [];

        const isThreadAdmin =
            isAdmin ||
            storedThreadAdmins.some(
                item =>
                    String(item?.id) ===
                    String(event.senderID)
            );

        if (
            (role === 1 && !isAdmin) ||
            (role === 2 && !isThreadAdmin) ||
            (
                role === 3 &&
                !masterAdmins.includes(
                    String(event.senderID)
                )
            )
        ) {
            try {
                await api.sendMessage(
                    "You don't have permission to use this command.",
                    threadID,
                    event.messageID
                );
            } catch {}

            return;
        }
    }

    // --------------------------------------------------------
    // BLACKLIST
    // --------------------------------------------------------

    if (
        commandInfo &&
        Array.isArray(currentBlacklist) &&
        currentBlacklist.some(
            id =>
                String(id) ===
                String(event.senderID)
        )
    ) {
        try {
            await api.sendMessage(
                "You're currently blocked from using this bot.",
                threadID,
                event.messageID
            );
        } catch {}

        return;
    }

    // --------------------------------------------------------
    // COOLDOWN
    // --------------------------------------------------------

    if (commandInfo) {
        const now = Date.now();

        const commandName =
            commandInfo.name;

        const cooldown =
            Number(
                commandInfo.cooldown || 0
            );

        if (cooldown > 0) {
            const key =
                `${userid}:${event.senderID}:${commandName}`;

            const previous =
                Utils.cooldowns.get(key);

            if (
                previous &&
                now - previous.timestamp <
                    cooldown * 1000
            ) {
                const remaining =
                    Math.ceil(
                        (
                            previous.timestamp +
                            cooldown * 1000 -
                            now
                        ) / 1000
                    );

                try {
                    await api.sendMessage(
                        `Please wait ${remaining} seconds before using "${commandName}" again.`,
                        threadID,
                        event.messageID
                    );
                } catch {}

                return;
            }

            Utils.cooldowns.set(
                key,
                {
                    timestamp: now,
                    command: commandName
                }
            );
        }
    }

    // --------------------------------------------------------
    // INVALID PREFIX COMMAND
    // --------------------------------------------------------

    if (
        body &&
        usedPrefix &&
        body
            .toLowerCase()
            .startsWith(
                usedPrefix.toLowerCase()
            ) &&
        !command
    ) {
        try {
            await api.sendMessage(
                `Invalid command. Use ${usedPrefix}help to see available commands.`,
                threadID,
                event.messageID
            );
        } catch {}

        return;
    }

    if (
        body &&
        usedPrefix &&
        body
            .toLowerCase()
            .startsWith(
                usedPrefix.toLowerCase()
            ) &&
        command &&
        !commandInfo
    ) {
        try {
            await api.sendMessage(
                `Invalid command "${command}". Use ${usedPrefix}help to see available commands.`,
                threadID,
                event.messageID
            );
        } catch {}

        return;
    }

    // --------------------------------------------------------
    // HANDLE EVENTS
    // --------------------------------------------------------

    for (
        const command of Utils.handleEvent.values()
    ) {
        if (
            typeof command.handleEvent !==
            "function"
        ) {
            continue;
        }

        const enabledEvent =
            enabled?.[1]?.handleEvent || [];

        const enabledCommand =
            enabled?.[0]?.commands || [];

        if (
            !enabledEvent.includes(
                command.name
            ) &&
            !enabledCommand.includes(
                command.name
            )
        ) {
            continue;
        }

        try {
            await command.handleEvent({
                api,
                event,
                enableCommands: enabled,
                admin,
                prefix,
                blacklist: currentBlacklist,
                Utils
            });
        } catch (error) {
            console.error(
                chalk.red(
                    `[HANDLE EVENT] ${command.name}:`
                ),
                error.stack ||
                error.message
            );
        }
    }

    // --------------------------------------------------------
    // RUN COMMAND
    // --------------------------------------------------------

    if (
        !commandInfo ||
        typeof commandInfo.run !==
        "function"
    ) {
        return;
    }

    const validEventTypes = [
        "message",
        "message_reply",
        "message_unsend",
        "message_reaction"
    ];

    if (
        !validEventTypes.includes(
            event.type
        )
    ) {
        return;
    }

    try {
        await commandInfo.run({
            api,
            event,
            args,
            enableCommands: enabled,
            admin,
            prefix,
            blacklist: currentBlacklist,
            Utils
        });
    } catch (error) {
        console.error(
            chalk.red(
                `[COMMAND ERROR] ${commandInfo.name}:`
            ),
            error.stack ||
            error.message
        );
    }
}

// ============================================================
// SAVE RUNTIME STATE
// ============================================================

function saveRuntimeState() {
    try {
        const history =
            readJSON(
                HISTORY_FILE,
                []
            );

        if (!Array.isArray(history)) {
            return;
        }

        for (const user of history) {
            if (!user?.userid) {
                continue;
            }

            const account =
                Utils.account.get(
                    user.userid
                );

            if (account) {
                user.time =
                    Number(
                        account.time || 0
                    );
            }
        }

        writeJSON(
            HISTORY_FILE,
            history
        );

        console.log(
            chalk.gray(
                "[STATE] Runtime state saved."
            )
        );

    } catch (error) {
        console.error(
            chalk.red(
                "[STATE] Save failed:"
            ),
            error.message
        );
    }
}

// ============================================================
// CLEAN CACHE WITHOUT KILLING BOT
// ============================================================

async function cleanCache() {
    try {
        await fsExtra.emptyDir(
            CACHE_DIR
        );

        console.log(
            chalk.gray(
                "[CACHE] Cache cleaned."
            )
        );
    } catch (error) {
        console.error(
            chalk.yellow(
                "[CACHE] Cleanup failed:"
            ),
            error.message
        );
    }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
    console.log(
        chalk.cyan(
            "=========================================="
        )
    );

    console.log(
        chalk.cyan(
            "        BOT STARTING / STABLE MODE"
        )
    );

    console.log(
        chalk.cyan(
            "=========================================="
        )
    );

    const history =
        readJSON(
            HISTORY_FILE,
            []
        );

    if (!Array.isArray(history)) {
        writeJSON(
            HISTORY_FILE,
            []
        );
    }

    const sessions =
        fs.readdirSync(
            SESSION_DIR
        );

    if (sessions.length === 0) {
        console.log(
            chalk.yellow(
                "[SESSION] No saved sessions found."
            )
        );
    }

    for (const file of sessions) {
        if (!file.endsWith(".json")) {
            continue;
        }

        const userid =
            path.parse(file).name;

        const sessionFile =
            path.join(
                SESSION_DIR,
                file
            );

        try {
            const state =
                readJSON(
                    sessionFile,
                    null
                );

            if (
                !Array.isArray(state) ||
                state.length === 0
            ) {
                console.log(
                    chalk.yellow(
                        `[SESSION] Invalid session: ${file}`
                    )
                );

                continue;
            }

            const userConfig =
                history.find(
                    item =>
                        item &&
                        String(item.userid) ===
                        String(userid)
                );

            if (!userConfig) {
                console.log(
                    chalk.yellow(
                        `[SESSION] No history record for ${userid}. Restoring defaults.`
                    )
                );
            }

            const prefix =
                userConfig?.prefix || "";

            const admin =
                Array.isArray(
                    userConfig?.admin
                )
                    ? userConfig.admin
                    : [];

            const blacklist =
                Array.isArray(
                    userConfig?.blacklist
                )
                    ? userConfig.blacklist
                    : [];

            try {
                await accountLogin(
                    state,
                    userConfig?.enableCommands || [],
                    prefix,
                    admin,
                    blacklist
                );
            } catch (error) {
                console.error(
                    chalk.red(
                        `[SESSION] Initial connection failed for ${userid}:`
                    ),
                    error.message
                );

                // IMPORTANT:
                // Don't delete the session here.
                // Reconnect is handled separately.
                scheduleReconnect(
                    userid,
                    state,
                    prefix,
                    admin,
                    blacklist,
                    0
                );
            }

        } catch (error) {
            console.error(
                chalk.red(
                    `[SESSION] ${userid}:`
                ),
                error.message
            );
        }
    }
}

// ============================================================
// PERIODIC SAVE
// ============================================================

// Save state every 15 minutes.
// IMPORTANT: this DOES NOT process.exit().
cron.schedule(
    "*/15 * * * *",
    async () => {
        await saveRuntimeState();
        await cleanCache();
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
            error.message
        );

        // Do NOT immediately kill the process.
        // Individual command/event errors are already isolated.
    }
);

process.on(
    "unhandledRejection",
    reason => {
        console.error(
            chalk.red(
                "[UNHANDLED REJECTION]"
            ),
            reason?.stack ||
            reason
        );
    }
);

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

let shuttingDown = false;

async function shutdown(signal) {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;

    console.log(
        chalk.yellow(
            `[SYSTEM] Received ${signal}. Saving state...`
        )
    );

    await saveRuntimeState();

    try {
        server.close(() => {
            console.log(
                chalk.green(
                    "[SYSTEM] HTTP server closed."
                )
            );

            process.exit(0);
        });

        setTimeout(() => {
            process.exit(0);
        }, 10000);

    } catch {
        process.exit(0);
    }
}

process.on(
    "SIGTERM",
    () => shutdown("SIGTERM")
);

process.on(
    "SIGINT",
    () => shutdown("SIGINT")
);

// ============================================================
// START
// ============================================================

main().catch(error => {
    console.error(
        chalk.red(
            "[MAIN] Fatal startup error:"
        ),
        error.stack ||
        error.message
    );

    // Let the hosting process manager decide whether
    // to restart the process.
});