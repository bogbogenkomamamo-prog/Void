"use strict";

/*
 * ============================================================
 * SANZU AI — BOT SUPERVISOR
 * Framework:
 *   index.js
 *      └── auto.js
 *            └── script/*
 *
 * PURPOSE:
 *   - Process supervision
 *   - Crash recovery
 *   - Health monitoring
 *   - Dashboard API
 *   - Safe restart
 *   - Runtime statistics
 *   - Resource protection
 *   - Graceful shutdown
 *
 * NOTE:
 *   This supervisor does NOT attempt to evade platform
 *   detection or impersonate a human.
 * ============================================================
 */

const {
  spawn
} = require("child_process");

const path = require("path");
const fs = require("fs");
const http = require("http");

// ============================================================
// PATHS
// ============================================================

const ROOT_DIR = __dirname;

const SCRIPT_FILE = "auto.js";

const SCRIPT_PATH =
  path.join(ROOT_DIR, SCRIPT_FILE);

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {

  // ----------------------------------------------------------
  // SERVER
  // ----------------------------------------------------------

  host:
    process.env.HOST ||
    "0.0.0.0",

  port:
    Number(
      process.env.PORT ||
      3000
    ),

  // ----------------------------------------------------------
  // PROCESS RECOVERY
  // ----------------------------------------------------------

  initialRestartDelay:
    5_000,

  maxRestartDelay:
    60_000,

  backoffMultiplier:
    2,

  // ----------------------------------------------------------
  // CRASH PROTECTION
  // ----------------------------------------------------------

  crashWindow:
    60_000,

  maxCrashesInWindow:
    5,

  crashPause:
    5 * 60_000,

  // ----------------------------------------------------------
  // HEALTH MONITOR
  // ----------------------------------------------------------

  healthCheckInterval:
    30_000,

  // ----------------------------------------------------------
  // SHUTDOWN
  // ----------------------------------------------------------

  shutdownTimeout:
    10_000,

  // ----------------------------------------------------------
  // START LOCK
  // ----------------------------------------------------------

  startLockMs:
    3_000,

  // ----------------------------------------------------------
  // DASHBOARD RATE LIMIT
  // ----------------------------------------------------------

  dashboardWindow:
    60_000,

  dashboardMaxRequests:
    120,

  // ----------------------------------------------------------
  // STATS
  // ----------------------------------------------------------

  statsRetention:
    100
};

// ============================================================
// STATE
// ============================================================

let childProcess = null;

let restartTimer = null;

let healthTimer = null;

let forceKillTimer = null;

let shutdownTimer = null;

let shuttingDown = false;

let starting = false;

let restartDelay =
  CONFIG.initialRestartDelay;

let crashHistory = [];

let processStartedAt = 0;

let lastStartAttempt = 0;

let lastExit = null;

let lastError = null;

let totalStarts = 0;

let totalRestarts = 0;

let totalCrashes = 0;

let totalHealthyChecks = 0;

let totalDashboardRequests = 0;

let bootTime = Date.now();

// ============================================================
// DASHBOARD RATE LIMIT STATE
// ============================================================

const dashboardRate =
  new Map();

// ============================================================
// LOGGING
// ============================================================

function log(message) {

  console.log(
    `[${new Date().toISOString()}] ${message}`
  );
}

// ============================================================
// SAFE JSON
// ============================================================

function safeJSON(value) {

  try {

    return JSON.stringify(
      value
    );

  } catch (_) {

    return "{}";
  }
}

// ============================================================
// CLEAN CRASH HISTORY
// ============================================================

function cleanCrashHistory() {

  const now =
    Date.now();

  crashHistory =
    crashHistory.filter(
      timestamp =>
        now - timestamp <
        CONFIG.crashWindow
    );
}

// ============================================================
// CLEAR RESTART TIMER
// ============================================================

function clearRestartTimer() {

  if (restartTimer) {

    clearTimeout(
      restartTimer
    );

    restartTimer = null;
  }
}

// ============================================================
// CLEAR SHUTDOWN TIMER
// ============================================================

function clearShutdownTimer() {

  if (shutdownTimer) {

    clearTimeout(
      shutdownTimer
    );

    shutdownTimer = null;
  }
}

// ============================================================
// CHECK AUTO.JS
// ============================================================

function scriptExists() {

  try {

    return fs.existsSync(
      SCRIPT_PATH
    );

  } catch (_) {

    return false;
  }
}

// ============================================================
// PROCESS STATUS
// ============================================================

