"use strict";

const fs = require("fs");
const path = require("path");
const login = require("ws3-fca");
const express = require("express");
const chalk = require("chalk");
const bodyParser = require("body-parser");

const app = express();

const script = path.join(
  __dirname,
  "script"
);

// ============================================================
// CONFIG
// ============================================================

function createConfig() {

  const config = [
    {
      masterKey: {
        admin: [],
        devMode: false,
        database: false,
        restartTime: 15
      },

      fcaOption: {
        forceLogin: true,
        listenEvents: true,
        logLevel: "silent",
        updatePresence: true,
        selfListen: true,

        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",

        online: true,
        autoMarkDelivery: false,
        autoMarkRead: false
      }
    }
  ];

  if (!fs.existsSync("./data")) {
    fs.mkdirSync(
      "./data",
      { recursive: true }
    );
  }

  fs.writeFileSync(
    "./data/config.json",
    JSON.stringify(
      config,
      null,
      2
    )
  );

  return config;
}

// ============================================================
// DATA FOLDERS
// ============================================================

if (!fs.existsSync("./data")) {

  fs.mkdirSync(
    "./data",
    { recursive: true }
  );
}

if (!fs.existsSync("./data/history.json")) {

  fs.writeFileSync(
    "./data/history.json",
    "[]",
    "utf8"
  );
}

if (!fs.existsSync("./data/session")) {

  fs.mkdirSync(
    "./data/session",
    { recursive: true }
  );
}

if (!fs.existsSync("./data/database.json")) {

  fs.writeFileSync(
    "./data/database.json",
    "[]",
    "utf8"
  );
}

// ============================================================
// LOAD CONFIG
// ============================================================

const config =
  fs.existsSync("./data/config.json")
    ? JSON.parse(
        fs.readFileSync(
          "./data/config.json",
          "utf8"
        )
      )
    : createConfig();

const dev =
  fs.existsSync("./dev.json")
    ? JSON.parse(
        fs.readFileSync(
          "./dev.json",
          "utf8"
        )
      )
    : [];

// ============================================================
// UTILS
// ============================================================

const Utils = {
  commands: new Map(),
  handleEvent: new Map(),
  account: new Map(),
  cooldowns: new Map()
};

// ============================================================
// TRAFFIC CONTROL
// ============================================================

