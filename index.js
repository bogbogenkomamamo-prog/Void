"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT = __dirname;
const AUTO_FILE = path.join(ROOT, "auto.js");
const DATA_DIR = path.join(ROOT, "data");
const RUNTIME_FILE = path.join(DATA_DIR, "runtime.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

const CONFIG = {
    port: Number(process.env.PORT) || 3000,

    initialRestartDelay: 5000,
    maxRestartDelay: 60000,
    backoffMultiplier: 2,

    crashWindow: 60000,
    maxCrashesInWindow: 5,
    crashPause: 5 * 60 * 1000,

    healthCheckInterval: 30000,
    shutdownTimeout: 10000,

    dashboardRateWindow: 10000,
    dashboardRateMax: 30
};

let childProcess = null;
let restartTimer = null;
let healthTimer = null;
let shutdownTimer = null;

let shuttingDown = false;
let starting = false;

let restartDelay = CONFIG.initialRestartDelay;
let crashHistory = [];

let processStartedAt = null;
let lastStartAttempt = null;

const dashboardRequests = new Map();

function now() {
    return Date.now();
}

function uptimeSeconds() {
    if (!processStartedAt) return 0;
    return Math.floor((now() - processStartedAt) / 1000);
}

function formatUptime(seconds) {
    seconds = Number(seconds) || 0;

    const days = Math.floor(seconds / 86400);
    seconds %= 86400;

    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;

    const minutes = Math.floor(seconds / 60);
    seconds %= 60;

    return [
        days ? `${days}d` : "",
        hours ? `${hours}h` : "",
        minutes ? `${minutes}m` : "",
        `${seconds}s`
    ].filter(Boolean).join(" ");
}

function readRuntime() {
    try {
        if (!fs.existsSync(RUNTIME_FILE)) {
            return {
                online: false,
                updatedAt: null,
                accounts: [],
                commands: [],
                stats: {}
            };
        }

        const raw = fs.readFileSync(RUNTIME_FILE, "utf8");

        if (!raw.trim()) {
            return {};
        }

        return JSON.parse(raw);
    } catch (error) {
        return {
            online: false,
            error: error.message
        };
    }
}

function cleanupDashboardRequests() {
    const cutoff = now() - CONFIG.dashboardRateWindow;

    for (const [ip, data] of dashboardRequests) {
        data.timestamps = data.timestamps.filter(time => time >= cutoff);

        if (!data.timestamps.length) {
            dashboardRequests.delete(ip);
        }
    }
}

function dashboardRateLimit(req) {
    const ip =
        req.headers["x-forwarded-for"] ||
        req.socket.remoteAddress ||
        "unknown";

    const current = now();

    let record = dashboardRequests.get(ip);

    if (!record) {
        record = {
            timestamps: []
        };

        dashboardRequests.set(ip, record);
    }

    record.timestamps = record.timestamps.filter(
        time => current - time < CONFIG.dashboardRateWindow
    );

    if (record.timestamps.length >= CONFIG.dashboardRateMax) {
        return false;
    }

    record.timestamps.push(current);

    return true;
}

function sendJSON(res, status, data) {
    const body = JSON.stringify(data);

    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Length": Buffer.byteLength(body)
    });

    res.end(body);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";

        req.on("data", chunk => {
            body += chunk.toString();

            if (body.length > 1024 * 1024) {
                reject(new Error("Request body too large."));
                req.destroy();
            }
        });

        req.on("end", () => {
            if (!body.trim()) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(body));
            } catch {
                reject(new Error("Invalid JSON."));
            }
        });

        req.on("error", reject);
    });
}

function getProcessStatus() {
    return {
        running: !!childProcess,
        pid: childProcess ? childProcess.pid : null,
        uptime: uptimeSeconds(),
        uptimeFormatted: formatUptime(uptimeSeconds()),
        startedAt: processStartedAt
            ? new Date(processStartedAt).toISOString()
            : null,
        lastStartAttempt: lastStartAttempt
            ? new Date(lastStartAttempt).toISOString()
            : null
    };
}

function getRecoveryStatus() {
    return {
        restartDelay,
        crashCount: crashHistory.length,
        crashHistory: crashHistory.map(time =>
            new Date(time).toISOString()
        ),
        nextRestartIn: restartTimer ? restartDelay : 0
    };
}