function getProcessStatus() {

  if (!childProcess) {

    return {
      online: false,
      pid: null,
      uptime: 0
    };
  }

  const uptime =
    Math.max(
      0,
      Math.floor(
        (
          Date.now() -
          processStartedAt
        ) / 1000
      )
    );

  return {
    online: true,
    pid: childProcess.pid,
    uptime
  };
}

// ============================================================
// CRASH STATUS
// ============================================================

function getCrashStatus() {

  cleanCrashHistory();

  return {

    crashesInWindow:
      crashHistory.length,

    maxCrashes:
      CONFIG.maxCrashesInWindow,

    crashWindow:
      CONFIG.crashWindow,

    recoveryPaused:
      Boolean(
        restartTimer &&
        crashHistory.length >=
        CONFIG.maxCrashesInWindow
      )
  };
}

// ============================================================
// FULL STATUS
// ============================================================

function getStatus() {

  const processStatus =
    getProcessStatus();

  return {

    ok: true,

    service:
      "SANZU AI",

    framework:
      "index.js → auto.js",

    node:
      process.version,

    platform:
      process.platform,

    architecture:
      process.arch,

    supervisor: {

      online:
        true,

      pid:
        process.pid,

      uptime:
        Math.floor(
          (
            Date.now() -
            bootTime
          ) / 1000
        )
    },

    autojs:
      processStatus,

    recovery:
      getCrashStatus(),

    statistics: {

      starts:
        totalStarts,

      restarts:
        totalRestarts,

      crashes:
        totalCrashes,

      healthyChecks:
        totalHealthyChecks,

      dashboardRequests:
        totalDashboardRequests
    },

    lastExit,

    lastError,

    timestamp:
      new Date().toISOString()
  };
}

// ============================================================
// SEND JSON
// ============================================================

function sendJSON(
  response,
  statusCode,
  data
) {

  const body =
    safeJSON(data);

  response.statusCode =
    statusCode;

  response.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  response.setHeader(
    "Cache-Control",
    "no-store"
  );

  response.end(
    body
  );
}

// ============================================================
// DASHBOARD RATE LIMIT
// ============================================================

function dashboardAllowed(
  request
) {

  const ip =
    request.socket?.remoteAddress ||
    "unknown";

  const now =
    Date.now();

  let entry =
    dashboardRate.get(ip);

  if (!entry) {

    entry = {
      started: now,
      count: 0
    };

    dashboardRate.set(
      ip,
      entry
    );
  }

  if (
    now - entry.started >=
    CONFIG.dashboardWindow
  ) {

    entry.started = now;
    entry.count = 0;
  }

  entry.count++;

  if (
    entry.count >
    CONFIG.dashboardMaxRequests
  ) {

    return false;
  }

  return true;
}

// ============================================================
// DASHBOARD SERVER
// ============================================================

const dashboardServer =
  http.createServer(
    (request, response) => {

      totalDashboardRequests++;

      if (
        !dashboardAllowed(
          request
        )
      ) {

        sendJSON(
          response,
          429,
          {
            ok: false,
            error:
              "Too many dashboard requests"
          }
        );

        return;
      }

      const url =
        new URL(
          request.url,
          `http://${CONFIG.host}:${CONFIG.port}`
        );

      // ------------------------------------------------------
      // ROOT
      // ------------------------------------------------------

      if (
        url.pathname === "/" ||
        url.pathname === "/health"
      ) {

        sendJSON(
          response,
          200,
          {
            ok: true,
            service:
              "SANZU AI",
            status:
              getProcessStatus(),
            timestamp:
              new Date().toISOString()
          }
        );

        return;
      }

      // ------------------------------------------------------
      // STATUS
      // ------------------------------------------------------

      if (
        url.pathname ===
        "/api/status"
      ) {

        sendJSON(
          response,
          200,
          getStatus()
        );

        return;
      }

      // ------------------------------------------------------
      // BOT STATUS
      // ------------------------------------------------------

      if (
        url.pathname ===
        "/api/bot/status"
      ) {

        sendJSON(
          response,
          200,
          {
            ok: true,
            ...getProcessStatus(),
            timestamp:
              new Date().toISOString()
          }
        );

        return;
      }

      // ------------------------------------------------------
      // RECOVERY
      // ------------------------------------------------------

      if (
        url.pathname ===
        "/api/recovery"
      ) {

        sendJSON(
          response,
          200,
          {
            ok: true,
            ...getCrashStatus(),
            restartDelay,
            timestamp:
              new Date().toISOString()
          }
        );

        return;
      }

      // ------------------------------------------------------
      // RESTART
      // ------------------------------------------------------

      if (
        url.pathname ===
        "/api/restart"
      ) {

        if (
          request.method !==
          "POST"
        ) {

          sendJSON(
            response,
            405,
            {
              ok: false,
              error:
                "POST required"
            }
          );

          return;
        }

        restart();

        sendJSON(
          response,
          200,
          {
            ok: true,
            message:
              "Restart requested"
          }
        );

        return;
      }

      // ------------------------------------------------------
      // 404
      // ------------------------------------------------------

      sendJSON(
        response,
        404,
        {
          ok: false,
          error:
            "Endpoint not found"
        }
      );
    }
  );

