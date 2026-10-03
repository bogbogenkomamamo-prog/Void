const fs = require('fs');
const path = require('path');
const login = require('ws3-fca');
const express = require('express');
const app = express();
const chalk = require('chalk');
const bodyParser = require('body-parser');
const script = path.join(__dirname, 'script');
const cron = require('node-cron');

const config =
  fs.existsSync('./data') &&
  fs.existsSync('./data/config.json')
    ? JSON.parse(fs.readFileSync('./data/config.json', 'utf8'))
    : createConfig();

const dev = JSON.parse(fs.readFileSync('./dev.json'));

const Utils = new Object({
  commands: new Map(),
  handleEvent: new Map(),
  account: new Map(),
  cooldowns: new Map(),
});


// ============================================================
// HUMAN-LIKE TRAFFIC CONTROL
// Add-on only
// ============================================================

const HumanTraffic = {

  users: new Map(),
  duplicates: new Map(),
  threadBusy: new Map(),

  // Maximum messages from one sender inside the window
  maxBurst: 3,
  burstWindow: 10000,

  // Same message suppression
  duplicateWindow: 3500,

  // Reply delay range
  minDelay: 1200,
  maxDelay: 3200,

  cleanup() {

    const now = Date.now();

    for (const [key, data] of this.users) {

      if (
        !data ||
        now - data.started > this.burstWindow * 2
      ) {
        this.users.delete(key);
      }

    }

    for (const [key, time] of this.duplicates) {

      if (
        now - time > this.duplicateWindow
      ) {
        this.duplicates.delete(key);
      }

    }

  },

  randomDelay() {

    return Math.floor(
      Math.random() *
      (this.maxDelay - this.minDelay + 1)
    ) + this.minDelay;

  },

  isBursting(threadID, senderID) {

    const key = `${threadID}:${senderID}`;
    const now = Date.now();

    let data = this.users.get(key);

    if (
      !data ||
      now - data.started >= this.burstWindow
    ) {

      data = {
        started: now,
        count: 0
      };

    }

    data.count++;

    this.users.set(key, data);

    return data.count > this.maxBurst;

  },

  isDuplicate(threadID, senderID, body) {

    if (!body) {
      return false;
    }

    const normalized = String(body)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');

    const key =
      `${threadID}:${senderID}:${normalized}`;

    const now = Date.now();

    const previous =
      this.duplicates.get(key);

    if (
      previous &&
      now - previous < this.duplicateWindow
    ) {

      return true;

    }

    this.duplicates.set(key, now);

    return false;

  },

  async wait(threadID) {

    const previous =
      this.threadBusy.get(threadID) ||
      Promise.resolve();

    const current = previous
      .catch(() => {})
      .then(() => {

        return new Promise(resolve => {

          setTimeout(
            resolve,
            this.randomDelay()
          );

        });

      });

    this.threadBusy.set(
      threadID,
      current
    );

    try {

      await current;

    } finally {

      if (
        this.threadBusy.get(threadID) === current
      ) {

        this.threadBusy.delete(threadID);

      }

    }

  },

  async typing(api, threadID, duration) {

    try {

      if (
        typeof api.sendTypingIndicator ===
        'function'
      ) {

        await api.sendTypingIndicator(
          threadID
        );

        await new Promise(resolve =>
          setTimeout(
            resolve,
            duration
          )
        );

      }

    } catch (_) {

      // Typing indicator failure
      // must never stop the bot.

    }

  }

};


// Cleanup traffic data
setInterval(() => {

  HumanTraffic.cleanup();

}, 30000);


// ============================================================
// DATA FOLDERS
// ============================================================

if (!fs.existsSync('./data'))
  fs.mkdirSync('./data', {
    recursive: true
  });

if (!fs.existsSync('./data/history.json'))
  fs.writeFileSync(
    './data/history.json',
    '[]',
    'utf-8'
  );

if (!fs.existsSync('./data/session'))
  fs.mkdirSync('./data/session', {
    recursive: true
  });