const HumanTraffic = {

  users: new Map(),

  duplicates: new Map(),

  threadQueue: new Map(),

  lastReply: new Map(),

  maxBurst: 3,

  burstWindow: 10_000,

  cooldown: 30_000,

  duplicateWindow: 5_000,

  replyInterval: 10_000,

  typingMin: 700,

  typingMax: 1600,

  cleanup() {

    const now =
      Date.now();

    // Burst data
    for (
      const [
        key,
        data
      ] of this.users
    ) {

      if (
        !data ||
        now - data.started >
        this.burstWindow * 2
      ) {

        this.users.delete(key);
      }
    }

    // Duplicate data
    for (
      const [
        key,
        timestamp
      ] of this.duplicates
    ) {

      if (
        now - timestamp >
        this.duplicateWindow
      ) {

        this.duplicates.delete(key);
      }
    }

    // Reply timestamps
    for (
      const [
        threadID,
        timestamp
      ] of this.lastReply
    ) {

      if (
        now - timestamp >
        this.replyInterval * 3
      ) {

        this.lastReply.delete(
          threadID
        );
      }
    }
  },

  isBursting(
    threadID,
    senderID
  ) {

    if (
      !threadID ||
      !senderID
    ) {

      return false;
    }

    const key =
      `${threadID}:${senderID}`;

    const now =
      Date.now();

    let data =
      this.users.get(key);

    if (
      !data ||
      now - data.started >=
      this.burstWindow
    ) {

      data = {
        started: now,
        count: 0,
        blockedUntil: 0
      };
    }

    if (
      now <
      data.blockedUntil
    ) {

      return true;
    }

    data.count++;

    if (
      data.count >
      this.maxBurst
    ) {

      data.blockedUntil =
        now + this.cooldown;

      this.users.set(
        key,
        data
      );

      console.log(
        `[LIMITER] Burst suppressed: ${senderID}`
      );

      return true;
    }

    this.users.set(
      key,
      data
    );

    return false;
  },

  isDuplicate(
    threadID,
    senderID,
    body
  ) {

    if (
      !threadID ||
      !senderID ||
      !body
    ) {

      return false;
    }

    const normalized =
      String(body)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

    if (!normalized) {
      return false;
    }

    const key =
      `${threadID}:${senderID}:${normalized}`;

    const now =
      Date.now();

    const previous =
      this.duplicates.get(key);

    if (
      previous &&
      now - previous <
      this.duplicateWindow
    ) {

      console.log(
        `[TRAFFIC] Duplicate suppressed: ${senderID}`
      );

      return true;
    }

    this.duplicates.set(
      key,
      now
    );

    return false;
  },

  typingDuration() {

    return Math.floor(
      Math.random() *
      (
        this.typingMax -
        this.typingMin +
        1
      )
    ) +
    this.typingMin;
  },

  responseDelay(text = "") {

    const length =
      String(text).length;

    const charsPerSecond =
      260 / 60;

    const typingTime =
      (
        length /
        charsPerSecond
      ) * 1000;

    const variation =
      0.75 +
      Math.random() * 0.65;

    const extra =
      Math.floor(
        Math.random() * 1800
      );

    const delay =
      typingTime *
      variation +
      extra;

    return Math.min(
      Math.max(
        800,
        delay
      ),
      12_000
    );
  },

  async typing(
    api,
    threadID
  ) {

    try {

      if (
        typeof api.sendTypingIndicator ===
        "function"
      ) {

        await api.sendTypingIndicator(
          threadID
        );

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              this.typingDuration()
            )
        );
      }

    } catch (_) {}
  },

  async enqueueSend(
    api,
    message,
    threadID,
    messageID
  ) {

    if (!threadID) {

      return api.sendMessage(
        message,
        threadID,
        messageID
      );
    }

    const previous =
      this.threadQueue.get(
        threadID
      ) ||
      Promise.resolve();

    const current =
      previous
        .catch(() => {})
        .then(async () => {

          // --------------------------------------------------
          // 10 SECOND SPACING
          // --------------------------------------------------

          const now =
            Date.now();

          const last =
            this.lastReply.get(
              threadID
            ) || 0;

          const elapsed =
            now - last;

          if (
            elapsed <
            this.replyInterval
          ) {

            await new Promise(
              resolve =>
                setTimeout(
                  resolve,
                  this.replyInterval -
                  elapsed
                )
            );
          }

          // --------------------------------------------------
          // RESPONSE DELAY
          // --------------------------------------------------

          const responseDelay =
            this.responseDelay(
              message
            );

          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                responseDelay
              )
          );

          // --------------------------------------------------
          // TYPING
          // --------------------------------------------------

          await this.typing(
            api,
            threadID
          );

          // --------------------------------------------------
          // SEND
          // --------------------------------------------------

          const result =
            await api.sendMessage(
              message,
              threadID,
              messageID
            );

          this.lastReply.set(
            threadID,
            Date.now()
          );

          return result;
        });

    this.threadQueue.set(
      threadID,
      current
    );

    try {

      return await current;

    } finally {

      if (
        this.threadQueue.get(
          threadID
        ) === current
      ) {

        this.threadQueue.delete(
          threadID
        );
      }
    }
  }
};

setInterval(
  () => HumanTraffic.cleanup(),
  30_000
);

// ============================================================
// SAFE SEND
// ============================================================