// ============================================================
// START DASHBOARD SERVER
// ============================================================

function startDashboard() {

  dashboardServer.listen(
    CONFIG.port,
    CONFIG.host,
    () => {

      log(
        `[DASHBOARD] API listening on ${CONFIG.host}:${CONFIG.port}`
      );

      log(
        `[DASHBOARD] Status endpoint: /api/status`
      );

    }
  );

  dashboardServer.on(
    "error",
    error => {

      log(
        `[DASHBOARD ERROR] ${error.message}`
      );
    }
  );
}

// ============================================================
// START AUTO.JS
// ============================================================

function start() {

  if (shuttingDown) {
    return;
  }

  // ----------------------------------------------------------
  // ALREADY RUNNING
  // ----------------------------------------------------------

  if (childProcess) {

    log(
      "[SYSTEM] auto.js is already running."
    );

    return;
  }

  // ----------------------------------------------------------
  // FILE CHECK
  // ----------------------------------------------------------

  if (!scriptExists()) {

    lastError =
      "auto.js was not found.";

    log(
      `[SYSTEM] ${lastError}`
    );

    scheduleRestart();

    return;
  }

  // ----------------------------------------------------------
  // START LOCK
  // ----------------------------------------------------------

  if (starting) {
    return;
  }

  const now =
    Date.now();

  if (
    now - lastStartAttempt <
    CONFIG.startLockMs
  ) {

    return;
  }

  lastStartAttempt =
    now;

  starting = true;

  clearRestartTimer();

  // ----------------------------------------------------------
  // START
  // ----------------------------------------------------------

  log(
    "[SYSTEM] Starting auto.js..."
  );

  processStartedAt =
    Date.now();

  let child;

  try {

    child =
      spawn(
        process.execPath,
        [
          SCRIPT_PATH
        ],
        {
          cwd:
            ROOT_DIR,

          stdio:
            "inherit",

          shell:
            false,

          env: {

            ...process.env,

            NODE_ENV:
              process.env.NODE_ENV ||
              "production",

            BOT_SUPERVISOR:
              "true",

            BOT_SUPERVISOR_PID:
              String(
                process.pid
              )
          }
        }
      );

  } catch (error) {

    starting = false;

    lastError =
      error.message;

    log(
      `[SYSTEM] Failed to spawn auto.js: ${error.message}`
    );

    scheduleRestart();

    return;
  }

  childProcess =
    child;

  starting = false;

  totalStarts++;

  log(
    `[SYSTEM] auto.js started. PID=${child.pid}`
  );

  // ==========================================================
  // CHILD ERROR
  // ==========================================================

  child.on(
    "error",
    error => {

      lastError =
        error.message;

      log(
        `[CHILD ERROR] ${error.message}`
      );
    }
  );

  // ==========================================================
  // CHILD EXIT
  // ==========================================================

  child.on(
    "close",
    (
      exitCode,
      signal
    ) => {

      const runtime =
        Date.now() -
        processStartedAt;

      if (
        childProcess === child
      ) {

        childProcess =
          null;
      }

      lastExit = {

        code:
          exitCode,

        signal:
          signal ||
          null,

        runtime:
          Math.floor(
            runtime / 1000
          ),

        timestamp:
          new Date().toISOString()
      };

      // ------------------------------------------------------
      // SHUTDOWN
      // ------------------------------------------------------

      if (shuttingDown) {

        log(
          "[SYSTEM] auto.js stopped during shutdown."
        );

        return;
      }

      // ------------------------------------------------------
      // LOG
      // ------------------------------------------------------

      log(
        `[SYSTEM] auto.js exited | code=${exitCode} | signal=${signal || "none"} | runtime=${Math.floor(runtime / 1000)}s`
      );

      // ------------------------------------------------------
      // STABLE RUNTIME
      // ------------------------------------------------------

      if (
        runtime >=
        CONFIG.crashWindow
      ) {

        log(
          "[RECOVERY] auto.js was stable. Resetting recovery backoff."
        );

        restartDelay =
          CONFIG.initialRestartDelay;

        crashHistory = [];

      } else {

        totalCrashes++;
      }

      // ------------------------------------------------------
      // RECORD EXIT
      // ------------------------------------------------------

      crashHistory.push(
        Date.now()
      );

      cleanCrashHistory();

      // ------------------------------------------------------
      // CRASH LIMIT
      // ------------------------------------------------------

      if (
        crashHistory.length >=
        CONFIG.maxCrashesInWindow
      ) {

        log(
          `[RECOVERY] ${CONFIG.maxCrashesInWindow} exits detected within ${CONFIG.crashWindow / 1000}s.`
        );

        log(
          `[RECOVERY] Recovery paused for ${CONFIG.crashPause / 1000}s.`
        );

        clearRestartTimer();

        restartTimer =
          setTimeout(
            () => {

              restartTimer =
                null;

              if (
                shuttingDown
              ) {

                return;
              }

              log(
                "[RECOVERY] Crash pause finished. Resuming auto.js."
              );

              crashHistory =
                [];

              restartDelay =
                CONFIG.initialRestartDelay;

              start();

            },
            CONFIG.crashPause
          );

        if (
          restartTimer.unref
        ) {

          restartTimer.unref();
        }

        return;
      }

      // ------------------------------------------------------
      // NORMAL RECOVERY
      // ------------------------------------------------------

      scheduleRestart();
    }
  );
}

