"use strict";

const {
  spawn
} = require("child_process");

const path = require("path");

// ============================================================
// CONFIGURATION
// ============================================================

const SCRIPT_FILE = "auto.js";
const SCRIPT_PATH = path.join(__dirname, SCRIPT_FILE);

const CONFIG = {
  // ------------------------------------------
  // TRAFFIC PROTECTION
  // ------------------------------------------

  maxMessages: 3,
  windowMs: 10_000,
  cooldownMs: 30_000,

  // Same message suppression
  dedupWindowMs: 5_000,

  // ------------------------------------------
  // RESPONSE TIMING
  // ------------------------------------------

  cpm: 260,
  minDelay: 800,
  maxExtraDelay: 1800,

  // ------------------------------------------
  // PROCESS RECOVERY
  // ------------------------------------------

  initialRestartDelay: 5_000,

  maxRestartDelay: 60_000,

  backoffMultiplier: 2,

  // If process crashes repeatedly,
  // don't restart hundreds of times per minute.
  crashWindow: 60_000,

  maxCrashesInWindow: 8,

  // ------------------------------------------
  // HEALTH CHECK
  // ------------------------------------------

  healthCheckInterval: 30_000,

  // ------------------------------------------
  // SHUTDOWN
  // ------------------------------------------

  shutdownTimeout: 10_000
};

// ============================================================
// BOT PROTECTION ENGINE
// ============================================================

class BotProtectionEngine {

