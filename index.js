"use strict";

const fs = require("fs-extra");
const path = require("path");
const express = require("express");
const { spawn } = require("child_process");

const app = express();

const PORT = process.env.PORT || 8080;

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");

const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");

const AUTO_FILE = path.join(ROOT, "auto.js");

fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(PUBLIC_DIR);

if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeJsonSync(
        CONFIG_FILE,
        {
            prefix: ".",
            admin: "",
            selectedCommands: ["hunting"],
            selectedEvents: [],
            session: null,
            enabled: true
        },
        { spaces: 2 }
    );
}

if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeJsonSync(HISTORY_FILE, [], { spaces: 2 });
}

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use(express.static(PUBLIC_DIR));

let child = null;

const startedAt = Date.now();

const runtime = {
    status: "starting",
    restarts: 0,
    lastError: null,
    lastMessage: null
};


/* =========================================================
   CONFIG
========================================================= */

function readConfig() {
    try {
        return fs.readJsonSync(CONFIG_FILE);
    } catch {
        return {
            prefix: ".",
            admin: "",
            selectedCommands: ["hunting"],
            selectedEvents: [],
            session: null,
            enabled: true
        };
    }
}


function writeConfig(config) {
    fs.writeJsonSync(
        CONFIG_FILE,
        config,
        { spaces: 2 }
    );
}


/* =========================================================
   COMMAND DISCOVERY
========================================================= */

function discoverCommands() {

    const scriptDir =
        path.join(ROOT, "script");

    if (!fs.existsSync(scriptDir)) {
        return [];
    }

    const files =
        fs.readdirSync(scriptDir)
            .filter(file =>
                file.endsWith(".js")
            );

    const commands = [];

    for (const file of files) {

        try {

            const full =
                path.join(scriptDir, file);

            delete require.cache[
                require.resolve(full)
            ];

            const mod =
                require(full);

            if (
                mod &&
                mod.config &&
                mod.config.name
            ) {

                commands.push({
                    name: String(mod.config.name),
                    file,
                    version:
                        mod.config.version || "1.0.0",
                    description:
                        mod.config.description || "",
                    hasPermission:
                        mod.config.hasPermission ?? 0,
                    usePrefix:
                        mod.config.usePrefix !== false &&
                        mod.config.hasPrefix !== false
                });

            }

        } catch (error) {

            console.error(
                `[COMMAND] ${file}: ${error.message}`
            );

        }

    }

    return commands.sort(
        (a, b) =>
            a.name.localeCompare(b.name)
    );
}


/* =========================================================
   API
========================================================= */

app.get("/api/status", (req, res) => {

    const config = readConfig();

    res.json({

        ok: true,

        status: runtime.status,

        uptime:
            Date.now() - startedAt,

        restarts:
            runtime.restarts,

        lastError:
            runtime.lastError,

        lastMessage:
            runtime.lastMessage,

        pid:
            child ? child.pid : null,

        config: {
            prefix:
                config.prefix,

            admin:
                config.admin,

            selectedCommands:
                config.selectedCommands || [],

            selectedEvents:
                config.selectedEvents || []
        }

    });

});


app.get("/api/commands", (req, res) => {

    res.json({
        ok: true,
        commands: discoverCommands()
    });

});


app.get("/api/accounts", (req, res) => {

    res.json({
        ok: true,
        accounts: [
            {
                pid:
                    child ? child.pid : null,

                status:
                    runtime.status,

                uptime:
                    Date.now() - startedAt
            }
        ]
    });

});


app.get("/api/hunting", (req, res) => {

    res.json({
        ok: true,
        hunting: {
            available:
                discoverCommands()
                    .some(
                        command =>
                            command.name === "hunting"
                    )
        }
    });

});


/* =========================================================
   SAVE CONFIG / START
========================================================= */

