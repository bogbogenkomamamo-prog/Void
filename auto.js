const fs = require('fs');
const path = require('path');
const login = require('ws3-fca');
const express = require('express');
const app = express();
const chalk = require('chalk');
const bodyParser = require('body-parser');
const script = path.join(__dirname, 'script');
const cron = require('node-cron');

const config = fs.existsSync('./data') && fs.existsSync('./data/config.json') ? JSON.parse(fs.readFileSync('./data/config.json', 'utf8')) : createConfig();
const dev = fs.existsSync('./dev.json') ? JSON.parse(fs.readFileSync('./dev.json')) : [];

const Utils = new Object({
  commands: new Map(),
  handleEvent: new Map(),
  account: new Map(),
  cooldowns: new Map(),
});

if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
if (!fs.existsSync('./data/history.json')) fs.writeFileSync('./data/history.json', '[]', 'utf-8');
if (!fs.existsSync('./data/session')) fs.mkdirSync('./data/session', { recursive: true });
if (!fs.existsSync('./data/database.json')) fs.writeFileSync('./data/database.json', '[]', 'utf-8');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// COMMAND LOADER
fs.readdirSync(script).forEach((file) => {
  const scripts = path.join(script, file);
  try {
    const stats = fs.statSync(scripts);
    if (stats.isDirectory()) {
      fs.readdirSync(scripts).forEach((subFile) => {
        if (!subFile.endsWith('.js')) return;
        loadScript(path.join(scripts, subFile));
      });
    } else if (file.endsWith('.js')) {
      loadScript(scripts);
    }
  } catch (error) {
    console.error(chalk.red(`Error reading script path ${file}: ${error.message}`));
  }
});

function loadScript(filePath) {
  try {
    delete require.cache[require.resolve(filePath)];
    const pull = require(filePath);
    if (!pull.config) return;

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
    } = Object.fromEntries(Object.entries(pull.config).map(([key, value]) => [key.toLowerCase(), value]));

    const nameArray = Array.isArray(name) ? name : [name];
    const allAliases = Array.isArray(aliases) ? [...aliases, ...nameArray] : [...nameArray];
    const primaryName = nameArray[0] || 'unknown';

    if (pull.run) {
      Utils.commands.set(allAliases, {
        name: primaryName,
        role,
        run: pull.run,
        aliases: allAliases,
        description,
        usage,
        version,
        hasPrefix,
        credits,
        cooldown,
        dev
      });
    }

    if (pull.handleEvent) {
      Utils.handleEvent.set(allAliases, {
        name: primaryName,
        handleEvent: pull.handleEvent,
        role,
        description,
        usage,
        version,
        hasPrefix,
        credits,
        cooldown,
        dev
      });
    }
  } catch (error) {
    console.error(chalk.red(`Error loading script ${filePath}: ${error.message}`));
  }
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(express.json());

const routes = [
  { path: '/', file: 'index.html' },
  { path: '/step_by_step_guide', file: 'guide.html' },
  { path: '/online_user', file: 'online.html' },
];

routes.forEach(route => {
  app.get(route.path, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', route.file));
  });
});

app.get('/info', (req, res) => {
  const data = Array.from(Utils.account.values()).map(account => ({
    name: account.name,
    profileUrl: account.profileUrl,
    thumbSrc: account.thumbSrc,
    time: account.time
  }));
  res.json(data);
});

app.get('/commands', (req, res) => {
  const commandSet = new Set();
  const commands = [];
  const handleEvent = [];
  const role = [];
  const aliases = [];

  for (const cmd of Utils.commands.values()) {
    if (!commandSet.has(cmd.name)) {
      commandSet.add(cmd.name);
      commands.push(cmd.name);
      role.push(cmd.role);
      aliases.push(cmd.aliases);
    }
  }

  for (const ev of Utils.handleEvent.values()) {
    if (!commandSet.has(ev.name)) {
      commandSet.add(ev.name);
      handleEvent.push(ev.name);
    }
  }

  res.json({ commands, handleEvent, role, aliases });
});

