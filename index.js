"use strict";

const { spawn } = require("child_process");
const path = require("path");

// ============================================================
// CONFIGURATION
// ============================================================

const SCRIPT_FILE = "auto.js";
const SCRIPT_PATH = path.join(__dirname, SCRIPT_FILE);

const CONFIG = {
  // TRAFFIC PROTECTION
  maxMessages: 3,
  windowMs: 10_000,
  cooldownMs: 30_000,
  dedupWindowMs: 5_000,

  // RESPONSE TIMING
  cpm: 260,
  minDelay: 800,
  maxExtraDelay: 1800,

  // PROCESS RECOVERY
  initialRestartDelay: 5_000,
  maxRestartDelay: 60_000,
  backoffMultiplier: 2,

  crashWindow: 60_000,
  maxCrashesInWindow: 8,

  // HEALTH CHECK
  healthCheckInterval: 30_000,

  // SHUTDOWN
  shutdownTimeout: 10_000
};

// ============================================================
// BOT PROTECTION ENGINE
// ============================================================

class BotProtectionEngine {

  constructor(options = {}) {

    this.maxMessagesPerWindow =
      options.maxMessages ?? CONFIG.maxMessages;

    this.windowMs =
      options.windowMs ?? CONFIG.windowMs;

    this.cooldownMs =
      options.cooldownMs ?? CONFIG.cooldownMs;

    this.dedupWindowMs =
      options.dedupWindowMs ?? CONFIG.dedupWindowMs;

    this.cpm =
      options.cpm ?? CONFIG.cpm;

    this.minDelay =
      options.minDelay ?? CONFIG.minDelay;

    this.maxExtraDelay =
      options.maxExtraDelay ?? CONFIG.maxExtraDelay;

    this.userHistory = new Map();
    this.recentMessages = new Map();

    this.cleanupTimer = setInterval(
      () => this.cleanupMemory(),
      60 * 60 * 1000
    );

    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  cleanupMemory() {

    const now = Date.now();

    for (const [userId, data] of this.userHistory) {

      data.timestamps =
        data.timestamps.filter(
          timestamp =>
            now - timestamp < this.windowMs
        );

      if (
        data.timestamps.length === 0 &&
        now >= data.blockedUntil
      ) {
        this.userHistory.delete(userId);
      }
    }

    for (const [key, timestamp] of this.recentMessages) {

      if (
        now - timestamp >
        this.dedupWindowMs
      ) {
        this.recentMessages.delete(key);
      }
    }

    console.log(
      "[PROTECTION] Memory cleanup completed."
    );
  }

  isSpamming(userId) {

    if (!userId) return false;

    const now = Date.now();

    let data =
      this.userHistory.get(userId);

    if (!data) {

      data = {
        timestamps: [],
        blockedUntil: 0
      };
    }

    if (now < data.blockedUntil) {
      return true;
    }

    data.timestamps =
      data.timestamps.filter(
        timestamp =>
          now - timestamp < this.windowMs
      );

    data.timestamps.push(now);

    if (
      data.timestamps.length >
      this.maxMessagesPerWindow
    ) {

      data.blockedUntil =
        now + this.cooldownMs;

      this.userHistory.set(
        userId,
        data
      );

      console.log(
        `[LIMITER] ${userId} temporarily throttled.`
      );

      return true;
    }

    this.userHistory.set(
      userId,
      data
    );

    return false;
  }

  isDuplicate(userId, messageText) {

    if (!userId || !messageText) {
      return false;
    }

    const cleanText =
      String(messageText)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

    if (!cleanText) {
      return false;
    }

    const key =
      `${userId}:${cleanText}`;

    const now = Date.now();

    const previous =
      this.recentMessages.get(key);

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

  getTypingDelay(text = "") {

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
      base * variation + extra;

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

    return Math.floor(delay);
  }

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

  getResponseDelay(text = "") {

    const typing =
      this.getTypingDelay(text);

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
  new BotProtectionEngine();

// ============================================================
// CHILD PROCESS STATE
// ============================================================

let childProcess = null;
let restartTimer = null;

let shuttingDown = false;

let restartDelay =
  CONFIG.initialRestartDelay;

let crashHistory = [];

let processStartedAt = 0;

// ============================================================
// LOGGING
// ============================================================

function log(message) {

  console.log(
    `[${new Date().toISOString()}] ${message}`
  );
}

// ============================================================
// CRASH HISTORY
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
// START
// ============================================================

function start() {

  if (shuttingDown) {
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

  childProcess =
    spawn(
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

  log(
    `[SYSTEM] auto.js PID: ${childProcess.pid}`
  );

  childProcess.on(
    "error",
    error => {

      log(
        `[CHILD ERROR] ${error.message}`
      );
    }
  );

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

      cleanCrashHistory();

      log(
        `[SYSTEM] auto.js exited. code=${exitCode}, signal=${signal || "none"}, runtime=${Math.floor(runtime / 1000)}s`
      );

      // Stable process = reset recovery state
      if (
        runtime >= CONFIG.crashWindow
      ) {

        restartDelay =
          CONFIG.initialRestartDelay;

        crashHistory = [];
      }

      crashHistory.push(
        Date.now()
      );

      cleanCrashHistory();

      // Too many crashes
      if (
        crashHistory.length >=
        CONFIG.maxCrashesInWindow
      ) {

        log(
          "[RECOVERY] Crash limit reached. Automatic restart paused."
        );

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

      if (restartTimer.unref) {
        restartTimer.unref();
      }
    }
  );
}

// ============================================================
// HEALTH MONITOR
// ============================================================

const healthTimer =
  setInterval(
    () => {

      if (shuttingDown) {
        return;
      }

      if (!childProcess) {

        log(
          "[HEALTH] auto.js is not running."
        );

        return;
      }

      log(
        `[HEALTH] auto.js running. PID=${childProcess.pid}`
      );

    },
    CONFIG.healthCheckInterval
  );

if (healthTimer.unref) {
  healthTimer.unref();
}

// ============================================================
// MANUAL RESTART
// ============================================================

function restart() {

  if (shuttingDown) {
    return;
  }

  if (!childProcess) {

    start();

    return;
  }

  log(
    "[SYSTEM] Restart requested."
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

  if (restartTimer) {

    clearTimeout(
      restartTimer
    );

    restartTimer = null;
  }

  clearInterval(
    healthTimer
  );

  if (
    botProtection.cleanupTimer
  ) {

    clearInterval(
      botProtection.cleanupTimer
    );
  }

  const processToStop =
    childProcess;

  childProcess = null;

  if (processToStop) {

    try {

      processToStop.kill(
        "SIGTERM"
      );

    } catch (error) {

      log(
        `[SYSTEM] Stop error: ${error.message}`
      );
    }

    setTimeout(
      () => {

        try {

          if (
            processToStop.exitCode === null &&
            !processToStop.killed
          ) {

            log(
              "[SYSTEM] Force stopping auto.js..."
            );

            processToStop.kill(
              "SIGKILL"
            );
          }

        } catch (_) {}

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
// SIGNALS
// ============================================================

process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);

// ============================================================
// ERRORS
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

process.on(
  "unhandledRejection",
  reason => {

    log(
      `[WARNING] Unhandled rejection: ${
        reason?.stack || reason
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
  "Traffic limiter: ENABLED"
);

log(
  "Duplicate suppression: ENABLED"
);

log(
  "Crash recovery: ENABLED"
);

log(
  "Health monitor: ENABLED"
);

log(
  "============================================================"
);

start();
