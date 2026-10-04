"use strict";

const { spawn } = require("child_process");
const path = require("path");

const SCRIPT_FILE = "auto.js";
const SCRIPT_PATH = path.join(__dirname, SCRIPT_FILE);

// ============================================================
// CONFIG
// ============================================================

const CONFIG = {
    restart: {
        enabled: true,

        // Initial restart delay
        initialDelay: 5000,

        // Maximum delay between restart attempts
        maxDelay: 5 * 60 * 1000,

        // Prevent extremely fast restart loops
        stableAfter: 60 * 1000
    },

    process: {
        cwd: __dirname,
        stdio: "inherit"
    }
};

// ============================================================
// STATE
// ============================================================

let main = null;
let stopping = false;

let restartAttempt = 0;
let restartTimer = null;

let startedAt = 0;

// ============================================================
// LOGGING
// ============================================================

function timestamp() {
    return new Date().toISOString();
}

function log(message) {
    console.log(
        `[${timestamp()}] ${message}`
    );
}

function warn(message) {
    console.warn(
        `[${timestamp()}] ${message}`
    );
}

function error(message) {
    console.error(
        `[${timestamp()}] ${message}`
    );
}

// ============================================================
// VALIDATE AUTO.JS
// ============================================================

function validateScript() {
    if (!require("fs").existsSync(SCRIPT_PATH)) {
        error(
            `Cannot find ${SCRIPT_FILE} at ${SCRIPT_PATH}`
        );

        return false;
    }

    return true;
}

// ============================================================
// CALCULATE RESTART DELAY
// ============================================================

function getRestartDelay() {
    const delay =
        CONFIG.restart.initialDelay *
        Math.pow(
            2,
            Math.min(restartAttempt, 6)
        );

    return Math.min(
        delay,
        CONFIG.restart.maxDelay
    );
}

// ============================================================
// RESET RESTART BACKOFF
// ============================================================

function markStable() {
    setTimeout(() => {
        if (
            main &&
            !main.killed &&
            !stopping
        ) {
            restartAttempt = 0;

            log(
                "Main process has been stable. Restart backoff reset."
            );
        }
    }, CONFIG.restart.stableAfter);
}

// ============================================================
// START PROCESS
// ============================================================

function start() {
    if (stopping) {
        return;
    }

    if (!validateScript()) {
        scheduleRestart();
        return;
    }

    if (
        main &&
        !main.killed &&
        main.exitCode === null
    ) {
        warn(
            "Main process is already running."
        );

        return;
    }

    log(
        `Starting ${SCRIPT_FILE}...`
    );

    startedAt = Date.now();

    try {
        main = spawn(
            process.execPath,
            [SCRIPT_PATH],
            {
                cwd: CONFIG.process.cwd,
                stdio: CONFIG.process.stdio,
                shell: false,
                windowsHide: true,
                env: {
                    ...process.env,
                    NODE_ENV:
                        process.env.NODE_ENV ||
                        "production"
                }
            }
        );
    } catch (err) {
        error(
            `Failed to spawn ${SCRIPT_FILE}: ${err.message}`
        );

        scheduleRestart();

        return;
    }

    log(
        `Main process started. PID: ${main.pid}`
    );

    // --------------------------------------------------------
    // PROCESS ERROR
    // --------------------------------------------------------

    main.on(
        "error",
        (err) => {
            error(
                `Main process error: ${err.message}`
            );
        }
    );

    // --------------------------------------------------------
    // PROCESS CLOSE
    // --------------------------------------------------------

    main.on(
        "close",
        (exitCode, signal) => {
            const runtime =
                Date.now() - startedAt;

            log(
                `Main process closed. ` +
                `exitCode=${exitCode}, signal=${signal || "none"}`
            );

            main = null;

            if (stopping) {
                return;
            }

            // A process that stayed alive for a while
            // is considered stable. Don't keep increasing
            // the restart delay forever.
            if (
                runtime >=
                CONFIG.restart.stableAfter
            ) {
                restartAttempt = 0;
            }

            if (
                !CONFIG.restart.enabled
            ) {
                warn(
                    "Automatic restart is disabled."
                );

                return;
            }

            scheduleRestart();
        }
    );

    markStable();
}

// ============================================================
// RESTART SCHEDULER
// ============================================================

function scheduleRestart() {
    if (stopping) {
        return;
    }

    if (restartTimer) {
        return;
    }

    const delay =
        getRestartDelay();

    restartAttempt++;

    warn(
        `Restarting ${SCRIPT_FILE} in ` +
        `${Math.ceil(delay / 1000)} seconds ` +
        `(attempt ${restartAttempt})...`
    );

    restartTimer = setTimeout(() => {
        restartTimer = null;

        if (stopping) {
            return;
        }

        start();

    }, delay);
}

// ============================================================
// MANUAL STOP
// ============================================================

function stop(signal = "SIGTERM") {
    if (stopping) {
        return;
    }

    stopping = true;

    if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
    }

    if (
        main &&
        !main.killed &&
        main.exitCode === null
    ) {
        log(
            `Stopping main process with ${signal}...`
        );

        try {
            main.kill(signal);
        } catch (err) {
            error(
                `Failed to stop process: ${err.message}`
            );
        }

        // Safety timeout
        setTimeout(() => {
            if (
                main &&
                !main.killed &&
                main.exitCode === null
            ) {
                warn(
                    "Process did not stop gracefully. Sending SIGKILL..."
                );

                try {
                    main.kill("SIGKILL");
                } catch {}
            }
        }, 10000);

    } else {
        process.exit(0);
    }
}

// ============================================================
// SIGNAL HANDLERS
// ============================================================

process.on(
    "SIGINT",
    () => {
        log("SIGINT received.");
        stop("SIGINT");
    }
);

process.on(
    "SIGTERM",
    () => {
        log("SIGTERM received.");
        stop("SIGTERM");
    }
);

// ============================================================
// UNHANDLED ERRORS IN WRAPPER
// ============================================================

process.on(
    "uncaughtException",
    (err) => {
        error(
            `Wrapper uncaught exception: ${
                err.stack || err.message
            }`
        );

        // Don't immediately kill the wrapper.
        // auto.js has its own error handling.
    }
);

process.on(
    "unhandledRejection",
    (reason) => {
        error(
            `Wrapper unhandled rejection: ${
                reason?.stack || reason
            }`
        );
    }
);

// ============================================================
// START
// ============================================================

log(
    "=========================================="
);

log(
    "        PROCESS SUPERVISOR ONLINE"
);

log(
    "=========================================="
);

start();