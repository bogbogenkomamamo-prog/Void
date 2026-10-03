"use strict";

const fs = require("fs");
const path = require("path");
const login = require("ws3-fca");
const express = require("express");
const chalk = require("chalk");
const bodyParser = require("body-parser");

// ============================================================
// PATHS
// ============================================================

const ROOT = __dirname;

const DATA_DIR = path.join(ROOT, "data");
const SESSION_DIR = path.join(DATA_DIR, "session");
const SCRIPT_DIR = path.join(ROOT, "script");

const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const DATABASE_FILE = path.join(DATA_DIR, "database.json");

// ============================================================
// DIRECTORIES
// ============================================================

for (const dir of [DATA_DIR, SESSION_DIR, SCRIPT_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

// ============================================================
// SAFE FILE HELPERS
// ============================================================

function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;

    const raw = fs.readFileSync(file, "utf8").trim();

    if (!raw) return fallback;

    return JSON.parse(raw);
  } catch (error) {
    console.error(`[JSON READ ERROR] ${file}`, error.message);
    return fallback;
  }
}

function writeJSON(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });

    const temp = `${file}.tmp`;

    fs.writeFileSync(
      temp,
      JSON.stringify(data, null, 2),
      "utf8"
    );

    fs.renameSync(temp, file);

    return true;
  } catch (error) {
    console.error(`[JSON WRITE ERROR] ${file}`, error.message);
    return false;
  }
}

// ============================================================
// DEFAULT CONFIG
// ============================================================

function createConfig() {
  const config = [
    {
      masterKey: {
        admin: []
      },

      devMode: false,
      database: false,
      restartTime: 15,

      forceLogin: true,
      listenEvents: true,
      logLevel: "silent",
      updatePresence: true,
      selfListen: true,

      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/120.0.0.0 Safari/537.36",

      online: true,
      autoMarkDelivery: false,
      autoMarkRead: false
    }
  ];

  writeJSON(CONFIG_FILE, config);

  if (!fs.existsSync(HISTORY_FILE)) {
    writeJSON(HISTORY_FILE, []);
  }

  if (!fs.existsSync(DATABASE_FILE)) {
    writeJSON(DATABASE_FILE, {});
  }

  return config;
}

const configData = fs.existsSync(CONFIG_FILE)
  ? readJSON(CONFIG_FILE, null)
  : createConfig();

const config =
  Array.isArray(configData) && configData.length
    ? configData[0]
    : createConfig()[0];

const dev = fs.existsSync("./dev.json")
  ? readJSON("./dev.json", [])
  : [];

// ============================================================
// GLOBAL UTILS
// ============================================================

const Utils = {
  commands: new Map(),
  handleEvent: new Map(),
  account: new Map(),
  cooldowns: new Map()
};

// ============================================================
// CONSERVATIVE TRAFFIC CONTROLLER
// ============================================================