  constructor(options = {}) {

    this.maxMessagesPerWindow =
      options.maxMessages ||
      CONFIG.maxMessages;

    this.windowMs =
      options.windowMs ||
      CONFIG.windowMs;

    this.cooldownMs =
      options.cooldownMs ||
      CONFIG.cooldownMs;

    this.userHistory = new Map();

    this.dedupWindowMs =
      options.dedupWindowMs ||
      CONFIG.dedupWindowMs;

    this.recentMessages = new Map();

    this.cpm =
      options.cpm ||
      CONFIG.cpm;

    this.minDelay =
      options.minDelay ||
      CONFIG.minDelay;

    this.maxExtraDelay =
      options.maxExtraDelay ||
      CONFIG.maxExtraDelay;

    // Don't allow cleanup interval to keep
    // a process alive unnecessarily.
    this.cleanupTimer = setInterval(
      () => this.cleanupMemory(),
      60 * 60 * 1000
    );

    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  // ==========================================================
  // MEMORY CLEANUP
  // ==========================================================

  cleanupMemory() {

    const now = Date.now();

    // User limiter
    for (
      const [
        userId,
        data
      ] of this.userHistory.entries()
    ) {

      data.timestamps =
        data.timestamps.filter(
          timestamp =>
            now - timestamp <
            this.windowMs
        );

      if (
        data.timestamps.length === 0 &&
        now > data.blockedUntil
      ) {

        this.userHistory.delete(
          userId
        );
      }
    }

    // Duplicate cache
    for (
      const [
        key,
        timestamp
      ] of this.recentMessages.entries()
    ) {

      if (
        now - timestamp >
        this.dedupWindowMs
      ) {

        this.recentMessages.delete(
          key
        );
      }
    }

    console.log(
      "[PROTECTION] Memory cleanup completed."
    );
  }

  // ==========================================================
  // SPAM LIMITER
  // ==========================================================

  isSpamming(userId) {

    if (!userId) return false;

    const now = Date.now();

    let userData =
      this.userHistory.get(
        userId
      );

    if (!userData) {

      userData = {
        timestamps: [],
        blockedUntil: 0
      };
    }

    // Still blocked
    if (
      now <
      userData.blockedUntil
    ) {

      return true;
    }

    // Remove expired timestamps
    userData.timestamps =
      userData.timestamps.filter(
        timestamp =>
          now - timestamp <
          this.windowMs
      );

    userData.timestamps.push(now);

    // Too many messages
    if (
      userData.timestamps.length >
      this.maxMessagesPerWindow
    ) {

      userData.blockedUntil =
        now +
        this.cooldownMs;

      this.userHistory.set(
        userId,
        userData
      );

      console.log(
        `[LIMITER] ${userId} temporarily throttled.`
      );

      return true;
    }

    this.userHistory.set(
      userId,
      userData
    );

    return false;
  }

  // ==========================================================
  // DUPLICATE SUPPRESSION
  // ==========================================================

  isDuplicate(
    userId,
    messageText
  ) {

    if (
      !userId ||
      !messageText
    ) {

      return false;
    }

    const now = Date.now();

    const cleanText =
      String(messageText)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

    if (!cleanText)
      return false;

    const key =
      `${userId}:${cleanText}`;

    const previous =
      this.recentMessages.get(
        key
      );

    if (
      previous &&
      now - previous <
      this.dedupWindowMs
    ) {

      console.log(
        `[TRAFFIC] Duplicate suppressed for ${userId}.`
      );

      return true;
    }

    this.recentMessages.set(
      key,
      now
    );

    return false;
  }

  // ==========================================================
  // TYPING DELAY
  // ==========================================================

  getTypingDelay(
    text = ""
  ) {

    const length =
      String(text).length;

    const cps =
      this.cpm / 60;

    const base =
      length / cps * 1000;

    const variation =
      0.75 +
      Math.random() * 0.65;

    const extra =
      Math.floor(
        Math.random() *
        this.maxExtraDelay
      );

    let delay =
      base * variation +
      extra;

    delay =
      Math.max(
        this.minDelay,
        delay
      );

    delay =
      Math.min(
        delay,
        12_000
      );

    return Math.floor(
      delay
    );
  }

  // ==========================================================
  // HUMAN PAUSE
  // ==========================================================

  getHumanPause() {

    const pauses = [
      700,
      900,
      1100,
      1300,
      1500,
      1800,
      2200
    ];

    return pauses[
      Math.floor(
        Math.random() *
        pauses.length
      )
    ];
  }

  // ==========================================================
  // RESPONSE DELAY
  // ==========================================================

  getResponseDelay(
    text = ""
  ) {

    const typing =
      this.getTypingDelay(
        text
      );

    const pause =
      Math.random() < 0.25
        ? this.getHumanPause()
        : 0;

    return typing + pause;
  }
}

// ============================================================
// PROTECTION INSTANCE
// ============================================================

const botProtection =
  new BotProtectionEngine({
    maxMessages:
      CONFIG.maxMessages,

    windowMs:
      CONFIG.windowMs,

    cooldownMs:
      CONFIG.cooldownMs,

    dedupWindowMs:
      CONFIG.dedupWindowMs,

    cpm:
      CONFIG.cpm,

    minDelay:
      CONFIG.minDelay,

    maxExtraDelay:
      CONFIG.maxExtraDelay
  });

// ============================================================
// CHILD PROCESS STATE
// ============================================================

let childProcess = null;

let shuttingDown = false;

let restartTimer = null;

let restartDelay =
  CONFIG.initialRestartDelay;

let crashHistory = [];

let processStartedAt = 0;

// ============================================================
// LOGGING
// ============================================================

function log(message) {

  const timestamp =
    new Date()
      .toISOString();

  console.log(
    `[${timestamp}] ${message}`
  );
}

// ============================================================
// CLEAN CRASH HISTORY
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
// SHOULD RESTART?
// ============================================================

function canRestart() {

  cleanCrashHistory();

  if (
    crashHistory.length >=
    CONFIG.maxCrashesInWindow
  ) {

    log(
      "[RECOVERY] Too many crashes detected. Pausing automatic restart."
    );

    return false;
  }

  return true;
}

// ============================================================
// START BOT
// ============================================================

function start() {

  if (shuttingDown) {

    log(
      "[SYSTEM] Shutdown in progress. Start cancelled."
    );

    return;
  }

  if (childProcess) {

    log(
      "[SYSTEM] auto.js is already running."
    );

    return;
  }

  if (restartTimer) {

    clearTimeout(
      restartTimer
    );

    restartTimer = null;
  }

  log(
    "[SYSTEM] Starting auto.js..."
  );

  processStartedAt =
    Date.now();

  const childEnv = {
    ...process.env,

    NODE_ENV:
      process.env.NODE_ENV ||
      "production",

    BOT_SUPERVISOR:
      "true"
  };

  childProcess =
    spawn(
      process.execPath,
      [
        SCRIPT_PATH
      ],
      {
        cwd: __dirname,

        stdio: "inherit",

        shell: false,

        env: childEnv
      }
    );

  // ==========================================================
  // CHILD ERROR
  // ==========================================================

  childProcess.on(
    "error",
    error => {

      log(
        `[CHILD ERROR] ${error.message}`
      );
    }
  );

  // ==========================================================
  // CHILD EXIT
  // ==========================================================

  childProcess.on(
    "close",
    (exitCode, signal) => {

      const runtime =
        Date.now() -
        processStartedAt;

      childProcess = null;

      if (shuttingDown) {

        log(
          "[SYSTEM] auto.js stopped during shutdown."
        );

        return;
      }

      // ------------------------------------------------------
      // Process ran long enough:
      // reset aggressive crash backoff.
      // ------------------------------------------------------

      if (
        runtime >
        CONFIG.crashWindow
      ) {

        restartDelay =
          CONFIG.initialRestartDelay;

        crashHistory = [];
      }

      crashHistory.push(
        Date.now()
      );

      cleanCrashHistory();

      log(
        `[SYSTEM] auto.js exited. code=${exitCode}, signal=${signal || "none"}, runtime=${Math.floor(runtime / 1000)}s`
      );

      // ------------------------------------------------------
      // Crash protection
      // ------------------------------------------------------

      if (!canRestart()) {

        // Give the supervisor another chance
        // later instead of dying permanently.
        restartDelay =
          Math.min(
            restartDelay *
              CONFIG.backoffMultiplier,
            CONFIG.maxRestartDelay
          );

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

            if (
              shuttingDown
            ) {

              return;
            }

            start();

          },
          delay
        );

      // Don't keep the supervisor alive
      // solely because of this timer.
      if (
        restartTimer.unref
      ) {

        restartTimer.unref();
      }
    }
  );

