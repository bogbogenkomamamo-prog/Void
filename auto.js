"use strict";

const fs = require("fs-extra");
const path = require("path");
const login = require("ws3-fca");

const ROOT = __dirname;

const DATA_DIR =
    path.join(ROOT, "data");

const SCRIPT_DIR =
    path.join(ROOT, "script");

const CONFIG_FILE =
    path.join(DATA_DIR, "config.json");

const HISTORY_FILE =
    path.join(DATA_DIR, "history.json");


/* =========================================================
   DIRECTORIES
========================================================= */

fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(SCRIPT_DIR);


if (!fs.existsSync(HISTORY_FILE)) {

    fs.writeJsonSync(
        HISTORY_FILE,
        [],
        { spaces: 2 }
    );

}


/* =========================================================
   CONFIG
========================================================= */

function getConfig() {

    try {

        return fs.readJsonSync(
            CONFIG_FILE
        );

    } catch {

        return {
            prefix: ".",
            admin: "",
            selectedCommands: [
                "hunting"
            ],
            selectedEvents: [],
            session: null,
            enabled: true
        };

    }

}


let config =
    getConfig();


/* =========================================================
   RUNTIME
========================================================= */

const runtime = {

    api: null,

    commands:
        new Map(),

    events:
        [],

    ready:
        false

};


/* =========================================================
   TRAFFIC GOVERNOR
========================================================= */

const TRAFFIC = {

    maxBurst: 3,

    burstWindow: 10000,

    cooldown: 30000,

    duplicateWindow: 5000,

    replyInterval: 10000,

    typingMin: 700,

    typingMax: 1600,

    maxQueuePerThread: 5

};


const threadState =
    new Map();


const messageCache =
    new Map();


function now() {
    return Date.now();
}


function getThreadState(threadID) {

    if (!threadState.has(threadID)) {

        threadState.set(
            threadID,
            {
                timestamps: [],
                lastReply: 0,
                cooldownUntil: 0,
                queue: 0
            }
        );

    }

    return threadState.get(threadID);

}


function cleanState(state) {

    const current =
        now();

    state.timestamps =
        state.timestamps.filter(
            timestamp =>
                current - timestamp <
                TRAFFIC.burstWindow
        );

}


function canProcess(threadID) {

    const state =
        getThreadState(threadID);

    cleanState(state);

    const current =
        now();


    if (
        state.cooldownUntil >
        current
    ) {
        return false;
    }


    if (
        state.queue >=
        TRAFFIC.maxQueuePerThread
    ) {
        return false;
    }


    if (
        state.timestamps.length >=
        TRAFFIC.maxBurst
    ) {

        state.cooldownUntil =
            current +
            TRAFFIC.cooldown;

        return false;

    }


    return true;

}


function markProcessed(threadID) {

    const state =
        getThreadState(threadID);

    cleanState(state);

    state.timestamps.push(
        now()
    );

}


function isDuplicate(event) {

    const body =
        String(
            event.body ||
            ""
        )
        .trim()
        .toLowerCase();


    if (!body) {
        return false;
    }


    const threadID =
        String(
            event.threadID ||
            ""
        );


    const key =
        `${threadID}:${body}`;


    const current =
        now();


    const previous =
        messageCache.get(key);


    messageCache.set(
        key,
        current
    );


    if (
        previous &&
        current - previous <
        TRAFFIC.duplicateWindow
    ) {

        return true;

    }


    return false;

}


/* =========================================================
   HELPERS
========================================================= */

function randomBetween(min, max) {

    return Math.floor(
        Math.random() *
        (max - min + 1)
    ) + min;

}


function delay(ms) {

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
    replyTo
) {

    return new Promise(
        resolve => {

            const state =
                getThreadState(
                    threadID
                );


            state.queue++;


            const send =
                () => {

                    const current =
                        now();


                    const elapsed =
                        current -
                        state.lastReply;


                    const wait =
                        Math.max(
                            0,
                            TRAFFIC.replyInterval -
                            elapsed
                        );


                    setTimeout(
                        () => {

                            try {

                                api.sendMessage(
                                    message,
                                    threadID,
                                    (err, info) => {

                                        state.queue--;

                                        state.lastReply =
                                            now();

                                        markProcessed(
                                            threadID
                                        );


                                        if (
                                            replyTo &&
                                            info &&
                                            info.messageID
                                        ) {

                                            try {

                                                api.setMessageReaction(
                                                    "👍",
                                                    info.messageID,
                                                    () => {}
                                                );

                                            } catch {}

                                        }


                                        resolve(
                                            {
                                                error: err || null,
                                                info
                                            }
                                        );

                                    },
                                    replyTo
                                );

                            } catch (error) {

                                state.queue--;

                                resolve({
                                    error
                                });

                            }

                        },
                        wait
                    );

                };


            send();

        }
    );

}