app.post('/login', async (req, res) => {
  const { state, commands, prefix, admin } = req.body;
  try {
    if (!state) throw new Error('Missing app state data');
    const cUser = state.find(item => item.key === 'c_user');
    if (cUser) {
      const existingUser = Utils.account.get(cUser.value);
      if (existingUser) {
        return res.status(400).json({
          error: false,
          message: "Active user session detected; already logged in",
          user: existingUser
        });
      } else {
        await accountLogin(state, commands, prefix, Array.isArray(admin) ? admin : [admin]);
        res.status(200).json({
          success: true,
          message: 'Authentication process completed successfully; login achieved.'
        });
      }
    } else {
      return res.status(400).json({ error: true, message: "Invalid appstate data." });
    }
  } catch (error) {
    return res.status(400).json({ error: true, message: error.message });
  }
});

app.post('/logout', async (req, res) => {
  const { userid } = req.body;
  try {
    if (!userid) {
      return res.status(400).json({ error: true, message: "Missing userid parameter." });
    }

    if (Utils.account.has(userid)) {
      Utils.account.delete(userid);
    }

    await deleteThisUser(userid);

    return res.status(200).json({
      success: true,
      message: `Successfully logged out and cleared session for user: ${userid}`
    });
  } catch (error) {
    return res.status(500).json({ error: true, message: error.message });
  }
});

