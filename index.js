const { spawn } = require("child_process");
const path = require("path");

const SCRIPT_FILE = "auto.js";
const SCRIPT_PATH = path.join(__dirname, SCRIPT_FILE);

// ==========================================
// HUMAN MIMICKER + TRAFFIC PROTECTION
// ==========================================
class BotProtectionEngine {
  constructor(options = {}) {
    // Anti-spam limiter
    this.maxMessagesPerWindow = options.maxMessages || 3;
    this.windowMs = options.windowMs || 10000;
    this.cooldownMs = options.cooldownMs || 30000;

    this.userHistory = new Map();

    // Duplicate message suppression
    this.dedupWindowMs = options.dedupWindowMs || 5000;
    this.recentMessages = new Map();

    // Human typing speed
    this.cpm = options.cpm || 260;

    // Minimum response delay
    this.minDelay = options.minDelay || 800;

    // Random extra pause
    this.maxExtraDelay = options.maxExtraDelay || 1800;

    // Cleanup every hour
    setInterval(() => {
      this.cleanupMemory();
    }, 60 * 60 * 1000);
  }

  // ==========================================
  // MEMORY CLEANUP
  // ==========================================
  cleanupMemory() {
    const now = Date.now();

    // Clean user limiter history
    for (const [userId, data] of this.userHistory.entries()) {
      data.timestamps = data.timestamps.filter(
        ts => now - ts < this.windowMs
      );

      if (
        data.timestamps.length === 0 &&
        now > data.blockedUntil
      ) {
        this.userHistory.delete(userId);
      }
    }

    // Clean duplicate cache
    for (const [key, timestamp] of this.recentMessages.entries()) {
      if (now - timestamp > this.dedupWindowMs) {
        this.recentMessages.delete(key);
      }
    }

    console.log("[SYSTEM] Protection memory cleanup completed.");
  }

  // ==========================================
  // SPAM LIMITER
  // ==========================================
  isSpamming(userId) {
    const now = Date.now();

    let userData = this.userHistory.get(userId);

    if (!userData) {
      userData = {
        timestamps: [],
        blockedUntil: 0
      };
    }

    // Still under cooldown
    if (now < userData.blockedUntil) {
      return true;
    }

    // Remove old timestamps
    userData.timestamps = userData.timestamps.filter(
      timestamp => now - timestamp < this.windowMs
    );

    userData.timestamps.push(now);

    // Too many messages
    if (
      userData.timestamps.length >
      this.maxMessagesPerWindow
    ) {
      userData.blockedUntil =
        now + this.cooldownMs;

      this.userHistory.set(userId, userData);

      console.log(
        `[LIMITER] ${userId} exceeded message limit.`
      );

      return true;
    }

    this.userHistory.set(userId, userData);

    return false;
  }

  // ==========================================
  // DUPLICATE / TRAFFIC GOVERNOR
  // ==========================================
  isDuplicate(userId, messageText) {
    if (!messageText) return false;

    const now = Date.now();

    // Normalize message
    const cleanText = messageText
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

    if (!cleanText) return false;

    const key = `${userId}:${cleanText}`;

    const lastSeen =
      this.recentMessages.get(key);

    // Duplicate detected
    if (
      lastSeen &&
      now - lastSeen < this.dedupWindowMs
    ) {
      console.log(
        `[TRAFFIC GOVERNOR] Duplicate suppressed: ${userId}`
      );

      return true;
    }

    this.recentMessages.set(key, now);

    // Auto remove
    setTimeout(() => {
      const current =
        this.recentMessages.get(key);

      if (
        current &&
        Date.now() - current >=
          this.dedupWindowMs
      ) {
        this.recentMessages.delete(key);
      }
    }, this.dedupWindowMs + 100);

    return false;
  }

  // ==========================================
  // HUMAN-LIKE TYPING DELAY
  // ==========================================
  getTypingDelay(text = "") {
    const length = text.length;

    /*
     * Average typing speed:
     * 260 CPM ~= 4.3 characters/sec
     */

    const charactersPerSecond =
      this.cpm / 60;

    const baseTypingTime =
      length / charactersPerSecond * 1000;

    // Random human variation
    const variation =
      0.75 + Math.random() * 0.65;

    // Small random pause
    const randomPause =
      Math.floor(
        Math.random() *
        this.maxExtraDelay
      );

    let delay =
      baseTypingTime * variation +
      randomPause;

    // Minimum delay
    delay = Math.max(
      this.minDelay,
      delay
    );

    // Prevent ridiculous delays
    delay = Math.min(
      delay,
      12000
    );

    return Math.floor(delay);
  }

  // ==========================================
  // RANDOM HUMAN PAUSE
  // ==========================================
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
        Math.random() * pauses.length
      )
    ];
  }

  // ==========================================
  // FINAL RESPONSE DELAY
  // ==========================================
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

// ==========================================
// CREATE PROTECTION ENGINE
// ==========================================

const botProtection =
  new BotProtectionEngine({
    maxMessages: 3,
    windowMs: 10000,
    cooldownMs: 30000,

    dedupWindowMs: 5000,

    // Human typing
    cpm: 260,

    // Minimum response delay
    minDelay: 800,

    // Random variation
    maxExtraDelay: 1800
  });

// ==========================================
// CHILD PROCESS
// ==========================================

let childProcess = null;
let restarting = false;

function start() {
  if (childProcess) {
    console.log(
      "[SYSTEM] Bot process already running."
    );

    return;
  }

  console.log(
    "[SYSTEM] Starting main bot process..."
  );

  childProcess = spawn(
    process.execPath,
    [SCRIPT_PATH],
    {
      cwd: __dirname,

      stdio: "inherit",

      // Mas stable kaysa shell:true
      shell: false,

      env: {
        ...process.env,

        NODE_ENV: "production"
      }
    }
  );

  childProcess.on("error", error => {
    console.error(
      "[SYSTEM] Child process error:",
      error.message
    );
  });

  childProcess.on(
    "close",
    exitCode => {
      childProcess = null;

      if (restarting) {
        restarting = false;
        return;
      }

      console.log(
        `[SYSTEM] Main process exited with code ${exitCode}.`
      );

      console.log(
        "[SYSTEM] Reconnecting in 5 seconds..."
      );

      setTimeout(() => {
        start();
      }, 5000);
    }
  );
}

// ==========================================
// DAILY REFRESH
// ==========================================

setInterval(() => {
  console.log(
    "[SYSTEM] Scheduled 24-hour refresh."
  );

  if (childProcess) {
    restarting = true;

    childProcess.kill("SIGTERM");

    // Force kill if process refuses to exit
    setTimeout(() => {
      if (childProcess) {
        console.log(
          "[SYSTEM] Force stopping old process..."
        );

        childProcess.kill("SIGKILL");
        childProcess = null;

        restarting = false;

        start();
      }
    }, 10000);
  } else {
    start();
  }

}, 24 * 60 * 60 * 1000);

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================

function shutdown(signal) {
  console.log(
    `[SYSTEM] Received ${signal}. Shutting down...`
  );

  if (childProcess) {
    childProcess.kill("SIGTERM");
  }

  setTimeout(() => {
    process.exit(0);
  }, 3000);
}

process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  start,
  botProtection
};

// ==========================================
// START
// ==========================================

start();