// ============================================================
// SCHEDULE RESTART
// ============================================================

function scheduleRestart() {

  if (shuttingDown) {
    return;
  }

  if (childProcess) {
    return;
  }

  if (restartTimer) {
    return;
  }

  const delay =
    restartDelay;

  restartDelay =
    Math.min(
      restartDelay *
        CONFIG.backoffMultiplier,

      CONFIG.maxRestartDelay
    );

  log(
    `[RECOVERY] Restarting auto.js in ${Math.ceil(delay / 1000)} seconds...`
  );

  restartTimer =
    setTimeout(
      () => {

        restartTimer =
          null;

        if (
          !shuttingDown
        ) {

          start();
        }

      },
      delay
    );

  if (
    restartTimer.unref
  ) {

    restartTimer.unref();
  }
}

// ============================================================
// MANUAL RESTART
// ============================================================

function restart() {

  if (shuttingDown) {
    return;
  }

  totalRestarts++;

  // ----------------------------------------------------------
  // NOT RUNNING
  // ----------------------------------------------------------

  if (!childProcess) {

    log(
      "[SYSTEM] auto.js is offline. Starting..."
    );

    restartDelay =
      CONFIG.initialRestartDelay;

    start();

    return;
  }

  // ----------------------------------------------------------
  // RUNNING
  // ----------------------------------------------------------

  const child =
    childProcess;

  log(
    `[SYSTEM] Restart requested for PID=${child.pid}`
  );

  try {

    child.kill(
      "SIGTERM"
    );

  } catch (error) {

    lastError =
      error.message;

    log(
      `[SYSTEM] Restart error: ${error.message}`
    );
  }
}

// ============================================================
// HEALTH MONITOR
// ============================================================

function startHealthMonitor() {

  healthTimer =
    setInterval(
      () => {

        if (shuttingDown) {
          return;
        }

        // ----------------------------------------------------
        // OFFLINE
        // ----------------------------------------------------

        if (!childProcess) {

          log(
            "[HEALTH] auto.js is not running."
          );

          if (
            !restartTimer
          ) {

            start();
          }

          return;
        }

        // ----------------------------------------------------
        // ONLINE
        // ----------------------------------------------------

        const uptime =
          Math.floor(
            (
              Date.now() -
              processStartedAt
            ) / 1000
          );

        totalHealthyChecks++;

        log(
          `[HEALTH] auto.js OK | PID=${childProcess.pid} | uptime=${uptime}s`
        );

      },
      CONFIG.healthCheckInterval
    );

  if (
    healthTimer.unref
  ) {

    healthTimer.unref();
  }
}

// ============================================================
// MEMORY MONITOR
// ============================================================

function getMemoryStatus() {

  const memory =
    process.memoryUsage();

  return {

    rss:
      memory.rss,

    heapUsed:
      memory.heapUsed,

    heapTotal:
      memory.heapTotal,

    external:
      memory.external,

    arrayBuffers:
      memory.arrayBuffers
  };
}

// ============================================================
// MEMORY LOG
// ============================================================