  log(
    `[SYSTEM] auto.js PID: ${childProcess.pid}`
  );
}

// ============================================================
// HEALTH MONITOR
// ============================================================

const healthTimer =
  setInterval(
    () => {

      if (shuttingDown)
        return;

      if (!childProcess) {

        log(
          "[HEALTH] auto.js is not running."
        );

        return;
      }

      log(
        `[HEALTH] auto.js running normally. PID=${childProcess.pid}`
      );

    },
    CONFIG.healthCheckInterval
  );

if (
  healthTimer.unref
) {

  healthTimer.unref();
}

// ============================================================
// MANUAL RESTART
// ============================================================

function restart() {

  if (shuttingDown)
    return;

  if (!childProcess) {

    start();

    return;
  }

  log(
    "[SYSTEM] Restart requested."
  );

  childProcess.kill(
    "SIGTERM"
  );
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

function shutdown(
  signal
) {

  if (shuttingDown)
    return;

  shuttingDown = true;

  log(
    `[SYSTEM] Received ${signal}. Shutting down...`
  );

  if (restartTimer) {

    clearTimeout(
      restartTimer
    );

    restartTimer = null;
  }

  if (healthTimer) {

    clearInterval(
      healthTimer
    );
  }

  if (
    botProtection.cleanupTimer
  ) {

    clearInterval(
      botProtection.cleanupTimer
    );
  }

  if (childProcess) {

    const processToStop =
      childProcess;

    childProcess = null;

    try {

      processToStop.kill(
        "SIGTERM"
      );

    } catch (error) {

      log(
        `[SYSTEM] Failed to stop child: ${error.message}`
      );
    }

    // Force stop fallback
    setTimeout(
      () => {

        try {

          if (
            processToStop &&
            !processToStop.killed
          ) {

            log(
              "[SYSTEM] Force stopping auto.js..."
            );

            processToStop.kill(
              "SIGKILL"
            );
          }

        } catch (error) {

          log(
            `[SYSTEM] Force stop error: ${error.message}`
          );
        }

      },
      CONFIG.shutdownTimeout
    );
  }

  setTimeout(
    () => {

      process.exit(0);

    },
    CONFIG.shutdownTimeout + 1000
  );
}

// ============================================================
// SIGNAL HANDLERS
// ============================================================

process.on(
  "SIGINT",
  () =>
    shutdown("SIGINT")
);

process.on(
  "SIGTERM",
  () =>
    shutdown("SIGTERM")
);

// ============================================================
// UNCAUGHT ERROR
// ============================================================

process.on(
  "uncaughtException",
  error => {

    log(
      `[FATAL] Uncaught exception: ${error.stack || error.message}`
    );

    /*
     * Do not immediately spawn another auto.js here.
     * Node may still be unstable. Exit the supervisor and
     * let Render restart the service.
     */

    shutdown(
      "uncaughtException"
    );
  }
);

// ============================================================
// UNHANDLED PROMISE
// ============================================================

process.on(
  "unhandledRejection",
  reason => {

    log(
      `[WARNING] Unhandled rejection: ${reason?.stack || reason}`
    );
  }
);

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  start,
  restart,
  shutdown,
  botProtection
};

// ============================================================
// START SUPERVISOR
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
  "Automatic crash recovery: ENABLED"
);

log(
  "Duplicate protection engine: ENABLED"
);

log(
  "Health monitor: ENABLED"
);

log(
  "============================================================"
);

start();
