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
    this.windowMs = options.windowMs || 10000;
    this.cooldownMs = options.cooldownMs || 30000;
    this.userHistory = new Map();

    this.dedupWindowMs = options.dedupWindowMs || 5000;
    this.recentMessages = new Map();

    this.cpm = options.cpm || 260;
    this.minDelay = options.minDelay || 800;

    // AUTO CLEANUP: Lilinisin ang RAM memory tuwing 1 oras para sa 1-week stability
    setInterval(() => this.cleanupMemory(), 60 * 60 * 1000);
  }

  cleanupMemory() {
    const now = Date.now();
    // Alisin ang lumang history ng users
    for (const [userId, data] of this.userHistory.entries()) {
      if (now > data.blockedUntil && data.timestamps.length === 0) {
        this.userHistory.delete(userId);
      }
    }
    console.log("[SYSTEM] Memory cleanup completed for long-running stability.");
  }

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

  getTypingDelay(text) {
    if (!text) return this.minDelay;
    const delayFromLength = (text.length / (this.cpm / 60)) * 1000;
    const variance = (Math.random() * 0.4) + 0.8;
    return Math.max(this.minDelay, Math.floor(delayFromLength * variance));
  }
}

const botProtection = new BotProtectionEngine();

// ==========================================
// 2. STABLE CHILD PROCESS MANAGEMENT
// ==========================================
let childProcess = null;

function start() {
  console.log("[SYSTEM] Starting main bot process...");

  childProcess = spawn("node", [SCRIPT_PATH], {
    cwd: __dirname,
    stdio: "inherit",
    shell: true
  });

  childProcess.on("close", (exitCode) => {
    console.log(`[SYSTEM] Main process exited with code ${exitCode}. Reconnecting in 5 seconds...`);
    setTimeout(() => start(), 5000); // 5 seconds interval bago mag-restart kapag nag-crash
  });
}

// DAILY RESTART: Kusa nitong ire-restart ang script tuwing 24 oras para hindi mag-lag ang bot sa loob ng 1 linggo
setInterval(() => {
  console.log("[SYSTEM] Scheduled 24-hour refresh. Restarting bot process...");
  if (childProcess) {
    childProcess.kill();
  }
}, 24 * 60 * 60 * 1000);

module.exports = {
  start,
  botProtection
};

start();