app.post("/api/config", (req, res) => {

    try {

        const old =
            readConfig();

        const body =
            req.body || {};

        const config = {

            ...old,

            prefix:
                typeof body.prefix === "string"
                    ? body.prefix.trim()
                    : old.prefix,

            admin:
                typeof body.admin === "string"
                    ? body.admin.trim()
                    : old.admin,

            selectedCommands:
                Array.isArray(body.selectedCommands)
                    ? body.selectedCommands
                    : old.selectedCommands,

            selectedEvents:
                Array.isArray(body.selectedEvents)
                    ? body.selectedEvents
                    : old.selectedEvents,

            session:
                body.session !== undefined
                    ? body.session
                    : old.session,

            enabled:
                body.enabled !== undefined
                    ? Boolean(body.enabled)
                    : true

        };


        writeConfig(config);


        restartWorker();


        res.json({
            ok: true,
            message: "Configuration saved."
        });


    } catch (error) {

        res.status(500).json({
            ok: false,
            error: error.message
        });

    }

});


/* =========================================================
   WORKER
========================================================= */

function startWorker() {

    if (child) {
        return;
    }

    if (!fs.existsSync(AUTO_FILE)) {

        runtime.status = "missing-auto-js";

        console.error(
            "[NULLFIED] auto.js not found."
        );

        return;
    }


    runtime.status = "starting";


    child = spawn(
        process.execPath,
        [AUTO_FILE],
        {
            cwd: ROOT,

            env: {
                ...process.env,
                NULLFIED_CHILD: "1"
            },

            stdio: [
                "ignore",
                "pipe",
                "pipe",
                "ipc"
            ]
        }
    );


    child.stdout.on(
        "data",
        data => {

            const text =
                data.toString();

            process.stdout.write(
                `[AUTO] ${text}`
            );

            runtime.lastMessage =
                text.trim();

        }
    );


    child.stderr.on(
        "data",
        data => {

            const text =
                data.toString();

            process.stderr.write(
                `[AUTO ERROR] ${text}`
            );

            runtime.lastError =
                text.trim();

        }
    );


    child.on(
        "message",
        message => {

            if (!message) {
                return;
            }

            if (message.type === "status") {

                runtime.status =
                    message.status;

            }

            if (message.type === "error") {

                runtime.lastError =
                    message.error;

            }

        }
    );


    child.on(
        "error",
        error => {

            runtime.lastError =
                error.message;

            runtime.status =
                "error";

        }
    );


    child.on(
        "exit",
        (code, signal) => {

            child = null;

            runtime.status =
                "stopped";


            console.log(
                `[NULLFIED] Worker exited. code=${code} signal=${signal}`
            );


            if (
                code !== 0 &&
                runtime.status !== "stopping"
            ) {

                runtime.restarts++;

                setTimeout(
                    () => {

                        if (!child) {
                            startWorker();
                        }

                    },
                    5000
                );

            }

        }
    );

}


function stopWorker() {

    if (!child) {
        return;
    }

    runtime.status =
        "stopping";


    try {
        child.kill("SIGTERM");
    } catch {}


    setTimeout(
        () => {

            if (child) {

                try {
                    child.kill("SIGKILL");
                } catch {}

            }

        },
        5000
    );

}


function restartWorker() {

    stopWorker();

    setTimeout(
        () => {

            if (!child) {
                startWorker();
            }

        },
        1500
    );

}


/* =========================================================
   HEALTH
========================================================= */

app.get("/health", (req, res) => {

    res.json({
        ok: true,
        service: "NULLFIED",
        worker:
            runtime.status
    });

});


/* =========================================================
   SERVER
========================================================= */

const server =
    app.listen(
        PORT,
        () => {

            console.log(
                "========================================"
            );

            console.log(
                "        NULLFIED CONTROL CENTER"
            );

            console.log(
                "========================================"
            );

            console.log(
                `Dashboard: http://localhost:${PORT}`
            );

            console.log(
                "Worker: starting..."
            );

            startWorker();

        }
    );


/* =========================================================
   SHUTDOWN
========================================================= */

function shutdown() {

    console.log(
        "\n[NULLFIED] Shutting down..."
    );

    runtime.status =
        "stopping";

    stopWorker();

    setTimeout(
        () => {

            try {
                server.close();
            } catch {}

            process.exit(0);

        },
        1000
    );

}


process.on(
    "SIGINT",
    shutdown
);

process.on(
    "SIGTERM",
    shutdown
);