async function showTyping(
    api,
    threadID
) {

    try {

        api.sendTypingIndicator(
            threadID,
            () => {}
        );

    } catch {}


    await delay(
        randomBetween(
            TRAFFIC.typingMin,
            TRAFFIC.typingMax
        )
    );

}


/* =========================================================
   COMMAND LOADER
========================================================= */

function loadCommands() {

    runtime.commands.clear();

    runtime.events = [];


    if (!fs.existsSync(SCRIPT_DIR)) {
        return;
    }


    const files =
        fs.readdirSync(
            SCRIPT_DIR
        )
        .filter(
            file =>
                file.endsWith(".js")
        );


    for (const file of files) {

        try {

            const fullPath =
                path.join(
                    SCRIPT_DIR,
                    file
                );


            delete require.cache[
                require.resolve(fullPath)
            ];


            const command =
                require(fullPath);


            if (
                !command ||
                !command.config ||
                !command.config.name
            ) {
                continue;
            }


            const name =
                String(
                    command.config.name
                )
                .toLowerCase();


            runtime.commands.set(
                name,
                command
            );


            if (
                typeof command.handleEvent ===
                "function"
            ) {

                runtime.events.push(
                    command
                );

            }


            console.log(
                `[COMMAND] Loaded: ${name}`
            );


        } catch (error) {

            console.error(
                `[COMMAND] Failed ${file}:`,
                error.message
            );

        }

    }


    console.log(
        `[COMMAND] Total: ${runtime.commands.size}`
    );

}


loadCommands();


/* =========================================================
   PREFIX MATCHING
========================================================= */

function parseCommand(body) {

    const text =
        String(
            body ||
            ""
        ).trim();


    if (!text) {
        return null;
    }


    const prefix =
        String(
            config.prefix ||
            "."
        );


    const lower =
        text.toLowerCase();


    /* PREFIXLESS */

    for (
        const [name, command]
        of runtime.commands
    ) {

        const commandPrefixless =
            command.config &&
            (
                command.config.usePrefix === false ||
                command.config.hasPrefix === false
            );


        if (!commandPrefixless) {
            continue;
        }


        if (
            lower === name ||
            lower.startsWith(
                name + " "
            )
        ) {

            const args =
                text
                    .slice(name.length)
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean);


            return {
                command,
                name,
                args,
                prefix: ""
            };

        }

    }


    /* PREFIXED */

    if (
        prefix &&
        lower.startsWith(prefix.toLowerCase())
    ) {

        const content =
            text.slice(
                prefix.length
            ).trim();


        if (!content) {
            return null;
        }


        const parts =
            content
                .split(/\s+/);


        const name =
            parts
                .shift()
                .toLowerCase();


        const command =
            runtime.commands.get(
                name
            );


        if (!command) {
            return null;
        }


        return {
            command,
            name,
            args: parts,
            prefix
        };

    }


    return null;

}


/* =========================================================
   PERMISSION
========================================================= */

function hasPermission(
    command,
    senderID
) {

    const permission =
        Number(
            command.config.hasPermission || 0
        );


    if (permission <= 0) {
        return true;
    }


    const admin =
        String(
            config.admin ||
            ""
        );


    if (
        admin &&
        String(senderID) === admin
    ) {
        return true;
    }


    return false;

}


/* =========================================================
   EVENT PROCESSOR
========================================================= */