function safeSend(
  api,
  message,
  threadID,
  messageID
) {

  return HumanTraffic.enqueueSend(
    api,
    message,
    threadID,
    messageID
  ).catch(
    error => {

      console.error(
        "[SEND ERROR]",
        error?.message ||
        error
      );
    }
  );
}

// ============================================================
// LOAD COMMANDS
// ============================================================

function loadCommand(
  filePath
) {

  try {

    const module =
      require(filePath);

    if (!module) {
      return;
    }

    const commandConfig =
      module.config || {};

    const run =
      module.run;

    const handleEvent =
      module.handleEvent;

    const normalized =
      Object.fromEntries(
        Object.entries(
          commandConfig
        ).map(
          ([key, value]) =>
            [
              key.toLowerCase(),
              value
            ]
        )
      );

    let {
      name = [],
      role = "0",
      version = "1.0.0",
      hasPrefix = true,
      aliases = [],
      description = "",
      usage = "",
      credits = "",
      cooldown = "5",
      dev = false
    } = normalized;

    if (!Array.isArray(name)) {
      name = [name];
    }

    if (!Array.isArray(aliases)) {
      aliases = [aliases];
    }

    const allAliases = [
      ...new Set([
        ...name,
        ...aliases
      ])
    ]
      .filter(Boolean)
      .map(
        item =>
          String(item)
            .toLowerCase()
      );

    if (run) {

      Utils.commands.set(
        allAliases,
        {
          name:
            name[0] ||
            allAliases[0],

          role,
          run,
          aliases:
            allAliases,

          description,
          usage,
          version,
          hasPrefix,
          credits,
          cooldown,
          dev
        }
      );
    }

    if (handleEvent) {

      Utils.handleEvent.set(
        allAliases,
        {
          name:
            name[0] ||
            allAliases[0],

          handleEvent,
          role,
          description,
          usage,
          version,
          hasPrefix,
          credits,
          cooldown,
          dev
        }
      );
    }

  } catch (error) {

    console.error(
      chalk.red(
        `[COMMAND ERROR] ${filePath}: ${error.message}`
      )
    );
  }
}

if (
  fs.existsSync(script)
) {

  fs.readdirSync(script)
    .forEach(file => {

      const filePath =
        path.join(
          script,
          file
        );

      const stats =
        fs.statSync(
          filePath
        );

      if (
        stats.isDirectory()
      ) {

        fs.readdirSync(
          filePath
        )
        .forEach(subFile => {

          loadCommand(
            path.join(
              filePath,
              subFile
            )
          );
        });

      } else {

        loadCommand(
          filePath
        );
      }
    });
}

// ============================================================
// EXPRESS
// ============================================================

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
  )
);

app.use(
  bodyParser.json()
);

app.use(
  express.json()
);

// ============================================================
// ROUTES
// ============================================================

const routes = [
  {
    path: "/",
    file: "index.html"
  },
  {
    path: "/step_by_step_guide",
    file: "guide.html"
  },
  {
    path: "/online_user",
    file: "online.html"
  }
];

routes.forEach(
  route => {

    app.get(
      route.path,
      (req, res) => {

        const filePath =
          path.join(
            __dirname,
            "public",
            route.file
          );

        if (
          fs.existsSync(filePath)
        ) {

          res.sendFile(
            filePath
          );

        } else {

          res.status(404)
            .send(
              "Page not found."
            );
        }
      }
    );
  }
);

// ============================================================
// INFO
// ============================================================

app.get(
  "/info",
  (req, res) => {

    const data =
      Array.from(
        Utils.account.values()
      ).map(
        account => ({
          name: account.name,
          profileUrl:
            account.profileUrl,
          thumbSrc:
            account.thumbSrc,
          time: account.time
        })
      );

    res.json(data);
  }
);

// ============================================================
// COMMANDS
// ============================================================

