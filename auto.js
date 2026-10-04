"use strict";

const fs = require("fs");
const path = require("path");
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
// INFO (Fixed Circular Reference Error by omitting timers)
// ============================================================

app.get("/info", (req, res) => {
    const data = Array.from(
        Utils.account.values()
    ).map(account => ({
        name: account.name || "Unknown",
        profileUrl: account.profileUrl || "",
        thumbSrc: account.thumbSrc || "",
        time: Number(account.time || 0)
    }));

    res.json(data);
});

// ============================================================
// COMMANDS
// ============================================================

app.get("/commands", (req, res) => {
    const commands = [];
    for (const command of Utils.commands.values()) {
        if (!commands.includes(command.name)) {
            commands.push(command.name);
        }
    }

    const handleEvent = [];
    for (const command of Utils.handleEvent.values()) {
        if (!commands.includes(command.name) && !handleEvent.includes(command.name)) {
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
// LOGIN ROUTE (Bypassed Messenger login as requested)
// ============================================================

app.post("/login", async (req, res) => {
    return res.status(200).json({
        success: true,
        message: "Messenger login is currently bypassed/disabled. Server is running in web-only mode."
    });
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
// CLEAN CACHE
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
// MAIN (Skipped automatic session login to keep bot online smoothly)
// ============================================================

async function main() {
    console.log(
        chalk.cyan(
            "=========================================="
        )
    );

    console.log(
        chalk.cyan(
            "        BOT STARTING (BYPASSED LOGIN)"
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

    console.log(
        chalk.yellow(
            "[SESSION] Messenger login bypass is active. Bot will stay online via Express server without logging into Facebook."
        )
    );
}

// ============================================================
// PERIODIC SAVE
// ============================================================

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
});