app.listen(3000, () => {
  console.log(`Server is running at http://localhost:3000`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
});

async function accountLogin(state, enableCommands = [], prefix = "/", admin = []) {
  enableCommands = [
    { commands: Array.from(Utils.commands.values()).map(c => c.name) },
    { handleEvent: Array.from(Utils.handleEvent.values()).map(c => c.name) }
  ];

  return new Promise((resolve, reject) => {
    login({ appState: state }, async (error, api) => {
      if (error) {
        reject(error);
        return;
      }
      const userid = await api.getCurrentUserID();
      addThisUser(userid, enableCommands, state, prefix, admin);
      try {
        const userInfo = await api.getUserInfo(userid);
        if (!userInfo || !userInfo[userid]?.name) throw new Error('Account locked or suspended.');
        const { name, profileUrl, thumbSrc } = userInfo[userid];
        let historyData = JSON.parse(fs.readFileSync('./data/history.json', 'utf-8'));
        let time = (historyData.find(user => user.userid === userid) || {}).time || 0;
        
        Utils.account.set(userid, { name, profileUrl, thumbSrc, time });
        
        const intervalId = setInterval(() => {
          try {
            const account = Utils.account.get(userid);
            if (!account) throw new Error('Account not found');
            Utils.account.set(userid, { ...account, time: account.time + 1 });
          } catch (error) {
            clearInterval(intervalId);
          }
        }, 1000);
      } catch (error) {
        Utils.account.delete(userid);
        await deleteThisUser(userid);
        reject(error);
        return;
      }

      api.setOptions({
        listenEvents: config[0].fcaOption.listenEvents,
        logLevel: config[0].fcaOption.logLevel,
        updatePresence: false,
        selfListen: false,
        forceLogin: config[0].fcaOption.forceLogin,
        online: true,
        autoMarkDelivery: false,
        autoMarkRead: false,
        userAgent: config[0].fcaOption.userAgent
      });

      try {
        api.listenMqtt(async (error, event) => {
          if (error) {
            console.log(chalk.red(`Connection error for user ${userid}:`, error));
            Utils.account.delete(userid);
            await deleteThisUser(userid);
            return;
          }
          
          let blacklist = (JSON.parse(fs.readFileSync('./data/history.json', 'utf-8')).find(b => b.userid === userid) || {}).blacklist || [];
          const body = event.body || "";
          let hasPrefix = (body && getCommandObj((body.trim().toLowerCase().split(/ +/).shift()))?.hasPrefix == false) ? '' : prefix;
          let [command, ...args] = ((body.trim().toLowerCase().startsWith(hasPrefix?.toLowerCase()) ? body.trim().substring(hasPrefix?.length).trim() : body.trim()).split(/\s+/).map(arg => arg.trim()));

          const targetCmd = getCommandObj(command);

          if (body && targetCmd?.name) {
            if (blacklist.includes(event.senderID)) {
              return api.sendMessage("Banned ka na sa paggamit ng bot.", event.threadID, event.messageID);
            }
            if (targetCmd.dev && !dev.includes(event.senderID)) {
              return api.sendMessage("Developer access lang ang pwede dito.", event.threadID, event.messageID);
            }
            
            try {
              const randomDelay = Math.floor(Math.random() * 4000) + 4000;
              await sleep(randomDelay);
              await targetCmd.run({ api, event, args, prefix, admin, blacklist, Utils });
            } catch (err) {
              console.error(err);
            }
          }

          // Ligtas na pagpasa ng events patungo sa mga naka-load na handleEvent scripts sa script folder
          for (const handleObj of Utils.handleEvent.values()) {
            try {
              if (typeof handleObj.handleEvent === 'function') {
                await handleObj.handleEvent({ api, event, prefix, admin, blacklist, Utils });
              }
            } catch (err) {
              console.error(chalk.red(`Error in handleEvent (${handleObj.name}): ${err.message}`));
            }
          }
        });
      } catch (error) {
        Utils.account.delete(userid);
        await deleteThisUser(userid);
        return;
      }
      resolve();
    });
  });
}

function getCommandObj(command) {
  if (!command) return null;
  for (const [keys, value] of Utils.commands.entries()) {
    if (keys.includes(command.toLowerCase())) {
      return value;
    }
  }
  return null;
}

async function deleteThisUser(userid) {
  const configFile = './data/history.json';
  if (!fs.existsSync(configFile)) return;
  let history = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
  const sessionFile = path.join('./data/session', `${userid}.json`);
  const index = history.findIndex(item => item.userid === userid);
  if (index !== -1) history.splice(index, 1);
  fs.writeFileSync(configFile, JSON.stringify(history, null, 2));
  try { fs.unlinkSync(sessionFile); } catch (error) {}
}

async function addThisUser(userid, enableCommands, state, prefix, admin, blacklist) {
  const configFile = './data/history.json';
  const sessionFolder = './data/session';
  const sessionFile = path.join(sessionFolder, `${userid}.json`);
  if (fs.existsSync(sessionFile)) return;
  const history = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
  history.push({ userid, prefix: prefix || "/", admin: admin || [], blacklist: blacklist || [], enableCommands, time: 0 });
  fs.writeFileSync(configFile, JSON.stringify(history, null, 2));
  fs.writeFileSync(sessionFile, JSON.stringify(state));
}

async function main() {
  const sessionFolder = path.join('./data/session');
  if (!fs.existsSync(sessionFolder)) fs.mkdirSync(sessionFolder);
  const configFile = './data/history.json';
  if (!fs.existsSync(configFile)) fs.writeFileSync(configFile, '[]', 'utf-8');
  const history = JSON.parse(fs.readFileSync(configFile, 'utf-8'));

  try {
    for (const file of fs.readdirSync(sessionFolder)) {
      const filePath = path.join(sessionFolder, file);
      try {
        const itemConfig = history.find(item => item.userid === path.parse(file).name) || {};
        const state = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        await accountLogin(state, itemConfig.enableCommands, itemConfig.prefix, itemConfig.admin, itemConfig.blacklist);
        console.log(chalk.green(`Auto-resumed session for user: ${path.parse(file).name}`));
      } catch (error) {
        deleteThisUser(path.parse(file).name);
      }
    }
  } catch (error) {}
}

function createConfig() {
  const config = [{
    masterKey: { admin: [], devMode: false, database: false, restartTime: 15 },
    fcaOption: { 
      forceLogin: true, 
      listenEvents: true, 
      logLevel: "silent", 
      updatePresence: false, 
      selfListen: false, 
      userAgent: "Mozilla/5.0 (Linux; Android 13; SM-S918B Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36", 
      online: true, 
      autoMarkDelivery: false, 
      autoMarkRead: false 
    }
  }];
  const dataFolder = './data';
  if (!fs.existsSync(dataFolder)) fs.mkdirSync(dataFolder);
  fs.writeFileSync('./data/config.json', JSON.stringify(config, null, 2));
  return config;
}

main();