app.get(
  "/commands",
  (req, res) => {

    const commands =
      Array.from(
        Utils.commands.values()
      ).map(
        command => command.name
      );

    const handleEvent =
      Array.from(
        Utils.handleEvent.values()
      ).map(
        command => command.name
      );

    res.json({
      commands,
      handleEvent,
      count:
        commands.length +
        handleEvent.length
    });
  }
);

// ============================================================
// LOGIN
// ============================================================

app.post(
  "/login",
  async (req, res) => {

    const {
      state,
      commands,
      prefix,
      admin
    } = req.body;

    try {

      if (
        !Array.isArray(state) ||
        state.length === 0
      ) {

        throw new Error(
          "Missing app state data."
        );
      }

      const cUser =
        state.find(
          item =>
            item.key ===
            "c_user"
        );

      if (!cUser) {

        return res.status(400)
          .json({
            error: true,
            message:
              "Invalid appstate data."
          });
      }

      const existingUser =
        Utils.account.get(
          cUser.value
        );

      if (existingUser) {

        return res.status(400)
          .json({
            error: false,
            message:
              "Active user session detected.",
            user:
              existingUser
          });
      }

      await accountLogin(
        state,
        commands,
        prefix,
        Array.isArray(admin)
          ? admin
          : admin
            ? [admin]
            : []
      );

      res.status(200)
        .json({
          success: true,
          message:
            "Authentication process completed."
        });

    } catch (error) {

      console.error(
        "[LOGIN ERROR]",
        error
      );

      res.status(400)
        .json({
          error: true,
          message:
            error.message ||
            "Authentication failed."
        });
    }
  }
);

// ============================================================
// SERVER
// ============================================================

const PORT =
  process.env.PORT ||
  3000;

app.listen(
  PORT,
  () => {

    console.log(
      `Server is running on port ${PORT}`
    );
  }
);

// ============================================================
// UNHANDLED REJECTION
// ============================================================

process.on(
  "unhandledRejection",
  reason => {

    console.error(
      "[UNHANDLED REJECTION]",
      reason
    );
  }
);

// ============================================================
// ACCOUNT LOGIN
// ============================================================

