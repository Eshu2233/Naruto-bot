const express = require("express");
const fs = require("fs-extra");
const path = require("path");
const login = require("fca-eryxenx");

const app = express();
const port = process.env.PORT || 8080;

app.get("/", (req, res) => {
  res.send("Naruto Bot (GoatBot V2) is Active & Running!");
});

app.listen(port, () => {
  console.log(`[ SERVER ] Uptime server running on port ${port}`);
});

// Setup global GoatBot object
global.GoatBot = {
  commands: new Map(),
  onReply: new Map(),
  config: { prefix: "!" }
};

// Load Config
if (fs.existsSync("./config.json")) {
  try {
    global.GoatBot.config = fs.readJsonSync("./config.json");
  } catch (e) {
    console.error("❌ Failed to load config.json:", e.message);
  }
}

// AppState Loader
function getAppState() {
  if (process.env.APPSTATE) {
    try {
      return JSON.parse(process.env.APPSTATE);
    } catch (e) {
      console.error("❌ AppState Env Parsing Error:", e.message);
    }
  }
  if (fs.existsSync("./account.txt")) {
    try {
      const content = fs.readFileSync("./account.txt", "utf8").trim();
      if (content) return JSON.parse(content);
    } catch (e) {
      console.error("❌ account.txt Parsing Error:", e.message);
    }
  }
  return null;
}

const appState = getAppState();

if (!appState) {
  console.error("❌ AppState not found in Env or account.txt!");
  process.exit(1);
}

// Load Commands from scripts/cmds
const cmdsPath = path.join(__dirname, "scripts", "cmds");

if (fs.existsSync(cmdsPath)) {
  const cmdFiles = fs.readdirSync(cmdsPath).filter(file => file.endsWith(".js"));
  for (const file of cmdFiles) {
    try {
      const cmd = require(path.join(cmdsPath, file));
      if (cmd.config && cmd.config.name) {
        global.GoatBot.commands.set(cmd.config.name.toLowerCase(), cmd);
        console.log(`✅ Loaded Command: ${cmd.config.name}`);
      }
    } catch (err) {
      console.error(`❌ Failed to load command ${file}:`, err.message);
    }
  }
}

// FB Login
login({ appState }, (err, api) => {
  if (err) {
    console.error("❌ Facebook Login Failed:", err);
    return;
  }

  console.log("✅ Naruto Bot Logged in Successfully!");

  api.setOptions({
    listenEvents: true,
    selfListen: false,
    forceLogin: true,
    listenTyping: false,
    autoMarkDelivery: false
  });

  const messageHelper = (threadID, messageID) => ({
    reply: (msg, callback) => api.sendMessage(msg, threadID, callback, messageID),
    send: (msg, callback) => api.sendMessage(msg, threadID, callback)
  });

  api.listenMqtt((err, event) => {
    if (err) {
      console.error("❌ MQTT Error:", err);
      return;
    }

    try {
      const { threadID, messageID, body, type, messageReply } = event;
      const msg = messageHelper(threadID, messageID);

      // 1. Handle Replies (onReply)
      if (type === "message_reply" && messageReply) {
        const replyData = global.GoatBot.onReply.get(messageReply.messageID);
        if (replyData) {
          const cmd = global.GoatBot.commands.get(replyData.commandName);
          if (cmd && cmd.onReply) {
            cmd.onReply({ api, event, Reply: replyData, message: msg, config: global.GoatBot.config });
          }
        }
      }

      // 2. Handle Messages & Prefix Logic
      if (type === "message" || type === "message_reply") {
        const text = body ? body.trim() : "";
        const prefix = global.GoatBot.config.prefix || "!";

        if (text.startsWith(prefix)) {
          const args = text.slice(prefix.length).trim().split(/ +/);
          const commandName = args.shift().toLowerCase();

          if (global.GoatBot.commands.has(commandName)) {
            const cmd = global.GoatBot.commands.get(commandName);
            cmd.onStart({ api, event, args, message: msg, config: global.GoatBot.config });
          }
        }

        // 3. Always Trigger onChat for Listeners (e.g., ownermention, emojireply, gcprotect)
        global.GoatBot.commands.forEach((cmd) => {
          if (cmd.onChat) {
            cmd.onChat({ api, event, message: msg, config: global.GoatBot.config });
          }
        });
      }
    } catch (e) {
      console.error("❌ Event Processing Error:", e.message);
    }
  });
});
