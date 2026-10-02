const express = require('express');
const bodyParser = require('body-parser');
const login = require('ws3-fca');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories setup
const SESSIONS_DIR = path.join(__dirname, 'data', 'session');
fs.ensureDirSync(SESSIONS_DIR);

app.use(bodyParser.json());

// IMPORTANT: I-serve ang static files mula sa 'public' folder (dito kukunin ang index.html at style.css)
app.use(express.static(path.join(__dirname, 'public')));

// Fallback route para siguradong index.html ang lalabas sa main URL '/'
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// In-memory active bot instances
const activeBots = new Map();

// Helper: Standard login options for ws3-fca
const fcaOptions = {
  listenEvents: true,
  selfListen: false,
  logLevel: 'silent',
  forceLogin: true,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

// Start a single bot instance
function startBotSession(appState, uid, prefix = '/', adminUID = '') {
  return new Promise((resolve, reject) => {
    login({ appState }, fcaOptions, (err, api) => {
      if (err) return reject(err);

      api.setOptions({ listenEvents: true, prefix });

      // Save valid state to disk
      const sessionPath = path.join(SESSIONS_DIR, `${uid}.json`);
      fs.writeJsonSync(sessionPath, {
        appState: api.getAppState(),
        prefix,
        adminUID,
        updatedAt: new Date().toISOString()
      }, { spaces: 2 });

      // Listen to incoming messages
      const stopListener = api.listenMqtt((listenErr, event) => {
        if (listenErr) return console.error(chalk.red(`[BOT ${uid}] Listen Error:`), listenErr);

        if (event.type === 'message' || event.type === 'message_reply') {
          if (event.body && event.body.startsWith(prefix)) {
            const command = event.body.slice(prefix.length).trim().split(' ')[0].toLowerCase();
            if (command === 'ping') {
              api.sendMessage('Pong! 🥷 Voidless Engine operational.', event.threadID, event.messageID);
            }
          }
        }
      });

      activeBots.set(uid, { api, stopListener, prefix, adminUID });
      console.log(chalk.green(`[ENGINE] Bot active for UID: ${uid}`));
      resolve(uid);
    });
  });
}

// Auto-restore saved sessions on startup
async function loadSavedSessions() {
  const files = fs.readdirSync(SESSIONS_DIR).filter(file => file.endsWith('.json'));
  console.log(chalk.cyan(`[ENGINE] Found ${files.length} saved session(s). Restoring...`));

  for (const file of files) {
    try {
      const sessionData = fs.readJsonSync(path.join(SESSIONS_DIR, file));
      const uid = path.basename(file, '.json');
      await startBotSession(sessionData.appState, uid, sessionData.prefix, sessionData.adminUID);
    } catch (err) {
      console.error(chalk.red(`[ENGINE] Failed to restore session ${file}:`), err.message);
    }
  }
}

// Web Route: /login API endpoint
app.post('/login', async (req, res) => {
  const { email, password, state, prefix = '/', admin = '' } = req.body;

  // Case 1: Login using Appstate JSON
  if (state) {
    try {
      const credentials = typeof state === 'string' ? JSON.parse(state) : state;
      const cUserCookie = credentials.find(c => c.key === 'c_user');
      const uid = cUserCookie ? cUserCookie.value : `user_${Date.now()}`;

      await startBotSession(credentials, uid, prefix, admin);
      return res.json({ success: true, message: `Successfully connected bot UID: ${uid}` });
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Invalid Appstate format or failed login: ' + err.message });
    }
  }

  // Case 2: Login using Email and Password
  if (email && password) {
    login({ email, password }, fcaOptions, async (err, api) => {
      if (err) {
        return res.status(401).json({ success: false, message: 'FB Auth Failed: ' + (err.error || err.message) });
      }

      const appState = api.getAppState();
      const cUserCookie = appState.find(c => c.key === 'c_user');
      const uid = cUserCookie ? cUserCookie.value : `user_${Date.now()}`;

      try {
        await startBotSession(appState, uid, prefix, admin);
        return res.json({ success: true, message: `Successfully logged in UID: ${uid}` });
      } catch (sessionErr) {
        return res.status(500).json({ success: false, message: 'Session start failed: ' + sessionErr.message });
      }
    });
    return;
  }

  return res.status(400).json({ success: false, message: 'Provide either email/password or appstate JSON.' });
});

// Start HTTP Server and initialize sessions
app.listen(PORT, async () => {
  console.log(chalk.magenta(`[SERVER] Dashboard listening on port ${PORT}`));
  await loadSavedSessions();
});