function startMemoryMonitor() {

  setInterval(
    () => {

      if (
        shuttingDown
      ) {

        return;
      }

      const memory =
        getMemoryStatus();

      const rssMB =
        Math.round(
          memory.rss /
          1024 /
          1024
        );

      const heapMB =
        Math.round(
          memory.heapUsed /
          1024 /
          1024
        );

      log(
        `[MEMORY] RSS=${rssMB}MB | Heap=${heapMB}MB`
      );

    },
    60_000
  ).unref();
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

function shutdown(signal) {

  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  log(
    `[SYSTEM] Received ${signal}. Shutting down...`
  );

  // ----------------------------------------------------------
  // CANCEL RESTART
  // ----------------------------------------------------------

  clearRestartTimer();

  // ----------------------------------------------------------
  // HEALTH TIMER
  // ----------------------------------------------------------

  if (healthTimer) {

    clearInterval(
      healthTimer
    );

    healthTimer =
      null;
  }

  // ----------------------------------------------------------
  // DASHBOARD
  // ----------------------------------------------------------

  try {

    dashboardServer.close(
      () => {

        log(
          "[DASHBOARD] Server closed."
        );
      }
    );

  } catch (_) {}

  // ----------------------------------------------------------
  // CURRENT CHILD
  // ----------------------------------------------------------

  const child =
    childProcess;

  childProcess =
    null;

  // ----------------------------------------------------------
  // NO CHILD
  // ----------------------------------------------------------

  if (!child) {

    log(
      "[SYSTEM] No child process to stop."
    );

    process.exit(0);

    return;
  }

  // ----------------------------------------------------------
  // SIGTERM
  // ----------------------------------------------------------

  try {

    log(
      `[SYSTEM] Sending SIGTERM to PID=${child.pid}...`
    );

    child.kill(
      "SIGTERM"
    );

  } catch (error) {

    log(
      `[SYSTEM] Shutdown error: ${error.message}`
    );
  }

  // ----------------------------------------------------------
  // FORCE KILL
  // ----------------------------------------------------------

  forceKillTimer =
    setTimeout(
      () => {

        try {

          if (
            child.exitCode ===
            null
          ) {

            log(
              `[SYSTEM] Graceful shutdown timed out. Sending SIGKILL to PID=${child.pid}...`
            );

            child.kill(
              "SIGKILL"
            );
          }

        } catch (_) {}

      },
      CONFIG.shutdownTimeout
    );

  // ----------------------------------------------------------
  // FINAL EXIT
  // ----------------------------------------------------------

  shutdownTimer =
    setTimeout(
      () => {

        process.exit(0);

      },
      CONFIG.shutdownTimeout +
        1_000
    );
}

// ============================================================
// SIGNALS
// ============================================================

process.on(
  "SIGINT",
  () => {

    shutdown(
      "SIGINT"
    );
  }
);

process.on(
  "SIGTERM",
  () => {

    shutdown(
      "SIGTERM"
    );
  }
);

// ============================================================
// UNCAUGHT EXCEPTION
// ============================================================

process.on(
  "uncaughtException",
  error => {

    lastError =
      error.stack ||
      error.message;

    log(
      `[FATAL] ${lastError}`
    );

    shutdown(
      "uncaughtException"
    );
  }
);

// ============================================================
// UNHANDLED REJECTION
// ============================================================

process.on(
  "unhandledRejection",
  reason => {

    lastError =
      reason?.stack ||
      String(reason);

    log(
      `[WARNING] Unhandled rejection: ${lastError}`
    );

    /*
     * Do not immediately kill the supervisor.
     * auto.js can continue running if the rejection
     * is recoverable.
     */
  }
);

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

  start,

  restart,

  shutdown,

  getStatus,

  getProcessStatus
};

// ============================================================
// BOOT
// ============================================================

log(
  "============================================================"
);

log(
  "SANZU AI BOT SUPERVISOR"
);

log(
  "============================================================"
);

log(
  `Node.js: ${process.version}`
);

log(
  `Platform: ${process.platform}`
);

log(
  `Architecture: ${process.arch}`
);

log(
  `Script: ${SCRIPT_PATH}`
);

log(
  `Dashboard Port: ${CONFIG.port}`
);

log(
  "Crash recovery: ENABLED"
);

log(
  "Exponential backoff: ENABLED"
);

log(
  "Crash-loop protection: ENABLED"
);

log(
  "Health monitor: ENABLED"
);

log(
  "Dashboard API: ENABLED"
);

log(
  "Memory monitor: ENABLED"
);

log(
  "Graceful shutdown: ENABLED"
);

log(
  "============================================================"
);

// ============================================================
// START SERVICES
// ============================================================

startDashboard();

start();

startHealthMonitor();

startMemoryMonitor();