if (!fs.existsSync('./data/database.json'))
  fs.writeFileSync(
    './data/database.json',
    '[]',
    'utf-8'
  );


// ============================================================
// LOAD COMMANDS
// ============================================================

fs.readdirSync(script).forEach((file) => {

  const scripts = path.join(
    script,
    file
  );

  const stats = fs.statSync(
    scripts
  );

  if (stats.isDirectory()) {

    fs.readdirSync(scripts).forEach((file) => {

      try {

        const {
          config,
          run,
          handleEvent
        } = require(
          path.join(scripts, file)
        );

        if (config) {

          const {
            name = [],
            role = '0',
            version = '1.0.0',
            hasPrefix = true,
            aliases = [],
            description = '',
            usage = '',
            credits = '',
            cooldown = '5',
            dev = false
          } = Object.fromEntries(
            Object.entries(config).map(
              ([key, value]) => [
                key.toLowerCase(),
                value
              ]
            )
          );

          aliases.push(name);

          if (run) {

            Utils.commands.set(
              aliases,
              {
                name,
                role,
                run,
                aliases,
                description,
                usage,
                version,
                hasPrefix: config.hasPrefix,
                credits,
                cooldown,
                dev
              }
            );

          }

          if (handleEvent) {

            Utils.handleEvent.set(
              aliases,
              {
                name,
                handleEvent,
                role,
                description,
                usage,
                version,
                hasPrefix: config.hasPrefix,
                credits,
                cooldown,
                dev
              }
            );

          }

        }

      } catch (error) {

        console.error(
          chalk.red(
            `Error installing command from file ${file}: ${error.message}`
          )
        );

      }

    });

  } else {

    try {

      const {
        config,
        run,
        handleEvent
      } = require(scripts);

      if (config) {

        const {
          name = [],
          role = '0',
          version = '1.0.0',
          hasPrefix = true,
          aliases = [],
          description = '',
          usage = '',
          credits = '',
          cooldown = '5',
          dev = false
        } = Object.fromEntries(
          Object.entries(config).map(
            ([key, value]) => [
              key.toLowerCase(),
              value
            ]
          )
        );

        aliases.push(name);

        if (run) {

          Utils.commands.set(
            aliases,
            {
              name,
              role,
              run,
              aliases,
              description,
              usage,
              version,
              hasPrefix: config.hasPrefix,
              credits,
              cooldown,
              dev
            }
          );

        }

        if (handleEvent) {

          Utils.handleEvent.set(
            aliases,
            {
              name,
              handleEvent,
              role,
              description,
              usage,
              version,
              hasPrefix: config.hasPrefix,
              credits,
              cooldown,
              dev
            }
          );

        }

      }

    } catch (error) {

      console.error(
        chalk.red(
          `Error installing command from file ${file}: ${error.message}`
        )
      );

    }

  }

});


// ============================================================
// EXPRESS
// ============================================================

app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);

app.use(
  bodyParser.json()
);

app.use(
  express.json()
);


const routes = [

  {
    path: '/',
    file: 'index.html'
  },

  {
    path: '/step_by_step_guide',
    file: 'guide.html'
  },

  {
    path: '/online_user',
    file: 'online.html'
  },

];


routes.forEach(route => {

  app.get(
    route.path,
    (req, res) => {

      res.sendFile(
        path.join(
          __dirname,
          'public',
          route.file
        )
      );

    }
  );

});


app.get('/info', (req, res) => {

  const data =
    Array.from(
      Utils.account.values()
    ).map(account => ({

      name: account.name,
      profileUrl: account.profileUrl,
      thumbSrc: account.thumbSrc,
      time: account.time

    }));

  res.json(
    JSON.parse(
      JSON.stringify(
        data,
        null,
        2
      )
    )
  );

});