const Traffic = {
  users: new Map(),
  duplicates: new Map(),
  queues: new Map(),
  lastReply: new Map(),
  blockedThreads: new Map(),

  // Conservative values.
  maxBurst: 3,
  burstWindow: 10000,

  // Temporary local cooldown after excessive incoming traffic.
  burstCooldown: 30000,

  // Duplicate incoming message window.
  duplicateWindow: 5000,

  // Minimum spacing between outgoing messages in the same thread.
  replyInterval: 10000,

  // Typing indicator duration.
  typingMin: 700,
  typingMax: 1600,

  // Queue protection.
  maxQueuePerThread: 5,

  // Cleanup interval.
  cleanupInterval: 30000,

  start() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      const now = Date.now();

      for (const [key, data] of this.users.entries()) {
        data.timestamps = data.timestamps.filter(
          timestamp => now - timestamp <= this.burstWindow
        );

        if (!data.timestamps.length) {
          this.users.delete(key);
        }
      }

      for (const [key, timestamp] of this.duplicates.entries()) {
        if (now - timestamp > this.duplicateWindow) {
          this.duplicates.delete(key);
        }
      }

      for (const [threadID, timestamp] of this.blockedThreads.entries()) {
        if (now >= timestamp) {
          this.blockedThreads.delete(threadID);
        }
      }

      for (const [threadID, timestamp] of this.lastReply.entries()) {
        if (now - timestamp > 120000) {
          this.lastReply.delete(threadID);
        }
      }
    }, this.cleanupInterval);

    this.cleanupTimer.unref?.();
  },

  normalize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  },

  isDuplicate(threadID, senderID, body) {
    const normalized = this.normalize(body);

    if (!normalized) {
      return false;
    }

    const key = `${threadID}:${senderID}:${normalized}`;

    const now = Date.now();
    const previous = this.duplicates.get(key);

    if (previous && now - previous < this.duplicateWindow) {
      return true;
    }

    this.duplicates.set(key, now);

    return false;
  },

  isBursting(threadID, senderID) {
    const now = Date.now();

    if (this.blockedThreads.has(threadID)) {
      const until = this.blockedThreads.get(threadID);

      if (now < until) {
        return true;
      }

      this.blockedThreads.delete(threadID);
    }

    const key = `${threadID}:${senderID}`;

    let data = this.users.get(key);

    if (!data) {
      data = {
        timestamps: []
      };

      this.users.set(key, data);
    }

    data.timestamps = data.timestamps.filter(
      timestamp => now - timestamp <= this.burstWindow
    );

    data.timestamps.push(now);

    if (data.timestamps.length > this.maxBurst) {
      this.blockedThreads.set(
        threadID,
        now + this.burstCooldown
      );

      data.timestamps = [];

      return true;
    }

    return false;
  },

  random(min, max) {
    return Math.floor(
      Math.random() * (max - min + 1)
    ) + min;
  },

  typingDuration() {
    return this.random(
      this.typingMin,
      this.typingMax
    );
  },

  responseDelay(text) {
    const content = String(text || "");

    const charsPerMinute = 260;

    const base =
      (content.length / charsPerMinute) * 60000;

    const variation =
      0.75 + Math.random() * 0.65;

    const extra =
      Math.random() * 1200;

    return Math.max(
      800,
      Math.min(
        12000,
        Math.floor(base * variation + extra)
      )
    );
  },

  async typing(api, threadID) {
    try {
      if (
        api &&
        typeof api.sendTypingIndicator === "function"
      ) {
        await api.sendTypingIndicator(threadID);
      }
    } catch (_) {
      // Typing indicator failure must never crash the bot.
    }

    await sleep(this.typingDuration());
  },

  getQueue(threadID) {
    if (!this.queues.has(threadID)) {
      this.queues.set(threadID, {
        running: false,
        items: []
      });
    }

    return this.queues.get(threadID);
  },

  enqueueSend(api, message, threadID, messageID) {
    return new Promise(resolve => {
      const queue = this.getQueue(threadID);

      if (queue.items.length >= this.maxQueuePerThread) {
        console.log(
          chalk.yellow(
            `[TRAFFIC] Queue full for ${threadID}; message suppressed.`
          )
        );

        resolve(false);
        return;
      }

      queue.items.push({
        api,
        message,
        threadID,
        messageID,
        resolve
      });

      this.processQueue(threadID);
    });
  },

  async processQueue(threadID) {
    const queue = this.getQueue(threadID);

    if (queue.running) {
      return;
    }

    queue.running = true;

    try {
      while (queue.items.length) {
        const item = queue.items.shift();

        if (!item) {
          continue;
        }

        try {
          const now = Date.now();

          const previous =
            this.lastReply.get(threadID) || 0;

          const elapsed = now - previous;

          if (elapsed < this.replyInterval) {
            await sleep(
              this.replyInterval - elapsed
            );
          }

          const delay =
            this.responseDelay(item.message);

          await sleep(delay);

          await this.typing(
            item.api,
            item.threadID
          );

          try {
            await item.api.sendMessage(
              item.message,
              item.threadID,
              item.messageID
                ? { replyToMessageID: item.messageID }
                : undefined
            );

            this.lastReply.set(
              threadID,
              Date.now()
            );

            item.resolve(true);
          } catch (sendError) {
            console.error(
              `[SEND ERROR] ${sendError.message}`
            );

            item.resolve(false);
          }

          // Small safety gap after every send.
          await sleep(500);
        } catch (error) {
          console.error(
            `[QUEUE ERROR] ${error.message}`
          );

          item.resolve(false);
        }
      }
    } finally {
      queue.running = false;

      if (!queue.items.length) {
        this.queues.delete(threadID);
      }
    }
  }
};

Traffic.start();

// ============================================================
// SAFE SEND
// ============================================================

function safeSend(api, message, threadID, messageID) {
  if (!api || !threadID || message == null) {
    return Promise.resolve(false);
  }

  return Traffic.enqueueSend(
    api,
    message,
    threadID,
    messageID
  );
}

// ============================================================
// SLEEP
// ============================================================

function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

// ============================================================
// COMMAND LOADER
// ============================================================