function spawnBot() {
    if (shuttingDown) return;

    if (starting) return;

    if (childProcess) return;

    if (!fs.existsSync(AUTO_FILE)) {
        console.error("[SUPERVISOR] auto.js not found.");
        return;
    }

    starting = true;
    lastStartAttempt = now();

    console.log("[SUPERVISOR] Starting auto.js...");

    const child = spawn(
        process.execPath,
        [AUTO_FILE],
        {
            cwd: ROOT,
            env: {
                ...process.env,
                NODE_ENV: process.env.NODE_ENV || "production",
                BOT_WORKER: "true",
                SUPERVISOR_PID: String(process.pid)
            },
            stdio: ["inherit", "inherit", "inherit", "ipc"],
            shell: false
        }
    );

    childProcess = child;
    processStartedAt = now();
    starting = false;

    child.on("message", message => {
        if (!message || typeof message !== "object") return;

        if (message.type === "runtime") {
            try {
                fs.writeFileSync(
                    RUNTIME_FILE,
                    JSON.stringify(message.data, null, 2),
                    "utf8"
                );
            } catch (error) {
                console.error(
                    "[SUPERVISOR] Runtime write error:",
                    error.message
                );
            }
        }
    });

    child.on("spawn", () => {
        console.log(
            `[SUPERVISOR] auto.js started PID=${child.pid}`
        );
    });

    child.on("error", error => {
        console.error(
            "[SUPERVISOR] Child process error:",
            error.message
        );
    });

    child.on("exit", (code, signal) => {
        childProcess = null;

        console.log(
            `[SUPERVISOR] auto.js exited code=${code} signal=${signal || "none"}`
        );

        if (shuttingDown) return;

        const current = now();

        crashHistory.push(current);

        crashHistory = crashHistory.filter(
            time => current - time <= CONFIG.crashWindow
        );

        if (crashHistory.length >= CONFIG.maxCrashesInWindow) {
            console.error(
                "[SUPERVISOR] Crash limit reached. Pausing recovery."
            );

            scheduleRestart(CONFIG.crashPause);

            return;
        }

        scheduleRestart(restartDelay);

        restartDelay = Math.min(
            CONFIG.maxRestartDelay,
            Math.floor(
                restartDelay * CONFIG.backoffMultiplier
            )
        );
    });
}

function scheduleRestart(delay) {
    if (shuttingDown) return;

    if (restartTimer) {
        clearTimeout(restartTimer);
    }

    console.log(
        `[SUPERVISOR] Restart scheduled in ${delay}ms.`
    );

    restartTimer = setTimeout(() => {
        restartTimer = null;

        if (!shuttingDown) {
            spawnBot();
        }
    }, delay);
}

function restartBot() {
    if (shuttingDown) return false;

    restartDelay = CONFIG.initialRestartDelay;

    if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
    }

    if (childProcess) {
        try {
            childProcess.kill("SIGTERM");
        } catch {}
    } else {
        spawnBot();
    }

    return true;
}

function startHealthMonitor() {
    if (healthTimer) {
        clearInterval(healthTimer);
    }

    healthTimer = setInterval(() => {
        cleanupDashboardRequests();

        if (!childProcess && !restartTimer && !shuttingDown) {
            spawnBot();
        }

        const runtime = readRuntime();

        if (
            runtime &&
            runtime.updatedAt &&
            runtime.online &&
            now() - new Date(runtime.updatedAt).getTime() > 120000
        ) {
            console.warn(
                "[SUPERVISOR] Worker runtime heartbeat is stale."
            );
        }
    }, CONFIG.healthCheckInterval);
}