app.get('/commands', (req, res) => {

  const command = new Set();

  const commands =
    [...Utils.commands.values()]
      .map(({ name }) =>
        (
          command.add(name),
          name
        )
      );

  const handleEvent =
    [...Utils.handleEvent.values()]
      .map(({ name }) =>
        command.has(name)
          ? null
          : (
              command.add(name),
              name
            )
      )
      .filter(Boolean);

  const role =
    [...Utils.commands.values()]
      .map(({ role }) =>
        (
          command.add(role),
          role
        )
      );

  const aliases =
    [...Utils.commands.values()]
      .map(({ aliases }) =>
        (
          command.add(aliases),
          aliases
        )
      );

  res.json(
    JSON.parse(
      JSON.stringify(
        {
          commands,
          handleEvent,
          role,
          aliases
        },
        null,
        2
      )
    )
  );

});


app.post('/login', async (req, res) => {

  const {
    state,
    commands,
    prefix,
    admin
  } = req.body;

  try {

    if (!state) {

      throw new Error(
        'Missing app state data'
      );

    }

    const cUser =
      state.find(
        item => item.key === 'c_user'
      );

    if (cUser) {

      const existingUser =
        Utils.account.get(
          cUser.value
        );

      if (existingUser) {

        console.log(
          `User ${cUser.value} is already logged in`
        );

        return res.status(400).json({

          error: false,

          message:
            "Active user session detected; already logged in",

          user: existingUser

        });

      } else {

        try {

          await accountLogin(
            state,
            commands,
            prefix,
            [admin]
          );

          res.status(200).json({

            success: true,

            message:
              'Authentication process completed successfully; login achieved.'

          });

        } catch (error) {

          console.error(error);

          res.status(400).json({

            error: true,
            message: error.message

          });

        }

      }

    } else {

      return res.status(400).json({

        error: true,

        message:
          "There's an issue with the appstate data; it's invalid."

      });

    }

  } catch (error) {

    return res.status(400).json({

      error: true,

      message:
        "There's an issue with the appstate data; it's invalid."

    });

  }

});


app.listen(3000, () => {

  console.log(
    `Server is running at http://localhost:5000`
  );

});


