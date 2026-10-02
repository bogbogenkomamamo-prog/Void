const { spawn } = require("child_process");
const path = require("path");

const SCRIPT_FILE = "auto.js";
const SCRIPT_PATH = path.join(__dirname, SCRIPT_FILE);

// ==========================================
// 1. PROTECTION & HUMAN MIMICKER ENGINE
// ==========================================
class BotProtectionEngine {
  constructor(options = {}) {
    this.maxMessagesPerWindow = options.maxMessages || 3;
    this.windowMs = options.windowMs || 10000; // 10s window
    this.cooldownMs = options.cooldownMs || 30000; // 30s block kapag nag-spam
    this.userHistory = new Map();

    this.dedupWindowMs = options.dedupWindowMs || 5000; // 5s duplicate check
    this.recentMessages = new Map();

    this.cpm = options.cpm || 260; // Characters per minute typing speed
    this.minDelay = options.minDelay || 800; // Minimum delay in ms
  }

  // LIMITER: Pag may nag-spam, dedmahin
  isSpamming(userId) {
    const now = Date.now();
    let userData = this.userHistory.get(userId) || { timestamps: [], blockedUntil: 0 };

    if (now < userData.blockedUntil) return true;

    userData.timestamps = userData.timestamps.filter(ts => now - ts < this.windowMs);
    userData.timestamps.push(now);

    if (userData.timestamps.length > this.maxMessagesPerWindow) {
      userData.blockedUntil = now + this.cooldownMs;
      this.userHistory.set(userId, userData);
      console.log(`[LIMITER] User ${userId} detected spamming. Suppressing replies.`);
      return true;
    }

    this.userHistory.set(userId, userData);
    return false;
  }

  // TRAFFIC GOVERNOR: Supress duplicate / double messages
  isDuplicate(userId, messageText) {
    if (!messageText) return false;
    const now = Date.now();
    const cleanText = messageText.trim().toLowerCase();
    const key = `${userId}:${cleanText}`;
    const lastSeen = this.recentMessages.get(key);

    if (lastSeen && (now - lastSeen < this.dedupWindowMs)) {
      console.log(`[TRAFFIC GOVERNOR] Duplicate suppressed for user ${userId}.`);
      return true;
    }

    this.recentMessages.set(key, now);
    setTimeout(() => this.recentMessages.delete(key), this.dedupWindowMs);
    return false;
  }

  // HUMAN MIMICKER: Kalkulahin ang natural typing delay base sa haba ng text
  getTypingDelay(text) {
    if (!text) return this.minDelay;
    const delayFromLength = (text.length / (this.cpm / 60)) * 1000;
    const variance = (Math.random() * 0.4) + 0.8; // Randomizer (±20%)
    return Math.max(this.minDelay, Math.floor(delayFromLength * variance));
  }
}

// Global instance para magamit o ma-export
const botProtection = new BotProtectionEngine();

// ==========================================
// 2. MAIN PROCESS STARTER
// ==========================================
function start() {
  console.log("[SYSTEM] Starting main bot process with Protection Engine active...");

  const main = spawn("node", [SCRIPT_PATH], {
    cwd: __dirname,
    stdio: "inherit",
    shell: true
  });

  main.on("close", (exitCode) => {
    if (exitCode === 0) {
      console.log("Main process exited with code 0");
    } else if (exitCode === 1) {
      console.log("Main process exited with code 1. Restarting...");
      start();
    } else {
      console.error(`Main process exited with code ${exitCode}`);
    }
  });
}

// I-export ang protection engine para magamit nang direkta sa auto.js kung kinakailangan
module.exports = {
  start,
  botProtection
};

// Patakbuhin ang bot process
start();