const server = http.createServer(async (req, res) => {
    try {
        if (!dashboardRateLimit(req)) {
            sendJSON(res, 429, {
                ok: false,
                error: "Too many requests."
            });

            return;
        }

        const url = new URL(
            req.url,
            `http://${req.headers.host || "localhost"}`
        );

        if (req.method === "GET" && url.pathname === "/health") {
            sendJSON(res, 200, {
                ok: true,
                supervisor: true,
                worker: !!childProcess,
                pid: process.pid,
                time: new Date().toISOString()
            });

            return;
        }

        if (
            req.method === "GET" &&
            (
                url.pathname === "/" ||
                url.pathname === "/dashboard"
            )
        ) {
            const indexFile = path.join(
                ROOT,
                "public",
                "index.html"
            );

            if (!fs.existsSync(indexFile)) {
                sendJSON(res, 404, {
                    ok: false,
                    error: "public/index.html not found."
                });

                return;
            }

            const html = fs.readFileSync(indexFile);

            res.writeHead(200, {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store"
            });

            res.end(html);

            return;
        }

        if (
            req.method === "GET" &&
            url.pathname === "/api/status"
        ) {
            const runtime = readRuntime();

            sendJSON(res, 200, {
                ok: true,
                supervisor: getProcessStatus(),
                recovery: getRecoveryStatus(),
                worker: runtime
            });

            return;
        }

        if (
            req.method === "GET" &&
            url.pathname === "/api/bot/status"
        ) {
            const runtime = readRuntime();

            sendJSON(res, 200, {
                ok: true,
                process: getProcessStatus(),
                bot: runtime
            });

            return;
        }

        if (
            req.method === "GET" &&
            url.pathname === "/api/recovery"
        ) {
            sendJSON(res, 200, {
                ok: true,
                ...getRecoveryStatus()
            });

            return;
        }

        if (
            req.method === "GET" &&
            url.pathname === "/api/commands"
        ) {
            const runtime = readRuntime();

            sendJSON(res, 200, {
                ok: true,
                commands: runtime.commands || [],
                count: Array.isArray(runtime.commands)
                    ? runtime.commands.length
                    : 0
            });

            return;
        }

        if (
            req.method === "GET" &&
            url.pathname === "/api/accounts"
        ) {
            const runtime = readRuntime();

            sendJSON(res, 200, {
                ok: true,
                accounts: runtime.accounts || []
            });

            return;
        }

        if (
            req.method === "GET" &&
            url.pathname === "/api/hunting"
        ) {
            const runtime = readRuntime();

            sendJSON(res, 200, {
                ok: true,
                hunting: runtime.hunting || {
                    enabled: false
                }
            });

            return;
        }

        if (
            req.method === "GET" &&
            url.pathname === "/commands"
        ) {
            const runtime = readRuntime();

            sendJSON(res, 200, {
                ok: true,
                commands: runtime.commands || [],
                events: runtime.events || []
            });

            return;
        }

        if (
            req.method === "GET" &&
            url.pathname === "/info"
        ) {
            const runtime = readRuntime();

            sendJSON(res, 200, {
                ok: true,
                accounts: runtime.accounts || []
            });

            return;
        }

        if (
            req.method === "POST" &&
            url.pathname === "/api/restart"
        ) {
            await readBody(req);

            const result = restartBot();

            sendJSON(res, 200, {
                ok: result,
                message: result
                    ? "Restart requested."
                    : "Restart unavailable."
            });

            return;
        }

        sendJSON(res, 404, {
            ok: false,
            error: "Not found."
        });
    } catch (error) {
        sendJSON(res, 500, {
            ok: false,
            error: error.message
        });
    }
});

function shutdown(signal) {
    if (shuttingDown) return;

    shuttingDown = true;

    console.log(
        `[SUPERVISOR] Shutdown requested by ${signal}.`
    );

    if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
    }

    if (healthTimer) {
        clearInterval(healthTimer);
        healthTimer = null;
    }

    if (childProcess) {
        try {
            childProcess.kill("SIGTERM");
        } catch {}
    }

    shutdownTimer = setTimeout(() => {
        if (childProcess) {
            try {
                childProcess.kill("SIGKILL");
            } catch {}
        }

        process.exit(0);
    }, CONFIG.shutdownTimeout);

    server.close(() => {
        clearTimeout(shutdownTimer);
        process.exit(0);
    });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("uncaughtException", error => {
    console.error(
        "[SUPERVISOR] Uncaught exception:",
        error
    );
});

process.on("unhandledRejection", error => {
    console.error(
        "[SUPERVISOR] Unhandled rejection:",
        error
    );
});

server.listen(CONFIG.port, "0.0.0.0", () => {
    console.log(
        `[SUPERVISOR] Dashboard running on port ${CONFIG.port}`
    );

    spawnBot();
    startHealthMonitor();
});