async function accountLogin(
  state,
  enableCommands = [],
  prefix = "",
  admin = []
) {

  enableCommands = [
    {
      commands:
        Array.from(
          Utils.commands.values()
        ).map(
          command =>
            command.name
        )
    },

    {
      handleEvent:
        Array.from(
          Utils.handleEvent.values()
        ).map(
          command =>
            command.name
        )
    }
  ];

  return new Promise(
    (resolve, reject) => {

      login(
        {
          appState: state
        },

        async (
          error,
          api
        ) => {

          if (error) {

            reject(error);

            return;
          }

          try {

            const userid =
              await api.getCurrentUserID();

            // ------------------------------------------------
            // ACCOUNT
            // ------------------------------------------------

            await addThisUser(
              userid,
              enableCommands,
              state,
              prefix,
              admin
            );

            // ------------------------------------------------
            // ACCOUNT INFORMATION
            // ------------------------------------------------

            const userInfo =
              await api.getUserInfo(
                userid
              );

            if (
              !userInfo ||
              !userInfo[userid]
            ) {

              throw new Error(
                "Unable to retrieve account information."
              );
            }

            const {
              name = "Unknown",
              profileUrl = "",
              thumbSrc = ""
            } =
              userInfo[userid];

            let history =
              JSON.parse(
                fs.readFileSync(
                  "./data/history.json",
                  "utf8"
                )
              );

            const oldAccount =
              history.find(
                user =>
                  user.userid ===
                  userid
              ) || {};

            Utils.account.set(
              userid,
              {
                name,
                profileUrl,
                thumbSrc,
                time:
                  oldAccount.time ||
                  0
              }
            );

            const intervalId =
              setInterval(
                () => {

                  const account =
                    Utils.account.get(
                      userid
                    );

                  if (!account) {

                    clearInterval(
                      intervalId
                    );

                    return;
                  }

                  account.time++;

                  Utils.account.set(
                    userid,
                    account
                  );

                },
                1000
              );

            // ------------------------------------------------
            // FCA OPTIONS
            // ------------------------------------------------

            api.setOptions({

              listenEvents:
                config?.[0]?.fcaOption
                  ?.listenEvents,

              logLevel:
                config?.[0]?.fcaOption
                  ?.logLevel,

              updatePresence:
                config?.[0]?.fcaOption
                  ?.updatePresence,

              selfListen:
                config?.[0]?.fcaOption
                  ?.selfListen,

              forceLogin:
                config?.[0]?.fcaOption
                  ?.forceLogin,

              online:
                config?.[0]?.fcaOption
                  ?.online,

              autoMarkDelivery:
                config?.[0]?.fcaOption
                  ?.autoMarkDelivery,

              autoMarkRead:
                config?.[0]?.fcaOption
                  ?.autoMarkRead
            });

            // ------------------------------------------------
            // LISTEN MQTT
            // ------------------------------------------------

            api.listenMqtt(
              async (
                listenError,
                event
              ) => {

                if (listenError) {

                  console.error(
                    "[MQTT]",
                    listenError
                  );

                  return;
                }

                if (!event) {
                  return;
                }

                // ------------------------------------------------
                // TRAFFIC GOVERNOR
                // ------------------------------------------------

                if (
                  event.threadID &&
                  event.senderID
                ) {

                  const body =
                    typeof event.body ===
                    "string"
                      ? event.body.trim()
                      : "";

                  // Duplicate
                  if (
                    body &&
                    HumanTraffic.isDuplicate(
                      event.threadID,
                      event.senderID,
                      body
                    )
                  ) {

                    return;
                  }

                  // Burst
                  if (
                    HumanTraffic.isBursting(
                      event.threadID,
                      event.senderID
                    )
                  ) {

                    return;
                  }
                }

                // ------------------------------------------------
                // DATABASE
                // ------------------------------------------------

                let database =
                  fs.existsSync(
                    "./data/database.json"
                  )
                    ? JSON.parse(
                        fs.readFileSync(
                          "./data/database.json",
                          "utf8"
                        )
                      )
                    : [];

                let threadData =
                  Array.isArray(database)
                    ? database.find(
                        item =>
                          Object.prototype.hasOwnProperty.call(
                            item,
                            event.threadID
                          )
                      )
                    : null;

                if (
                  !threadData &&
                  event.threadID
                ) {

                  database =
                    await createThread(
                      event.threadID,
                      api
                    );

                  threadData =
                    database.find(
                      item =>
                        Object.prototype.hasOwnProperty.call(
                          item,
                          event.threadID
                        )
                    );
                }

                // ------------------------------------------------
                // BLACKLIST
                // ------------------------------------------------

                const history =
                  JSON.parse(
                    fs.readFileSync(
                      "./data/history.json",
                      "utf8"
                    )
                  );

                const accountHistory =
                  history.find(
                    user =>
                      user.userid ===
                      userid
                  ) || {};

                const blacklist =
                  Array.isArray(
                    accountHistory.blacklist
                  )
                    ? accountHistory.blacklist
                    : [];

                // ------------------------------------------------
                // PARSE COMMAND
                // ------------------------------------------------

                const body =
                  typeof event.body ===
                  "string"
                    ? event.body.trim()
                    : "";

                const firstWord =
                  body
                    .toLowerCase()
                    .split(/\s+/)
                    .shift();

                const commandInfo =
                  aliases(firstWord);

                let hasPrefix =
                  commandInfo?.hasPrefix === false
                    ? ""
                    : prefix;

                let command = "";
                let args = [];

                if (
                  hasPrefix &&
                  body
                    .toLowerCase()
                    .startsWith(
                      String(
                        hasPrefix
                      ).toLowerCase()
                    )
                ) {

                  const parsed =
                    body
                      .substring(
                        String(
                          hasPrefix
                        ).length
                      )
                      .trim()
                      .split(/\s+/)
                      .filter(Boolean);

                  command =
                    (
                      parsed.shift() ||
                      ""
                    ).toLowerCase();

                  args = parsed;
                }

                if (
                  !hasPrefix &&
                  commandInfo
                ) {

                  const parsed =
                    body
                      .trim()
                      .split(/\s+/)
                      .filter(Boolean);

                  command =
                    (
                      parsed.shift() ||
                      ""
                    ).toLowerCase();

                  args = parsed;
                }

                // ------------------------------------------------
                // PREFIX VALIDATION
                // ------------------------------------------------

                if (
                  commandInfo &&
                  commandInfo.hasPrefix === false &&
                  body
                    .toLowerCase()
                    .startsWith(
                      String(prefix)
                        .toLowerCase()
                    )
                ) {

                  await safeSend(
                    api,
                    "This command doesn't need a prefix.",
                    event.threadID,
                    event.messageID
                  );

                  return;
                }

                // ------------------------------------------------
                // COMMAND
                // ------------------------------------------------

                const commandData =
                  aliases(command);

                if (
                  body &&
                  body
                    .toLowerCase()
                    .startsWith(
                      String(prefix)
                        .toLowerCase()
                    ) &&
                  command &&
                  !commandData
                ) {

                  await safeSend(
                    api,
                    `Invalid command '${command}'. Please use ${prefix}help to see the available commands.`,
                    event.threadID,
                    event.messageID
                  );

                  return;
                }

                // ------------------------------------------------
                // DEV
                // ------------------------------------------------

                if (
                  commandData?.dev
                ) {

                  if (
                    !dev.includes(
                      event.senderID
                    )
                  ) {

                    await safeSend(
                      api,
                      "You don't have access to this command.",
                      event.threadID,
                      event.messageID
                    );

                    return;
                  }
                }

                // ------------------------------------------------
                // ROLE
                // ------------------------------------------------

                if (commandData) {

                  const role =
                    commandData.role ??
                    0;

                  const isMasterAdmin =
                    Array.isArray(
                      config?.[0]
                        ?.masterKey
                        ?.admin
                    ) &&
                    config[0]
                      .masterKey
                      .admin
                      .includes(
                        event.senderID
                      );

                  const isAdmin =
                    isMasterAdmin ||
                    admin.includes(
                      event.senderID
                    );

                  const threadAdmins =
                    threadData &&
                    Array.isArray(
                      threadData[
                        event.threadID
                      ]
                    )
                      ? threadData[
                          event.threadID
                        ]
                      : [];

                  const isThreadAdmin =
                    isAdmin ||
                    threadAdmins.some(
                      item =>
                        item?.id ===
                        event.senderID
                    );

                  if (
                    role == 1 &&
                    !isAdmin
                  ) {

                    await safeSend(
                      api,
                      "You don't have permission to use this command.",
                      event.threadID,
                      event.messageID
                    );

                    return;
                  }

                  if (
                    role == 2 &&
                    !isThreadAdmin
                  ) {

                    await safeSend(
                      api,
                      "You don't have permission to use this command.",
                      event.threadID,
                      event.messageID
                    );

                    return;
                  }

                  if (
                    role == 3 &&
                    !isMasterAdmin
                  ) {

                    await safeSend(
                      api,
                      "You don't have permission to use this command.",
                      event.threadID,
                      event.messageID
                    );

                    return;
                  }
                }

                // ------------------------------------------------
                // BLACKLIST
                // ------------------------------------------------

                if (
                  commandData &&
                  blacklist.includes(
                    event.senderID
                  )
                ) {

                  return;
                }

                // ------------------------------------------------
                // COMMAND COOLDOWN
                // ------------------------------------------------

                if (
                  commandData
                ) {

                  const now =
                    Date.now();

                  const commandName =
                    commandData.name;

                  const cooldownKey =
                    `${event.senderID}_${commandName}_${userid}`;

                  const previous =
                    Utils.cooldowns.get(
                      cooldownKey
                    );

                  const cooldown =
                    Number(
                      commandData.cooldown
                    ) || 0;

                  if (
                    previous &&
                    now -
                    previous.timestamp <
                    cooldown * 1000
                  ) {

                    const remaining =
                      Math.ceil(
                        (
                          previous.timestamp +
                          cooldown * 1000 -
                          now
                        ) / 1000
                      );

                    await safeSend(
                      api,
                      `Please wait ${remaining} seconds before using "${commandName}" again.`,
                      event.threadID,
                      event.messageID
                    );

                    return;
                  }

                  Utils.cooldowns.set(
                    cooldownKey,
                    {
                      timestamp: now,
                      command:
                        commandName
                    }
                  );
                }

                // ------------------------------------------------
                // HANDLE EVENTS
                // ------------------------------------------------

                for (
                  const commandEvent
                  of Utils.handleEvent.values()
                ) {

                  if (
                    typeof commandEvent
                      .handleEvent !==
                    "function"
                  ) {
                    continue;
                  }

                  try {

                    await commandEvent
                      .handleEvent({
                        api,
                        event,
                        enableCommands,
                        admin,
                        prefix,
                        blacklist,
                        Utils
                      });

                  } catch (error) {

                    console.error(
                      `[EVENT ERROR] ${commandEvent.name}`,
                      error
                    );
                  }
                }

                // ------------------------------------------------
                // COMMAND RUNNER
                // ------------------------------------------------

                if (
                  !commandData ||
                  typeof commandData.run !==
                  "function"
                ) {
                  return;
                }

                const supportedTypes = [
                  "message",
                  "message_reply",
                  "message_unsend",
                  "message_reaction"
                ];

                if (
                  !supportedTypes.includes(
                    event.type
                  )
                ) {
                  return;
                }

                try {

                  await commandData.run({
                    api,
                    event,
                    args,
                    enableCommands,
                    admin,
                    prefix,
                    blacklist,
                    Utils
                  });

                } catch (error) {

                  console.error(
                    `[COMMAND ERROR] ${commandData.name}`,
                    error
                  );
                }
              }
            );

            resolve();

          } catch (error) {

            reject(error);
          }
        }
      );
    }
  );
}