function normalizeCommandConfig(command) {
  if (!command.config) {
    command.config = {};
  }

  const cfg = command.config;

  cfg.name = String(
    cfg.name || "unknown"
  ).toLowerCase();

  cfg.role =
    Number.isFinite(cfg.role)
      ? cfg.role
      : Number.isFinite(cfg.hasPermission)
        ? cfg.hasPermission
        : 0;

  cfg.version =
    cfg.version || "1.0.0";

  cfg.hasPrefix =
    cfg.hasPrefix !== false &&
    cfg.usePrefix !== false;

  cfg.aliases = Array.isArray(cfg.aliases)
    ? cfg.aliases
    : [];

  cfg.aliases = cfg.aliases
    .map(x => String(x).toLowerCase())
    .filter(Boolean);

  cfg.description =
    cfg.description || "";

  cfg.usage =
    cfg.usages ||
    cfg.usage ||
    "";

  cfg.credits =
    cfg.credits || "Unknown";

  cfg.cooldown =
    Number(cfg.cooldown) || 0;

  cfg.dev =
    cfg.dev === true;

  return command;
}

function loadCommand(filePath) {
  try {
    delete require.cache[
      require.resolve(filePath)
    ];

    const command = require(filePath);

    if (!command) {
      return;
    }

    normalizeCommandConfig(command);

    const cfg = command.config;

    const names = [
      cfg.name,
      ...cfg.aliases
    ];

    const uniqueNames = [
      ...new Set(
        names
          .map(x => String(x).toLowerCase())
          .filter(Boolean)
      )
    ];

    Utils.commands.set(
      cfg.name,
      {
        ...command,
        config: cfg,
        aliases: uniqueNames
      }
    );

    console.log(
      chalk.green(
        `[COMMAND] Loaded ${cfg.name}`
      )
    );
  } catch (error) {
    console.error(
      chalk.red(
        `[COMMAND ERROR] ${filePath}`
      ),
      error
    );
  }
}

function loadEvent(filePath) {
  try {
    delete require.cache[
      require.resolve(filePath)
    ];

    const event = require(filePath);

    if (!event) {
      return;
    }

    if (!event.config) {
      return;
    }

    const cfg = event.config;

    cfg.name = String(
      cfg.name || path.basename(filePath, ".js")
    ).toLowerCase();

    Utils.handleEvent.set(
      cfg.name,
      event
    );

    console.log(
      chalk.cyan(
        `[EVENT] Loaded ${cfg.name}`
      )
    );
  } catch (error) {
    console.error(
      chalk.red(
        `[EVENT ERROR] ${filePath}`
      ),
      error
    );
  }
}

function loadScripts(directory) {
  if (!fs.existsSync(directory)) {
    return;
  }

  const files = fs.readdirSync(directory);

  for (const file of files) {
    const fullPath =
      path.join(directory, file);

    let stat;

    try {
      stat = fs.statSync(fullPath);
    } catch (_) {
      continue;
    }

    if (stat.isDirectory()) {
      loadScripts(fullPath);
      continue;
    }

    if (!file.endsWith(".js")) {
      continue;
    }

    try {
      delete require.cache[
        require.resolve(fullPath)
      ];

      const mod = require(fullPath);

      if (
        mod &&
        mod.config &&
        typeof mod.run === "function"
      ) {
        loadCommand(fullPath);
      } else if (
        mod &&
        mod.config &&
        typeof mod.handleEvent === "function"
      ) {
        loadEvent(fullPath);
      } else {
        console.log(
          chalk.gray(
            `[SKIP] ${file}`
          )
        );
      }
    } catch (error) {
      console.error(
        chalk.red(
          `[LOAD ERROR] ${file}`
        ),
        error.message
      );
    }
  }
}

loadScripts(SCRIPT_DIR);

// ============================================================
// EXPRESS SERVER
// ============================================================

const app = express();

app.use(
  express.static(
    path.join(ROOT, "public")
  )
);

app.use(bodyParser.json());
app.use(express.json());

app.get("/", (req, res) => {
  const file = path.join(
    ROOT,
    "public",
    "index.html"
  );

  if (fs.existsSync(file)) {
    return res.sendFile(file);
  }

  res.send("Bot is online.");
});

app.get(
  "/step_by_step_guide",
  (req, res) => {
    const file = path.join(
      ROOT,
      "public",
      "guide.html"
    );

    if (fs.existsSync(file)) {
      return res.sendFile(file);
    }

    res.status(404).send("Guide not found.");
  }
);

app.get("/online_user", (req, res) => {
  const file = path.join(
    ROOT,
    "public",
    "online.html"
  );

  if (fs.existsSync(file)) {
    return res.sendFile(file);
  }

  res.status(404).send("Online page not found.");
});

app.get("/info", (req, res) => {
  const accounts = [];

  for (const [
    userid,
    account
  ] of Utils.account.entries()) {
    accounts.push({
      userid,
      name: account.name || "Unknown",
      time: account.time || 0,
      online: account.online !== false
    });
  }

  res.json({
    status: "online",
    accounts
  });
});