process.on(
  'unhandledRejection',
  (reason) => {

    console.error(
      'Unhandled Promise Rejection:',
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
  prefix,
  admin = []
) {

  enableCommands = [

    {
      commands:
        Array.from(
          Utils.commands.values()
        ).map(c => c.name)
    },

    {
      handleEvent:
        Array.from(
          Utils.handleEvent.values()
        ).map(c => c.name)
    }

  ];

  return new Promise(
    (resolve, reject) => {

      login(
        {
          appState: state
        },

        async (error, api) => {

          if (error) {

            reject(error);
            return;

          }

          const userid =
            await api.getCurrentUserID();

          addThisUser(
            userid,
            enableCommands,
            state,
            prefix,
            admin
          );


          // ==================================================
          // TRAFFIC CONTROL SEND WRAPPER
          // ==================================================

          const originalSendMessage =
            api.sendMessage.bind(api);

          api.sendMessage = async function(
            message,
            threadID,
            messageID,
            ...rest
          ) {

            if (!threadID) {

              return originalSendMessage(
                message,
                threadID,
                messageID,
                ...rest
              );

            }

            try {

              await HumanTraffic.wait(
                threadID
              );

              await HumanTraffic.typing(
                api,
                threadID,
                Math.floor(
                  Math.random() * 900
                ) + 600
              );

            } catch (_) {}

            return originalSendMessage(
              message,
              threadID,
              messageID,
              ...rest
            );

          };


          // ==================================================
          // ACCOUNT INFORMATION
          // ==================================================

          try {

            const userInfo =
              await api.getUserInfo(
                userid
              );

            if (
              !userInfo ||
              !userInfo[userid]?.name ||
              !userInfo[userid]?.profileUrl ||
              !userInfo[userid]?.thumbSrc
            ) {

              throw new Error(
                'Unable to locate the account; it appears to be in a suspended or locked state.'
              );

            }

            const {
              name,
              profileUrl,
              thumbSrc
            } = userInfo[userid];

            let time =
              (
                JSON.parse(
                  fs.readFileSync(
                    './data/history.json',
                    'utf-8'
                  )
                )
                .find(
                  user =>
                    user.userid === userid
                ) || {}
              ).time || 0;


            Utils.account.set(
              userid,
              {
                name,
                profileUrl,
                thumbSrc,
                time
              }
            );


            const intervalId =
              setInterval(() => {

                try {

                  const account =
                    Utils.account.get(
                      userid
                    );

                  if (!account) {

                    throw new Error(
                      'Account not found'
                    );

                  }

                  Utils.account.set(
                    userid,
                    {
                      ...account,
                      time:
                        account.time + 1
                    }
                  );

                } catch (error) {

                  clearInterval(
                    intervalId
                  );

                  return;

                }

              }, 1000);


          } catch (error) {

            reject(error);
            return;

          }


          // ==================================================
          // FCA OPTIONS
          // ==================================================

          api.setOptions({

            listenEvents:
              config[0].fcaOption.listenEvents,

            logLevel:
              config[0].fcaOption.logLevel,

            updatePresence:
              config[0].fcaOption.updatePresence,

            selfListen:
              config[0].fcaOption.selfListen,

            forceLogin:
              config[0].fcaOption.forceLogin,

            online:
              config[0].fcaOption.online,

            autoMarkDelivery:
              config[0].fcaOption.autoMarkDelivery,

            autoMarkRead:
              config[0].fcaOption.autoMarkRead,

          });


          // ==================================================
          // LISTEN MQTT
          // ==================================================

          try {

            var listenEmitter =
              api.listenMqtt(
                async (error, event) => {

                  if (error) {

                    if (
                      error ===
                      'Connection closed.'
                    ) {

                      console.error(
                        `Error during API listen: ${error}`,
                        userid
                      );

                    }

                    console.log(error);

                  }


                  // ==========================================
                  // TRAFFIC GOVERNOR
                  // ==========================================

                  if (
                    event &&
                    event.threadID &&
                    event.senderID
                  ) {

                    const body =
                      typeof event.body ===
                      'string'
                        ? event.body.trim()
                        : '';


                    // Duplicate message suppression
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


                    // Burst traffic suppression
                    if (
                      HumanTraffic.isBursting(
                        event.threadID,
                        event.senderID
                      )
                    ) {

                      return;

                    }

                  }


                  // ==========================================
                  // ORIGINAL DATABASE LOGIC
                  // ==========================================

                  let database =
                    fs.existsSync(
                      './data/database.json'
                    )
                      ? JSON.parse(
                          fs.readFileSync(
                            './data/database.json',
                            'utf8'
                          )
                        )
                      : createDatabase();


                  let data =
                    Array.isArray(database)
                      ? database.find(
                          item =>
                            Object.keys(item)[0] ===
                            event?.threadID
                        )
                      : {};


                  let adminIDS =
                    data
                      ? database
                      : createThread(
                          event.threadID,
                          api
                        );


                  let blacklist =
                    (
                      JSON.parse(
                        fs.readFileSync(
                          './data/history.json',
                          'utf-8'
                        )
                      )
                      .find(
                        blacklist =>
                          blacklist.userid ===
                          userid
                      ) || {}
                    ).blacklist || [];


                  let hasPrefix =
                    (
                      event.body &&
                      aliases(
                        (
                          event.body || ''
                        )
                        ?.trim()
                        .toLowerCase()
                        .split(/ +/)
                        .shift()
                      )?.hasPrefix == false
                    )
                      ? ''
                      : prefix;


                  let [
                    command,
                    ...args
                  ] =
                    (
                      (event.body || '')
                        .trim()
                        .toLowerCase()
                        .startsWith(
                          hasPrefix?.toLowerCase()
                        )
                    )
                      ? (
                          (event.body || '')
                            .trim()
                            .substring(
                              hasPrefix?.length
                            )
                            .trim()
                            .split(/\s+/)
                            .map(
                              arg => arg.trim()
                            )
                        )
                      : [];


                  if (
                    hasPrefix &&
                    aliases(command)
                      ?.hasPrefix === false
                  ) {

                    api.sendMessage(
                      `Invalid usage this command doesn't need a prefix`,
                      event.threadID,
                      event.messageID
                    );

                    return;

                  }


                  // ==========================================
                  // DEV ONLY
                  // ==========================================

                  if (
                    event.body &&
                    aliases(command)?.name
                  ) {

                    const isDevOnly =
                      aliases(command)?.dev;

                    if (isDevOnly) {

                      if (
                        !dev.includes(
                          event.senderID
                        )
                      ) {

                        return api.sendMessage(
                          "You dont have access to this command, you need to be a developer.",
                          event.threadID,
                          event.messageID
                        );

                      }

                    }


                    // ========================================
                    // ROLE
                    // ========================================

                    const role =
                      aliases(command)?.role ??
                      0;


                    const isAdmin =
                      config?.[0]?.masterKey?.admin
                        ?.includes(
                          event.senderID
                        ) ||
                      admin.includes(
                        event.senderID
                      );


                    const isThreadAdmin =
                      isAdmin ||
                      (
                        (
                          Array.isArray(adminIDS)
                            ? adminIDS.find(
                                admin =>
                                  Object.keys(admin)[0] ===
                                  event.threadID
                              )
                            : {}
                        )
                        ?.[event.threadID] ||
                        []
                      )
                      .some(
                        admin =>
                          admin.id ===
                          event.senderID
                      );


                    if (
                      (
                        role == 1 &&
                        !isAdmin
                      ) ||
                      (
                        role == 2 &&
                        !isThreadAdmin
                      ) ||
                      (
                        role == 3 &&
                        !config?.[0]?.masterKey?.admin
                          ?.includes(
                            event.senderID
                          )
                      )
                    ) {

                      api.sendMessage(
                        `You don't have permission to use this command.`,
                        event.threadID,
                        event.messageID
                      );

                      return;

                    }

                  }


                  // ==========================================
                  // BLACKLIST
                  // ==========================================

                  if (
                    event.body &&
                    event.body
                      ?.toLowerCase()
                      .startsWith(
                        prefix.toLowerCase()
                      ) &&
                    aliases(command)?.name
                  ) {

                    if (
                      blacklist.includes(
                        event.senderID
                      )
                    ) {

                      api.sendMessage(
                        "We're sorry, but you've been banned from using bot. If you believe this is a mistake or would like to appeal, please contact one of the bot admins from further assistance.",
                        event.threadID,
                        event.messageID
                      );

                      return;

                    }

                  }


                  // ==========================================
                  // COMMAND COOLDOWN
                  // ==========================================

                  if (
                    event.body &&
                    aliases(command)?.name
                  ) {

                    const now =
                      Date.now();

                    const name =
                      aliases(command)?.name;

                    const sender =
                      Utils.cooldowns.get(
                        `${event.senderID}_${name}_${userid}`
                      );

                    const delay =
                      aliases(command)?.cooldown ??
                      0;


                    if (
                      !sender ||
                      (
                        now -
                        sender.timestamp
                      ) >=
                      delay * 1000
                    ) {

                      Utils.cooldowns.set(
                        `${event.senderID}_${name}_${userid}`,
                        {
                          timestamp: now,
                          command: name
                        }
                      );

                    } else {

                      const active =
                        Math.ceil(
                          (
                            sender.timestamp +
                            delay * 1000 -
                            now
                          ) / 1000
                        );


                      api.sendMessage(
                        `Please wait ${active} seconds before using the "${name}" command again.`,
                        event.threadID,
                        event.messageID
                      );

                      return;

                    }

                  }


                  // ==========================================
                  // INVALID COMMAND
                  // ==========================================

                  if (
                    event.body &&
                    !command &&
                    event.body
                      ?.toLowerCase()
                      .startsWith(
                        prefix.toLowerCase()
                      )
                  ) {

                    api.sendMessage(
                      `Invalid command please use ${prefix}help to see the list of available commands.`,
                      event.threadID,
                      event.messageID
                    );

                    return;

                  }


                  if (
                    event.body &&
                    command &&
                    prefix &&
                    event.body
                      ?.toLowerCase()
                      .startsWith(
                        prefix.toLowerCase()
                      ) &&
                    !aliases(command)?.name
                  ) {

                    api.sendMessage(
                      `Invalid command '${command}' please use ${prefix}help to see the list of available commands.`,
                      event.threadID,
                      event.messageID
                    );

                    return;

                  }


                  // ==========================================
                  // HANDLE EVENTS
                  // ==========================================

                  for (
                    const {
                      handleEvent,
                      name
                    }
                    of Utils.handleEvent.values()
                  ) {

                    if (
                      handleEvent &&
                      name &&
                      (
                        (
                          enableCommands[1]
                            .handleEvent || []
                        )
                        .includes(name) ||
                        (
                          enableCommands[0]
                            .commands || []
                        )
                        .includes(name)
                      )
                    ) {

                      handleEvent({

                        api,
                        event,
                        enableCommands,
                        admin,
                        prefix,
                        blacklist

                      });

                    }

                  }


                  // ==========================================
                  // COMMAND RUNNER
                  // ==========================================

                  switch (
                    event.type
                  ) {

                    case 'message':

                    case 'message_reply':

                    case 'message_unsend':

                    case 'message_reaction':

                      if (
                        enableCommands[0]
                          .commands
                          .includes(
                            aliases(
                              command?.toLowerCase()
                            )?.name
                          )
                      ) {

                        await (
                          (
                            aliases(
                              command?.toLowerCase()
                            )?.run ||
                            (() => {})
                          )
                          ({
                            api,
                            event,
                            args,
                            enableCommands,
                            admin,
                            prefix,
                            blacklist,
                            Utils,
                          })
                        );

                      }

                      break;

                  }

                }
              );

          } catch (error) {

            console.error(
              'Error during API listen, outside of listen',
              userid
            );

            Utils.account.delete(
              userid
            );

            deleteThisUser(
              userid
            );

            return;

          }


          resolve();

        }
      );

    }
  );

}


// ============================================================
// DELETE USER
// ============================================================

async function deleteThisUser(userid) {

  const configFile =
    './data/history.json';

  let config =
    JSON.parse(
      fs.readFileSync(
        configFile,
        'utf-8'
      )
    );

  const sessionFile =
    path.join(
      './data/session',
      `${userid}.json`
    );


  const index =
    config.findIndex(
      item =>
        item.userid === userid
    );


  if (index !== -1)
    config.splice(
      index,
      1
    );


  fs.writeFileSync(
    configFile,
    JSON.stringify(
      config,
      null,
      2
    )
  );


  try {

    fs.unlinkSync(
      sessionFile
    );

  } catch (error) {

    console.log(error);

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
  blacklist
) {

  const configFile =
    './data/history.json';

  const sessionFolder =
    './data/session';

  const sessionFile =
    path.join(
      sessionFolder,
      `${userid}.json`
    );


  if (
    fs.existsSync(sessionFile)
  )
    return;


  const config =
    JSON.parse(
      fs.readFileSync(
        configFile,
        'utf-8'
      )
    );


  config.push({

    userid,

    prefix:
      prefix || "",

    admin:
      admin || [],

    blacklist:
      blacklist || [],

    enableCommands,

    time: 0,

  });


  fs.writeFileSync(
    configFile,
    JSON.stringify(
      config,
      null,
      2
    )
  );


  fs.writeFileSync(
    sessionFile,
    JSON.stringify(state)
  );

}


// ============================================================
// ALIASES
// ============================================================

function aliases(command) {

  const aliases =
    Array.from(
      Utils.commands.entries()
    )
    .find(
      ([commands]) =>
        commands.includes(
          command?.toLowerCase()
        )
    );


  if (aliases) {

    return aliases[1];

  }

  return null;

}


// ============================================================
// MAIN
// ============================================================

async function main() {

  const empty =
    require('fs-extra');

  const cacheFile =
    './script/cache';


  if (
    !fs.existsSync(cacheFile)
  ) {

    fs.mkdirSync(cacheFile);

  }


  const configFile =
    './data/history.json';


  if (
    !fs.existsSync(configFile)
  ) {

    fs.writeFileSync(
      configFile,
      '[]',
      'utf-8'
    );

  }


  const config =
    JSON.parse(
      fs.readFileSync(
        configFile,
        'utf-8'
      )
    );


  const sessionFolder =
    path.join(
      './data/session'
    );


  if (
    !fs.existsSync(sessionFolder)
  ) {

    fs.mkdirSync(
      sessionFolder
    );

  }


  const adminOfConfig =
    fs.existsSync('./data') &&
    fs.existsSync('./data/config.json')
      ? JSON.parse(
          fs.readFileSync(
            './data/config.json',
            'utf8'
          )
        )
      : createConfig();


  cron.schedule(
    `*/${adminOfConfig[0].masterKey.restartTime} * * * *`,
    async () => {

      const history =
        JSON.parse(
          fs.readFileSync(
            './data/history.json',
            'utf-8'
          )
        );


      history.forEach(
        user => {

          (
            !user ||
            typeof user !== 'object'
          )
            ? process.exit(1)
            : null;


          (
            user.time === undefined ||
            user.time === null ||
            isNaN(user.time)
          )
            ? process.exit(1)
            : null;


          const update =
            Utils.account.get(
              user.userid
            );


          update
            ? user.time = update.time
            : null;

        }
      );


      await empty.emptyDir(
        cacheFile
      );


      await fs.writeFileSync(
        './data/history.json',
        JSON.stringify(
          history,
          null,
          2
        )
      );


      process.exit(1);

    }
  );


  try {

    for (
      const file of
      fs.readdirSync(
        sessionFolder
      )
    ) {

      const filePath =
        path.join(
          sessionFolder,
          file
        );


      try {

        const {
          enableCommands,
          prefix,
          admin,
          blacklist
        } =
          config.find(
            item =>
              item.userid ===
              path.parse(file).name
          ) || {};


        const state =
          JSON.parse(
            fs.readFileSync(
              filePath,
              'utf-8'
            )
          );


        if (enableCommands)
          await accountLogin(
            state,
            enableCommands,
            prefix,
            admin,
            blacklist
          );


      } catch (error) {

        deleteThisUser(
          path.parse(file).name
        );

      }

    }

  } catch (error) {}

}


// ============================================================
// CREATE CONFIG
// ============================================================

function createConfig() {

  const config = [

    {

      masterKey: {

        admin: [],

        devMode: false,

        database: false,

        restartTime: 15,

      },

      fcaOption: {

        forceLogin: true,

        listenEvents: true,

        logLevel: "silent",

        updatePresence: true,

        selfListen: true,

        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64",

        online: true,

        autoMarkDelivery: false,

        autoMarkRead: false

      }

    }

  ];


  const dataFolder =
    './data';


  if (
    !fs.existsSync(dataFolder)
  ) {

    fs.mkdirSync(dataFolder);

  }


  fs.writeFileSync(
    './data/config.json',
    JSON.stringify(
      config,
      null,
      2
    )
  );


  return config;

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
      JSON.parse(
        fs.readFileSync(
          './data/database.json',
          'utf8'
        )
      );


    let threadInfo =
      await api.getThreadInfo(
        threadID
      );


    let adminIDs =
      threadInfo
        ? threadInfo.adminIDs
        : [];


    const data = {};

    data[threadID] =
      adminIDs;


    database.push(
      data
    );


    await fs.writeFileSync(
      './data/database.json',
      JSON.stringify(
        database,
        null,
        2
      ),
      'utf-8'
    );


    return database;

  } catch (error) {

    console.log(error);

  }

}


// ============================================================
// CREATE DATABASE
// ============================================================

async function createDatabase() {

  const data =
    './data';

  const database =
    './data/database.json';


  if (
    !fs.existsSync(data)
  ) {

    fs.mkdirSync(
      data,
      {
        recursive: true
      }
    );

  }


  if (
    !fs.existsSync(database)
  ) {

    fs.writeFileSync(
      database,
      JSON.stringify([])
    );

  }


  return database;

}


// ============================================================
// START
// ============================================================

main();