// ============================================================
// DELETE USER
// ============================================================

async function deleteThisUser(
  userid
) {

  const configFile =
    "./data/history.json";

  let history =
    JSON.parse(
      fs.readFileSync(
        configFile,
        "utf8"
      )
    );

  const sessionFile =
    path.join(
      "./data/session",
      `${userid}.json`
    );

  const index =
    history.findIndex(
      item =>
        item.userid ===
        userid
    );

  if (index !== -1) {

    history.splice(
      index,
      1
    );
  }

  fs.writeFileSync(
    configFile,
    JSON.stringify(
      history,
      null,
      2
    )
  );

  try {

    if (
      fs.existsSync(
        sessionFile
      )
    ) {

      fs.unlinkSync(
        sessionFile
      );
    }

  } catch (error) {

    console.log(
      error.message
    );
  }
}

// ============================================================
// ADD USER
// ============================================================

async function addThisUser(
  userid,
  enableCommands,
  state,
  prefix,
  admin,
  blacklist = []
) {

  const configFile =
    "./data/history.json";

  const sessionFolder =
    "./data/session";

  const sessionFile =
    path.join(
      sessionFolder,
      `${userid}.json`
    );

  let history =
    JSON.parse(
      fs.readFileSync(
        configFile,
        "utf8"
      )
    );

  const existingIndex =
    history.findIndex(
      item =>
        item.userid ===
        userid
    );

  const accountData = {

    userid,

    prefix:
      prefix || "",

    admin:
      Array.isArray(admin)
        ? admin
        : [],

    blacklist:
      Array.isArray(blacklist)
        ? blacklist
        : [],

    enableCommands,

    time:
      existingIndex !== -1
        ? history[existingIndex].time || 0
        : 0
  };

  if (
    existingIndex !== -1
  ) {

    history[
      existingIndex
    ] = {
      ...history[
        existingIndex
      ],
      ...accountData
    };

  } else {

    history.push(
      accountData
    );
  }

  fs.writeFileSync(
    configFile,
    JSON.stringify(
      history,
      null,
      2
    )
  );

  fs.writeFileSync(
    sessionFile,
    JSON.stringify(
      state
    )
  );
}