async function processEvent(
    event
) {

    if (!event) {
        return;
    }


    const threadID =
        String(
            event.threadID ||
            ""
        );


    if (!threadID) {
        return;
    }


    if (
        isDuplicate(event)
    ) {
        return;
    }


    if (
        !canProcess(threadID)
    ) {
        return;
    }


    /* Event handlers */

    for (
        const command
        of runtime.events
    ) {

        if (
            !command ||
            typeof command.handleEvent !==
            "function"
        ) {
            continue;
        }


        try {

            await command.handleEvent({
                api: runtime.api,
                event,

                body:
                    event.body || "",

                threadID,

                messageID:
                    event.messageID,

                senderID:
                    event.senderID,

                prefix:
                    config.prefix || "",

                commands:
                    runtime.commands,

                config,

                account:
                    runtime.api.getCurrentUserID
                        ? {
                            userID:
                                runtime.api.getCurrentUserID()
                          }
                        : {},

                safeSend:
                    (
                        message,
                        tid,
                        replyTo
                    ) =>
                        safeSend(
                            runtime.api,
                            message,
                            tid || threadID,
                            replyTo
                        )

            });

        } catch (error) {

            console.error(
                "[EVENT]",
                error.message
            );

        }

    }


    /* Command */

    const parsed =
        parseCommand(
            event.body
        );


    if (!parsed) {
        return;
    }


    const {
        command,
        args,
        prefix
    } = parsed;


    if (
        !hasPermission(
            command,
            event.senderID
        )
    ) {

        return;

    }


    try {

        await showTyping(
            runtime.api,
            threadID
        );


        if (
            typeof command.run ===
            "function"
        ) {

            await command.run({
                api:
                    runtime.api,

                event,

                args,

                body:
                    event.body || "",

                threadID,

                messageID:
                    event.messageID,

                senderID:
                    event.senderID,

                prefix,

                commands:
                    runtime.commands,

                handleEvent:
                    runtime.events,

                account: {
                    userID:
                        runtime.api.getCurrentUserID
                            ? runtime.api.getCurrentUserID()
                            : null
                },

                config,

                safeSend:
                    (
                        message,
                        tid,
                        replyTo
                    ) =>
                        safeSend(
                            runtime.api,
                            message,
                            tid || threadID,
                            replyTo
                        )

            });

        }

    } catch (error) {

        console.error(
            `[COMMAND ${parsed.name}]`,
            error
        );

    }

}


/* =========================================================
   LOGIN
========================================================= */

function getSession() {

    const current =
        getConfig();


    if (
        current.session &&
        Array.isArray(current.session)
    ) {

        return current.session;

    }


    if (
        current.session &&
        current.session.appState &&
        Array.isArray(
            current.session.appState
        )
    ) {

        return current.session.appState;

    }


    if (
        Array.isArray(
            current.appState
        )
    ) {

        return current.appState;

    }


    return null;

}


function startBot() {

    config =
        getConfig();


    const appState =
        getSession();


    if (
        !appState ||
        !Array.isArray(appState) ||
        appState.length === 0
    ) {

        console.log(
            "[NULLFIED] No saved session."
        );

        console.log(
            "[NULLFIED] Open dashboard and configure the session."
        );

        if (process.send) {

            process.send({
                type: "status",
                status: "waiting-session"
            });

        }

        return;

    }


    if (process.send) {

        process.send({
            type: "status",
            status: "logging-in"
        });

    }


    console.log(
        "[NULLFIED] Connecting..."
    );


    login(
        {
            appState
        },

        (error, api) => {

            if (error) {

                console.error(
                    "[LOGIN]",
                    error
                );


                if (process.send) {

                    process.send({
                        type: "error",
                        error:
                            String(
                                error.error ||
                                error.message ||
                                error
                            )
                    });

                }


                return;

            }


            runtime.api =
                api;

            runtime.ready =
                true;


            console.log(
                "========================================"
            );

            console.log(
                "[NULLFIED] BOT ONLINE"
            );

            console.log(
                "[NULLFIED] UID:",
                api.getCurrentUserID
                    ? api.getCurrentUserID()
                    : "unknown"
            );

            console.log(
                "[NULLFIED] COMMANDS:",
                [...runtime.commands.keys()].join(", ")
            );

            console.log(
                "========================================"
            );


            if (process.send) {

                process.send({
                    type: "status",
                    status: "online"
                });

            }


            api.setOptions({
                listenEvents: true,
                selfListen: false,
                updatePresence: true
            });


            api.listen(
                (error, event) => {

                    if (error) {

                        console.error(
                            "[LISTENER]",
                            error
                        );

                        return;

                    }


                    processEvent(
                        event
                    );

                }
            );

        }
    );

}


process.on(
    "uncaughtException",
    error => {

        console.error(
            "[UNCAUGHT]",
            error
        );

        if (process.send) {

            process.send({
                type: "error",
                error:
                    error.message
            });

        }

    }
);


process.on(
    "unhandledRejection",
    error => {

        console.error(
            "[REJECTION]",
            error
        );

    }
);


startBot();