app.get("/commands", (req, res) => {
  res.json({
    commands: [
      ...Utils.commands.values()
    ].map(command => ({
      name: command.config.name,
      aliases: command.config.aliases,
      description:
        command.config.description
    })),

    events: [
      ...Utils.handleEvent.values()
    ].map(event => ({
      name: event.config?.name || "unknown"
    }))
  });
});

// ============================================================
// LOGIN API
// ============================================================

app.post("/login", async (req, res) => {
  try {
    const {
      state,
      commands,
      prefix,
      admin,
      blacklist
    } = req.body;

    if (!Array.isArray(state)) {
      return res.status(400).json({
        error: "state must be an array"
      });
    }

    const validState =
      state.some(
        cookie =>
          cookie &&
          cookie.key === "c_user" &&
          cookie.value
      );

    if (!validState) {
      return res.status(400).json({
        error:
          "Invalid state: c_user cookie is required"
      });
    }

    const result =
      await accountLogin(
        state,
        commands,
        prefix,
        Array.isArray(admin)
          ? admin
          : admin
            ? [admin]
            : [],
        Array.isArray(blacklist)
          ? blacklist
          : []
      );

    return res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error(
      "[LOGIN ROUTE ERROR]",
      error
    );

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// HTTP SERVER
// ============================================================

const PORT =
  Number(process.env.PORT) || 3000;

const server = app.listen(
  PORT,
  () => {
    console.log(
      chalk.green(
        `Server is running on port ${PORT}`
      )
    );
  }
);

// ============================================================
// ACCOUNT LOGIN
// ============================================================

const activeLogins = new Map();

async function accountLogin(
  state,
  enableCommands = [],
  prefix = "",
  admin = [],
  blacklist = []
) {
  return new Promise((resolve, reject) => {
    let settled = false;

    try {
      login(
        {
          appState: state
        },

        async (error, api) => {
          if (error) {
            console.error(
              chalk.red(
                "[LOGIN ERROR]"
              ),
              error
            );

            if (!settled) {
              settled = true;
              reject(error);
            }

            return;
          }

          try {
            const userid =
              String(
                api.getCurrentUserID()
              );

            console.log(
              chalk.green(
                `[LOGIN] Account ${userid} connected`
              )
            );

            /*
             * Keep supplied command configuration.
             * If nothing was supplied, enable all loaded commands.
             */
            if (
              !Array.isArray(enableCommands) ||
              enableCommands.length === 0
            ) {
              enableCommands = [
                {
                  commands:
                    Array.from(
                      Utils.commands.values()
                    ).map(
                      command =>
                        command.config.name
                    )
                },
                {
                  handleEvent:
                    Array.from(
                      Utils.handleEvent.values()
                    ).map(
                      event =>
                        event.config?.name
                    )
                }
              ];
            }

            addThisUser(
              userid,
              enableCommands,
              state,
              prefix,
              admin,
              blacklist
            );

            let userInfo = {};

            try {
              userInfo =
                await api.getUserInfo(userid);
            } catch (infoError) {
              console.error(
                "[USER INFO ERROR]",
                infoError.message
              );
            }

            const account = {
              userid,
              name:
                userInfo?.[userid]?.name ||
                "Unknown",

              time: 0,

              online: true,

              api
            };

            Utils.account.set(
              userid,
              account
            );

            /*
             * Prevent duplicate login handlers
             * for the same account.
             */
            if (
              activeLogins.has(userid)
            ) {
              try {
                clearInterval(
                  activeLogins.get(userid)
                    .timer
                );
              } catch (_) {}

              activeLogins.delete(userid);
            }

            const timer =
              setInterval(() => {
                const current =
                  Utils.account.get(userid);

                if (current) {
                  current.time += 1;
                }
              }, 1000);

            timer.unref?.();

            activeLogins.set(
              userid,
              {
                api,
                timer
              }
            );

            // ====================================================
            // FCA OPTIONS
            // ====================================================

            try {
              api.setOptions({
                forceLogin:
                  config.forceLogin !== false,

                listenEvents:
                  config.listenEvents !== false,

                logLevel:
                  config.logLevel || "silent",

                updatePresence:
                  config.updatePresence !== false,

                selfListen:
                  config.selfListen === true,

                userAgent:
                  config.userAgent,

                online:
                  config.online !== false,

                autoMarkDelivery:
                  config.autoMarkDelivery === true,

                autoMarkRead:
                  config.autoMarkRead === true
              });
            } catch (optionsError) {
              console.error(
                "[OPTIONS ERROR]",
                optionsError.message
              );
            }

            // ====================================================
            // MQTT LISTENER
            // ====================================================

            api.listenMqtt(
              async (
                listenError,
                event
              ) => {
                if (listenError) {
                  console.error(
                    chalk.red(
                      `[MQTT ERROR] ${userid}`
                    ),
                    listenError
                  );

                  return;
                }

                if (!event) {
                  return;
                }

                try {
                  await handleIncomingEvent(
                    api,
                    userid,
                    event,
                    prefix,
                    enableCommands,
                    admin,
                    blacklist
                  );
                } catch (eventError) {
                  console.error(
                    chalk.red(
                      "[EVENT PROCESS ERROR]"
                    ),
                    eventError
                  );
                }
              }
            );

            if (!settled) {
              settled = true;

              resolve({
                userid,
                name: account.name
              });
            }
          } catch (setupError) {
            console.error(
              chalk.red(
                "[ACCOUNT SETUP ERROR]"
              ),
              setupError
            );

            if (!settled) {
              settled = true;
              reject(setupError);
            }
          }
        }
      );
    } catch (loginError) {
      console.error(
        chalk.red(
          "[LOGIN CALL ERROR]"
        ),
        loginError
      );

      if (!settled) {
        settled = true;
        reject(loginError);
      }
    }
  });
}

// ============================================================
// EVENT HANDLER
// ============================================================

async function handleIncomingEvent(
  api,
  userid,
  event,
  prefix,
  enableCommands,
  admin,
  blacklist
) {
  const threadID =
    event.threadID
      ? String(event.threadID)
      : "";

  const senderID =
    event.senderID
      ? String(event.senderID)
      : "";

  const body =
    typeof event.body === "string"
      ? event.body.trim()
      : "";

  /*
   * Traffic protection only applies when
   * we have a thread and sender.
   */
  if (threadID && senderID) {
    if (
      Traffic.isDuplicate(
        threadID,
        senderID,
        body
      )
    ) {
      return;
    }

    if (
      Traffic.isBursting(
        threadID,
        senderID
      )
    ) {
      console.log(
        chalk.yellow(
          `[TRAFFIC] Suppressed burst in ${threadID}`
        )
      );

      return;
    }
  }

  // ==========================================================
  // DATABASE
  // ==========================================================

  let database =
    readJSON(
      DATABASE_FILE,
      {}
    );

  if (
    !database ||
    typeof database !== "object"
  ) {
    database = {};
  }

  if (
    threadID &&
    !database[threadID]
  ) {
    await createThread(
      threadID,
      api
    );

    database =
      readJSON(
        DATABASE_FILE,
        {}
      );
  }

  // ==========================================================
  // HISTORY / ACCOUNT
  // ==========================================================

  const history =
    readJSON(
      HISTORY_FILE,
      []
    );

  const currentAccount =
    history.find(
      item =>
        String(item.userid) ===
        String(userid)
    );

  const accountBlacklist =
    new Set(
      [
        ...(Array.isArray(
          blacklist
        )
          ? blacklist
          : []),

        ...(Array.isArray(
          currentAccount?.blacklist
        )
          ? currentAccount.blacklist
          : [])
      ]
        .map(String)
    );

  // ==========================================================
  // BLACKLIST
  // ==========================================================

  if (
    senderID &&
    accountBlacklist.has(senderID)
  ) {
    return;
  }

  // ==========================================================
  // EVENT TYPES
  // ==========================================================

  const eventType =
    String(
      event.type || ""
    ).toLowerCase();

  if (
    eventType === "message" ||
    eventType === "message_reply"
  ) {
    await processMessageCommand(
      api,
      userid,
      event,
      body,
      threadID,
      senderID,
      prefix,
      enableCommands,
      admin
    );
  }

  // ==========================================================
  // HANDLE EVENTS
  // ==========================================================

  await processEvents(
    api,
    event,
    enableCommands
  );
}

// ============================================================
// MESSAGE COMMAND PROCESSOR
// ============================================================

async function processMessageCommand(
  api,
  userid,
  event,
  body,
  threadID,
  senderID,
  prefix,
  enableCommands,
  admin
) {
  if (!body) {
    return;
  }

  const text =
    body.trim();

  if (!text) {
    return;
  }

  // ==========================================================
  // PARSE
  // ==========================================================

  const firstSpace =
    text.indexOf(" ");

  let firstWord =
    firstSpace === -1
      ? text
      : text.slice(0, firstSpace);

  let args =
    firstSpace === -1
      ? []
      : text
          .slice(firstSpace + 1)
          .trim()
          .split(/\s+/)
          .filter(Boolean);

  const lowerFirst =
    firstWord.toLowerCase();

  // ==========================================================
  // PREFIX DETECTION
  // ==========================================================

  const configuredPrefix =
    String(prefix || "");

  let commandName = "";
  let hasUsedPrefix = false;

  const matchedCommand =
    aliases(lowerFirst);

  if (matchedCommand) {
    commandName =
      matchedCommand.config.name;
  }

  /*
   * Prefix command:
   * /help
   *
   * Prefixless command:
   * help
   */
  if (
    configuredPrefix &&
    text.startsWith(configuredPrefix)
  ) {
    hasUsedPrefix = true;

    const withoutPrefix =
      text
        .slice(
          configuredPrefix.length
        )
        .trim();

    if (!withoutPrefix) {
      return;
    }

    const space =
      withoutPrefix.indexOf(" ");

    firstWord =
      space === -1
        ? withoutPrefix
        : withoutPrefix.slice(0, space);

    args =
      space === -1
        ? []
        : withoutPrefix
            .slice(space + 1)
            .trim()
            .split(/\s+/)
            .filter(Boolean);

    commandName =
      firstWord.toLowerCase();
  } else {
    /*
     * Prefixless lookup.
     */
    const found =
      aliases(
        lowerFirst
      );

    if (found) {
      commandName =
        found.config.name;
    }
  }

  if (!commandName) {
    return;
  }

  const commandData =
    aliases(commandName);

  if (!commandData) {
    return;
  }

  // ==========================================================
  // PREFIX REQUIREMENT
  // ==========================================================

  if (
    commandData.config.hasPrefix === false
  ) {
    if (hasUsedPrefix) {
      await safeSend(
        api,
        "This command doesn't need a prefix.",
        threadID,
        event.messageID
      );

      return;
    }
  } else if (
    configuredPrefix &&
    !hasUsedPrefix
  ) {
    return;
  }

  // ==========================================================
  // ENABLED COMMANDS
  // ==========================================================

  if (
    Array.isArray(enableCommands) &&
    enableCommands.length
  ) {
    const commandList =
      enableCommands.find(
        item =>
          item &&
          Array.isArray(
            item.commands
          )
      );

    if (
      commandList &&
      !commandList.commands
        .map(String)
        .map(x => x.toLowerCase())
        .includes(
          commandData.config.name
            .toLowerCase()
        )
    ) {
      return;
    }
  }

  // ==========================================================
  // DEV ONLY
  // ==========================================================

  if (commandData.config.dev) {
    const isDev =
      dev
        .map(String)
        .includes(
          String(senderID)
        );

    if (!isDev) {
      return;
    }
  }

  // ==========================================================
  // ROLE / PERMISSION
  // ==========================================================

  const role =
    Number(
      commandData.config.role || 0
    );

  if (role > 0) {
    const isMaster =
      Array.isArray(config.masterKey?.admin) &&
      config.masterKey.admin
        .map(String)
        .includes(
          String(senderID)
        );

    const isAdmin =
      Array.isArray(admin) &&
      admin
        .map(String)
        .includes(
          String(senderID)
        );

    let isThreadAdmin = false;

    if (role >= 2) {
      try {
        const info =
          await api.getThreadInfo(
            threadID
          );

        isThreadAdmin =
          Array.isArray(
            info?.adminIDs
          ) &&
          info.adminIDs
            .some(
              item =>
                String(
                  item.id ||
                  item
                ) ===
                String(senderID)
            );
      } catch (_) {
        isThreadAdmin = false;
      }
    }

    if (
      role >= 3 &&
      !isMaster
    ) {
      return;
    }

    if (
      role === 2 &&
      !isAdmin &&
      !isThreadAdmin &&
      !isMaster
    ) {
      return;
    }

    if (
      role === 1 &&
      !isAdmin &&
      !isMaster
    ) {
      return;
    }
  }

  // ==========================================================
  // COOLDOWN
  // ==========================================================

  const cooldown =
    Number(
      commandData.config.cooldown || 0
    );

  if (cooldown > 0) {
    const key =
      `${senderID}:${commandData.config.name}`;

    const now =
      Date.now();

    const previous =
      Utils.cooldowns.get(key) || 0;

    if (
      now - previous <
      cooldown * 1000
    ) {
      return;
    }

    Utils.cooldowns.set(
      key,
      now
    );
  }

  // ==========================================================
  // COMMAND EXECUTION
  // ==========================================================

  if (
    typeof commandData.run !==
    "function"
  ) {
    return;
  }

  try {
    await commandData.run({
      api,

      event,

      args,

      body,

      threadID,

      messageID:
        event.messageID,

      senderID,

      prefix,

      commands:
        Utils.commands,

      handleEvent:
        Utils.handleEvent,

      account:
        Utils.account.get(userid),

      config,

      safeSend: (
        message,
        targetThreadID = threadID,
        replyID = event.messageID
      ) =>
        safeSend(
          api,
          message,
          targetThreadID,
          replyID
        )
    });
  } catch (commandError) {
    console.error(
      chalk.red(
        `[COMMAND ERROR] ${commandData.config.name}`
      ),
      commandError
    );
  }
}

// ============================================================
// EVENT PROCESSOR
// ============================================================

async function processEvents(
  api,
  event,
  enableCommands
) {
  if (!event) {
    return;
  }

  const enabledEvents =
    Array.isArray(enableCommands)
      ? enableCommands.find(
          item =>
            item &&
            Array.isArray(
              item.handleEvent
            )
        )
      : null;

  for (
    const eventHandler
    of Utils.handleEvent.values()
  ) {
    try {
      const name =
        eventHandler.config?.name;

      if (
        enabledEvents &&
        !enabledEvents.handleEvent
          .map(String)
          .map(x => x.toLowerCase())
          .includes(
            String(name).toLowerCase()
          )
      ) {
        continue;
      }

      if (
        typeof eventHandler.handleEvent !==
        "function"
      ) {
        continue;
      }

      await eventHandler.handleEvent({
        api,
        event,
        safeSend: (
          message,
          threadID = event.threadID,
          messageID = event.messageID
        ) =>
          safeSend(
            api,
            message,
            threadID,
            messageID
          )
      });
    } catch (error) {
      console.error(
        chalk.red(
          `[HANDLE EVENT ERROR]`
        ),
        error.message
      );
    }
  }
}

// ============================================================
// ALIAS LOOKUP
// ============================================================

function aliases(command) {
  const target =
    String(command || "")
      .toLowerCase()
      .trim();

  if (!target) {
    return null;
  }

  for (
    const commandData
    of Utils.commands.values()
  ) {
    const names = [
      commandData.config.name,
      ...(commandData.config.aliases || [])
    ]
      .map(
        x =>
          String(x).toLowerCase()
      );

    if (
      names.includes(target)
    ) {
      return commandData;
    }
  }

  return null;
}

// ============================================================
// CREATE THREAD
// ============================================================

async function createThread(
  threadID,
  api
) {
  if (!threadID) {
    return null;
  }

  let database =
    readJSON(
      DATABASE_FILE,
      {}
    );

  if (
    database[threadID]
  ) {
    return database[threadID];
  }

  try {
    const info =
      await api.getThreadInfo(
        threadID
      );

    const adminIDs =
      Array.isArray(
        info?.adminIDs
      )
        ? info.adminIDs.map(
            item =>
              String(
                item.id ||
                item
              )
          )
        : [];

    database[threadID] = {
      threadID,
      adminIDs,
      createdAt:
        Date.now()
    };

    writeJSON(
      DATABASE_FILE,
      database
    );

    return database[threadID];
  } catch (error) {
    console.error(
      `[THREAD ERROR] ${threadID}`,
      error.message
    );

    return null;
  }
}

// ============================================================
// ADD USER
// ============================================================

function addThisUser(
  userid,
  enableCommands,
  state,
  prefix,
  admin,
  blacklist = []
) {
  const history =
    readJSON(
      HISTORY_FILE,
      []
    );

  const accountData = {
    userid: String(userid),

    prefix:
      typeof prefix === "string"
        ? prefix
        : "",

    admin:
      Array.isArray(admin)
        ? admin.map(String)
        : [],

    blacklist:
      Array.isArray(blacklist)
        ? blacklist.map(String)
        : [],

    enableCommands:
      Array.isArray(enableCommands)
        ? enableCommands
        : [],

    time: 0,

    updatedAt:
      Date.now()
  };

  const index =
    history.findIndex(
      item =>
        String(item.userid) ===
        String(userid)
    );

  if (index >= 0) {
    history[index] = {
      ...history[index],
      ...accountData
    };
  } else {
    history.push(accountData);
  }

  writeJSON(
    HISTORY_FILE,
    history
  );

  const sessionFile =
    path.join(
      SESSION_DIR,
      `${userid}.json`
    );

  writeJSON(
    sessionFile,
    state
  );
}

// ============================================================
// DELETE USER
// ============================================================

function deleteThisUser(userid) {
  const history =
    readJSON(
      HISTORY_FILE,
      []
    );

  const filtered =
    history.filter(
      item =>
        String(item.userid) !==
        String(userid)
    );

  writeJSON(
    HISTORY_FILE,
    filtered
  );

  const sessionFile =
    path.join(
      SESSION_DIR,
      `${userid}.json`
    );

  try {
    if (
      fs.existsSync(sessionFile)
    ) {
      fs.unlinkSync(
        sessionFile
      );
    }
  } catch (error) {
    console.error(
      "[SESSION DELETE ERROR]",
      error.message
    );
  }

  Utils.account.delete(
    String(userid)
  );
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log(
    chalk.cyan(
      "=========================================="
    )
  );

  console.log(
    chalk.cyan(
      "       BOT STARTUP / STABILITY MODE"
    )
  );

  console.log(
    chalk.cyan(
      "=========================================="
    )
  );

  const history =
    readJSON(
      HISTORY_FILE,
      []
    );

  if (
    !Array.isArray(history) ||
    history.length === 0
  ) {
    console.log(
      chalk.yellow(
        "[STARTUP] No saved accounts found."
      )
    );

    return;
  }

  const sessionFiles =
    fs.readdirSync(
      SESSION_DIR
    )
      .filter(
        file =>
          file.endsWith(".json")
      );

  if (
    sessionFiles.length === 0
  ) {
    console.log(
      chalk.yellow(
        "[STARTUP] No session files found."
      )
    );

    return;
  }

  /*
   * Sequential account startup.
   * This avoids logging in every account simultaneously.
   */
  for (
    const file
    of sessionFiles
  ) {
    const userid =
      path.basename(
        file,
        ".json"
      );

    const userData =
      history.find(
        item =>
          String(item.userid) ===
          String(userid)
      );

    if (!userData) {
      console.log(
        chalk.yellow(
          `[STARTUP] No history for ${userid}; keeping session.`
        )
      );

      continue;
    }

    const sessionPath =
      path.join(
        SESSION_DIR,
        file
      );

    const state =
      readJSON(
        sessionPath,
        null
      );

    if (
      !Array.isArray(state) ||
      state.length === 0
    ) {
      console.log(
        chalk.yellow(
          `[STARTUP] Invalid/empty session for ${userid}.`
        )
      );

      continue;
    }

    try {
      console.log(
        chalk.blue(
          `[STARTUP] Connecting ${userid}...`
        )
      );

      await accountLogin(
        state,
        userData.enableCommands,
        userData.prefix,
        userData.admin,
        userData.blacklist
      );

      console.log(
        chalk.green(
          `[STARTUP] ${userid} is online.`
        )
      );

      /*
       * Small gap before another account starts.
       */
      await sleep(2000);
    } catch (error) {
      /*
       * IMPORTANT:
       * Do NOT delete the session here.
       *
       * A temporary network/FCA error should not
       * destroy the saved login state.
       */
      console.error(
        chalk.red(
          `[STARTUP ERROR] ${userid}`
        ),
        error.message
      );

      await sleep(5000);
    }
  }

  console.log(
    chalk.green(
      "[STARTUP] Finished loading saved accounts."
    )
  );
}

// ============================================================
// PROCESS SAFETY
// ============================================================

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(
    chalk.yellow(
      `[SHUTDOWN] ${signal}`
    )
  );

  try {
    if (Traffic.cleanupTimer) {
      clearInterval(
        Traffic.cleanupTimer
      );
    }

    for (
      const [
        userid,
        data
      ]
      of activeLogins.entries()
    ) {
      try {
        if (data.timer) {
          clearInterval(
            data.timer
          );
        }

        if (
          data.api &&
          typeof data.api.logout ===
          "function"
        ) {
          /*
           * Do not force logout.
           *
           * We only stop local timers.
           */
        }
      } catch (_) {}

      Utils.account.delete(
        userid
      );
    }

    activeLogins.clear();

    if (server) {
      await new Promise(resolve => {
        server.close(() => {
          resolve();
        });

        setTimeout(
          resolve,
          5000
        );
      });
    }
  } catch (error) {
    console.error(
      "[SHUTDOWN ERROR]",
      error.message
    );
  }

  process.exit(0);
}

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);

process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);

process.on(
  "uncaughtException",
  error => {
    console.error(
      chalk.red(
        "[UNCAUGHT EXCEPTION]"
      ),
      error
    );

    /*
     * Do not immediately exit for a normal
     * command/event exception.
     *
     * The supervisor (index.js) can handle
     * a genuine process failure if necessary.
     */
  }
);

process.on(
  "unhandledRejection",
  error => {
    console.error(
      chalk.red(
        "[UNHANDLED REJECTION]"
      ),
      error
    );
  }
);

// ============================================================
// START
// ============================================================

main().catch(error => {
  console.error(
    chalk.red(
      "[MAIN ERROR]"
    ),
    error
  );

  /*
   * Let index.js supervisor handle a genuine
   * startup failure instead of silently continuing.
   */
  process.exitCode = 1;
});