// ============================================================
// ALIASES
// ============================================================

function aliases(
  command
) {

  if (!command) {
    return null;
  }

  const normalized =
    String(command)
      .toLowerCase();

  for (
    const [
      names,
      data
    ] of Utils.commands
  ) {

    if (
      names.some(
        name =>
          String(name)
            .toLowerCase() ===
          normalized
      )
    ) {

      return data;
    }
  }

  for (
    const [
      names,
      data
    ] of Utils.handleEvent
  ) {

    if (
      names.some(
        name =>
          String(name)
            .toLowerCase() ===
          normalized
      )
    ) {

      return data;
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

  try {

    const database =
      fs.existsSync(
        "./data/database.json"
      )
        ? JSON.parse(
            fs.readFileSync(
              "./data/database.json",
              "utf8"
            )
          )
        : [];

    const existing =
      database.find(
        item =>
          Object.prototype.hasOwnProperty.call(
            item,
            threadID
          )
      );

    if (existing) {
      return database;
    }

    const threadInfo =
      await api.getThreadInfo(
        threadID
      );

    const adminIDs =
      Array.isArray(
        threadInfo?.adminIDs
      )
        ? threadInfo.adminIDs
        : [];

    const data = {};

    data[threadID] =
      adminIDs;

    database.push(
      data
    );

    fs.writeFileSync(
      "./data/database.json",
      JSON.stringify(
        database,
        null,
        2
      ),
      "utf8"
    );

    return database;

  } catch (error) {

    console.error(
      "[THREAD ERROR]",
      error.message
    );

    return [];
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {

  const cacheFolder =
    path.join(
      script,
      "cache"
    );

  if (
    !fs.existsSync(
      cacheFolder
    )
  ) {

    fs.mkdirSync(
      cacheFolder,
      {
        recursive: true
      }
    );
  }

  const historyFile =
    "./data/history.json";

  const sessionFolder =
    "./data/session";

  const history =
    JSON.parse(
      fs.readFileSync(
        historyFile,
        "utf8"
      )
    );

  if (
    !fs.existsSync(
      sessionFolder
    )
  ) {

    fs.mkdirSync(
      sessionFolder,
      {
        recursive: true
      }
    );
  }

  for (
    const file
    of fs.readdirSync(
      sessionFolder
    )
  ) {

    if (
      !file.endsWith(".json")
    ) {
      continue;
    }

    const userid =
      path.parse(
        file
      ).name;

    const userData =
      history.find(
        item =>
          item.userid ===
          userid
      );

    if (!userData) {

      console.log(
        `[SESSION] No history found for ${userid}.`
      );

      continue;
    }

    try {

      const state =
        JSON.parse(
          fs.readFileSync(
            path.join(
              sessionFolder,
              file
            ),
            "utf8"
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
        `[SESSION] Loaded account ${userid}.`
      );

    } catch (error) {

      console.error(
        `[SESSION] Failed to load ${userid}:`,
        error.message
      );

      // Keep session file.
      // A temporary connection error should
      // not automatically delete the session.
    }
  }
}

// ============================================================
// START
// ============================================================

main().catch(
  error => {

    console.error(
      "[MAIN ERROR]",
      error
    );

    process.exit(1);
  }
);
