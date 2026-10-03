"use strict";

const { spawn } = require("child_process");
const path = require("path");

// ============================================================
// BOT SUPERVISOR
// ============================================================

const SCRIPT_FILE = "auto.js";
const SCRIPT_PATH = path.join(__dirname, SCRIPT_FILE);

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  // ----------------------------------------------------------
  // PROCESS RECOVERY
  // ----------------------------------------------------------

  initialRestartDelay: 5_000,

  maxRestartDelay: 60_000,

  backoffMultiplier: 2,

  // ----------------------------------------------------------
  // CRASH PROTECTION
  // ----------------------------------------------------------

  crashWindow: 60_000,

  maxCrashesInWindow: 5,

  crashPause: 5 * 60_000,

  // ----------------------------------------------------------
  // HEALTH MONITOR
  // ----------------------------------------------------------

  healthCheckInterval: 30_000,

  // ----------------------------------------------------------
  // SHUTDOWN
  // ----------------------------------------------------------

  shutdownTimeout: 10_000,

  // Prevent multiple start() calls
  startLockMs: 3_000
};

// ============================================================
// STATE
// ============================================================

let childProcess = null;

let restartTimer = null;

let healthTimer = null;

let forceKillTimer = null;

let shuttingDown = false;

let starting = false;

let restartDelay =
  CONFIG.initialRestartDelay;

let crashHistory = [];

let processStartedAt = 0;

let lastStartAttempt = 0;

// ============================================================
// LOGGING
// ============================================================

function log(message) {
  console.log(
    `[${new Date().toISOString()}] ${message}`
  );
}

// ============================================================
// CRASH HISTORY CLEANUP
// ============================================================

function cleanCrashHistory() {
  const now = Date.now();

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
    clearTimeout(restartTimer);
    restartTimer = null;
  }
}

// ============================================================
// START AUTO.JS
// ============================================================

function start() {

  // ----------------------------------------------------------
  // SHUTDOWN CHECK
  // ----------------------------------------------------------

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
  // START LOCK
  // ----------------------------------------------------------

  if (starting) {
    return;
  }

  const now = Date.now();

  if (
    now - lastStartAttempt <
    CONFIG.startLockMs
  ) {
    return;
  }

  lastStartAttempt = now;

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

    child = spawn(
      process.execPath,
      [SCRIPT_PATH],
      {
        cwd: __dirname,

        stdio: "inherit",

        shell: false,

        env: {
          ...process.env,

          NODE_ENV:
            process.env.NODE_ENV ||
            "production",

          BOT_SUPERVISOR: "true"
        }
      }
    );

  } catch (error) {

    starting = false;

    log(
      `[SYSTEM] Failed to spawn auto.js: ${error.message}`
    );

    scheduleRestart();

    return;
  }

  childProcess = child;

  starting = false;

  log(
    `[SYSTEM] auto.js started. PID=${child.pid}`
  );

  // ==========================================================
  // CHILD PROCESS ERROR
  // ==========================================================

  child.on(
    "error",
    error => {

      log(
        `[CHILD ERROR] ${error.message}`
      );

    }
  );

  // ==========================================================
  // CHILD PROCESS EXIT
  // ==========================================================

  child.on(
    "close",
    (exitCode, signal) => {

      const runtime =
        Date.now() -
        processStartedAt;

      // Only clear current process
      if (
        childProcess === child
      ) {
        childProcess = null;
      }

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
      // LOG EXIT
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
      }

      // ------------------------------------------------------
      // RECORD CRASH/EXIT
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

              restartTimer = null;

              if (shuttingDown) {
                return;
              }

              log(
                "[RECOVERY] Crash pause finished. Resuming auto.js."
              );

              crashHistory = [];

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

        restartTimer = null;

        if (!shuttingDown) {
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

  // ----------------------------------------------------------
  // START IF NOT RUNNING
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
  // STOP CURRENT PROCESS
  // ----------------------------------------------------------

  log(
    `[SYSTEM] Restart requested for PID=${childProcess.pid}`
  );

  try {

    childProcess.kill(
      "SIGTERM"
    );

  } catch (error) {

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

          if (!restartTimer) {
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
  // STOP HEALTH MONITOR
  // ----------------------------------------------------------

  if (healthTimer) {

    clearInterval(
      healthTimer
    );

    healthTimer = null;
  }

  // ----------------------------------------------------------
  // CURRENT CHILD
  // ----------------------------------------------------------

  const child =
    childProcess;

  childProcess = null;

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
  // GRACEFUL STOP
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
  // FORCE STOP FALLBACK
  // ----------------------------------------------------------

  forceKillTimer =
    setTimeout(
      () => {

        try {

          if (
            child.exitCode === null
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

  if (
    forceKillTimer.unref
  ) {
    forceKillTimer.unref();
  }

  // ----------------------------------------------------------
  // EXIT SUPERVISOR
  // ----------------------------------------------------------

  setTimeout(
    () => {

      process.exit(0);

    },
    CONFIG.shutdownTimeout + 1_000
  );
}

// ============================================================
// SIGNALS
// ============================================================

process.on(
  "SIGINT",
  () => {
    shutdown("SIGINT");
  }
);

process.on(
  "SIGTERM",
  () => {
    shutdown("SIGTERM");
  }
);

// ============================================================
// UNCAUGHT EXCEPTION
// ============================================================

process.on(
  "uncaughtException",
  error => {

    log(
      `[FATAL] ${error.stack || error.message}`
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

    log(
      `[WARNING] Unhandled rejection: ${
        reason?.stack ||
        reason
      }`
    );

  }
);

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  start,
  restart,
  shutdown
};

// ============================================================
// BOOT
// ============================================================

log(
  "============================================================"
);

log(
  "BOT SUPERVISOR STARTING"
);

log(
  `Node.js: ${process.version}`
);

log(
  `Platform: ${process.platform}`
);

log(
  `Script: ${SCRIPT_PATH}`
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
  "Graceful shutdown: ENABLED"
);

log(
  "============================================================"
);

// ============================================================
// START
// ============================================================

start();

startHealthMonitor();