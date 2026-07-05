"use strict";

const fs = require("fs");
const path = require("path");
const RustPlus = require("@liamcottle/rustplus.js");
const { createTeamTracker } = require("./teamTracker");
const { createMapEventTracker } = require("./mapEvents");
const { createTimeTracker } = require("./timeTracker");
const { createPairingListener } = require("./serverPairing");
const { sendAlarmNotification } = require("./alarmNotifier");

const CONFIG_PATH = path.join(__dirname, "..", "config.json");

function log(...args) {
  console.log(`[${new Date().toLocaleString()}]`, ...args);
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(
      "config.json not found. Copy config.example.json to config.json and fill in your pairing info (see README.md)."
    );
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const required = ["ip", "port", "playerId", "playerToken"];
  const missing = required.filter((k) => !config.server || !config.server[k]);
  if (missing.length) {
    console.error(
      `config.json is missing field(s) in "server": ${missing.join(", ")}. See README.md for how to get your pairing info.`
    );
    process.exit(1);
  }
  return config;
}

const config = loadConfig();
const afkThresholdMs = (config.afkThresholdMinutes ?? 5) * 60 * 1000;
const teamPollMs = (config.teamPollIntervalSeconds ?? 10) * 1000;
const mapPollMs = (config.mapPollIntervalSeconds ?? 15) * 1000;
const timePollMs = (config.timePollIntervalSeconds ?? 30) * 1000;
const crateRadius = config.launchSiteCrateRadius ?? 80;
const autoSwitchServer = config.autoSwitchServer !== false; // enabled by default
const ntfyConfig = config.ntfy || {};
const alarmNotificationsEnabled = !!ntfyConfig.topic;

let rustplus = null;
let teamTracker = null;
let mapEventTracker = null;
let timeTracker = null;
let intervals = [];
let reconnectAttempts = 0;
let leaderCommandCooldownUntil = 0;
let infoCommandCooldownUntil = 0;
let activeServer = config.server; // currently connected server (may change when a new one is paired)
let justSwitchedTo = null; // name of the server just switched to, to announce in chat on reconnect

function clearIntervals() {
  intervals.forEach(clearInterval);
  intervals = [];
}

// Outbound chat queue: Rust drops messages sent too fast (anti-spam), so we
// space them out. Single messages still go out immediately.
const SEND_SPACING_MS = 2000;
let sendQueue = [];
let sendTimer = null;

function isReady() {
  try {
    return rustplus && rustplus.isConnected();
  } catch (err) {
    return false;
  }
}

function flushSendQueue() {
  if (sendTimer || sendQueue.length === 0) return;
  const text = sendQueue.shift();
  if (isReady()) {
    try {
      rustplus.sendTeamMessage(text);
    } catch (err) {
      log("sendTeamMessage error:", err.message || err);
    }
  }
  if (sendQueue.length > 0) {
    sendTimer = setTimeout(() => {
      sendTimer = null;
      flushSendQueue();
    }, SEND_SPACING_MS);
  }
}

function sendAlert(text) {
  log("ALERT:", text);
  sendQueue.push(text);
  flushSendQueue();
}

// Write the new server into config.json so a later restart remembers the current server.
function persistServer(server) {
  try {
    const current = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    current.server = {
      ip: server.ip,
      port: server.port,
      playerId: server.playerId,
      playerToken: server.playerToken,
      useFacepunchProxy: (current.server && current.server.useFacepunchProxy) || false,
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2), "utf8");
  } catch (err) {
    log("Could not write config.json while switching server:", err.message || err);
  }
}

function sameServer(a, b) {
  return (
    a &&
    b &&
    String(a.ip) === String(b.ip) &&
    String(a.port) === String(b.port) &&
    String(a.playerToken) === String(b.playerToken)
  );
}

// Switch the bot to a new server (keeps useFacepunchProxy from the current config).
function switchServer(server) {
  log(`Switching server to: ${server.name} (${server.ip}:${server.port})`);
  justSwitchedTo = server.name;
  activeServer = {
    ip: server.ip,
    port: server.port,
    playerId: server.playerId,
    playerToken: server.playerToken,
    useFacepunchProxy: (activeServer && activeServer.useFacepunchProxy) || false,
  };
  persistServer(activeServer);

  clearIntervals();
  sendQueue = [];
  if (sendTimer) {
    clearTimeout(sendTimer);
    sendTimer = null;
  }
  if (rustplus) {
    rustplus.removeAllListeners(); // prevent the old 'disconnected' handler from reconnecting to the old server
    try {
      rustplus.disconnect();
    } catch (err) {
      /* ignore */
    }
  }
  reconnectAttempts = 0;
  connect();
}

// Called when a pairing notification is received from the game.
function handleServerPaired(server) {
  if (sameServer(server, activeServer)) {
    log(`Already on server ${server.name}, ignoring pairing notification.`);
    return;
  }
  switchServer(server);
}

async function findLaunchSite() {
  try {
    const map = await rustplus.sendRequestAsync({ getMap: {} });
    const monument = map.map.monuments.find((m) => {
      const token = m.token.toLowerCase();
      return token.includes("launch_site") || token.includes("launchsite");
    });
    return monument ? { x: monument.x, y: monument.y } : null;
  } catch (err) {
    log("Could not fetch monument list:", err.message || err);
    return null;
  }
}

async function handleLeaderCommand(teamMessage) {
  const now = Date.now();
  if (now < leaderCommandCooldownUntil) return;
  leaderCommandCooldownUntil = now + 5000;

  const requesterName = teamMessage.name;
  const requesterSteamId = String(teamMessage.steamId);

  try {
    await rustplus.sendRequestAsync({ promoteToLeader: { steamId: teamMessage.steamId } });
    const verify = await rustplus.sendRequestAsync({ getTeamInfo: {} });
    if (String(verify.teamInfo.leaderSteamId) === requesterSteamId) {
      rustplus.sendTeamMessage(`[LEADER] ${requesterName} is now the leader.`);
    } else {
      rustplus.sendTeamMessage(
        `[LEADER] Cannot promote ${requesterName} - the bot account is not the current leader.`
      );
    }
  } catch (err) {
    rustplus.sendTeamMessage(`[LEADER] Error while promoting ${requesterName}.`);
    log("promoteToLeader error:", err);
  }
}

async function handlePopCommand() {
  try {
    const res = await rustplus.sendRequestAsync({ getInfo: {} });
    const i = res.info;
    const queue = i.queuedPlayers ? `, queue ${i.queuedPlayers}` : "";
    sendAlert(`[POP] ${i.players}/${i.maxPlayers}${queue}`);
  } catch (err) {
    log("getInfo (pop) error:", err.message || err);
  }
}

async function handleTimeCommand() {
  try {
    const res = await rustplus.sendRequestAsync({ getTime: {} });
    sendAlert(timeTracker.statusLine(res.time));
  } catch (err) {
    log("getTime error:", err.message || err);
  }
}

async function handleWipeCommand() {
  try {
    const res = await rustplus.sendRequestAsync({ getInfo: {} });
    const wipeTime = res.info.wipeTime; // unix seconds
    if (!wipeTime) {
      sendAlert("[WIPE] Could not get wipe time.");
      return;
    }
    const elapsedSec = Math.max(0, Date.now() / 1000 - wipeTime);
    const days = Math.floor(elapsedSec / 86400);
    const hours = Math.floor((elapsedSec % 86400) / 3600);
    sendAlert(`[WIPE] Server wiped ${days}d ${hours}h ago`);
  } catch (err) {
    log("getInfo (wipe) error:", err.message || err);
  }
}

function handleHelpCommand() {
  sendAlert("[HELP] !pop=players, !time=clock, !heli/!cargo=positions, !wipe=since wipe, !leader=promote you");
}

// Anti-spam for commands that hit the API (avoids Rust+ rate limits).
function onInfoCooldown() {
  const now = Date.now();
  if (now < infoCommandCooldownUntil) return true;
  infoCommandCooldownUntil = now + 3000;
  return false;
}

function handleCommand(teamMessage) {
  const text = teamMessage.message.trim().toLowerCase();
  switch (text) {
    case "!help":
      return handleHelpCommand();
    case "!leader":
      return handleLeaderCommand(teamMessage);
    case "!pop":
      return onInfoCooldown() ? undefined : handlePopCommand();
    case "!time":
      return onInfoCooldown() ? undefined : handleTimeCommand();
    case "!wipe":
      return onInfoCooldown() ? undefined : handleWipeCommand();
    case "!heli":
      return mapEventTracker && sendAlert(mapEventTracker.heliStatus());
    case "!cargo":
      return mapEventTracker && sendAlert(mapEventTracker.cargoStatus());
  }
}

function startPolling() {
  clearIntervals();

  intervals.push(
    setInterval(() => {
      rustplus.getTeamInfo((message) => {
        if (message.response && message.response.teamInfo) {
          teamTracker.handleTeamInfo(message.response.teamInfo);
        }
      });
    }, teamPollMs)
  );

  intervals.push(setInterval(() => teamTracker.checkAfk(), 60 * 1000));

  intervals.push(
    setInterval(() => {
      rustplus.getMapMarkers((message) => {
        if (message.response && message.response.mapMarkers) {
          mapEventTracker.handleMarkers(message.response.mapMarkers.markers);
        }
      });
    }, mapPollMs)
  );

  intervals.push(
    setInterval(() => {
      rustplus.getTime((message) => {
        if (message.response && message.response.time) {
          timeTracker.handleTime(message.response.time);
        }
      });
    }, timePollMs)
  );
}

async function onConnected() {
  reconnectAttempts = 0;
  log("Connected to Rust+ server.");

  const info = await rustplus.sendRequestAsync({ getInfo: {} }).catch((err) => {
    log("Could not fetch getInfo:", err.message || err);
    return null;
  });
  const worldSize = info ? info.info.mapSize : 4500;
  if (info) {
    log(`Server: "${info.info.name}" (${activeServer.ip}:${activeServer.port}) | players ${info.info.players}/${info.info.maxPlayers}`);
  }

  const launchSitePos = await findLaunchSite();
  if (!launchSitePos) {
    log("No Launch Site found on this map - the Bradley alert will be skipped.");
  }

  teamTracker = createTeamTracker({ sendAlert, worldSize, afkThresholdMs });
  mapEventTracker = createMapEventTracker({ sendAlert, worldSize, launchSitePos, crateRadius });
  timeTracker = createTimeTracker({ sendAlert });

  rustplus.getTeamInfo((message) => {
    if (message.response && message.response.teamInfo) {
      teamTracker.handleTeamInfo(message.response.teamInfo);
    }
  });
  rustplus.getTime((message) => {
    if (message.response && message.response.time) {
      timeTracker.handleTime(message.response.time);
    }
  });
  rustplus.sendRequest({ getTeamChat: {} });

  startPolling();
  if (justSwitchedTo) {
    sendAlert(`Bot switched to server: ${justSwitchedTo} and is ready.`);
    justSwitchedTo = null;
  } else {
    sendAlert("Rust+ bot connected and ready.");
  }
}

function connect() {
  rustplus = new RustPlus(
    activeServer.ip,
    activeServer.port,
    activeServer.playerId,
    activeServer.playerToken,
    activeServer.useFacepunchProxy || false
  );

  rustplus.on("connected", onConnected);

  rustplus.on("message", (message) => {
    if (!message.broadcast) return;

    if (message.broadcast.teamChanged && teamTracker) {
      teamTracker.handleTeamInfo(message.broadcast.teamChanged.teamInfo);
    }

    if (message.broadcast.teamMessage) {
      const teamMessage = message.broadcast.teamMessage.message;
      if (teamMessage.message.trim().startsWith("!")) {
        handleCommand(teamMessage);
      }
    }
  });

  rustplus.on("disconnected", () => {
    clearIntervals();
    reconnectAttempts += 1;
    const delay = Math.min(10000 * reconnectAttempts, 60000);
    log(`Disconnected (attempt ${reconnectAttempts}). Retrying in ${delay / 1000}s...`);
    if (reconnectAttempts === 5) {
      log(
        "Failed to reconnect several times - check config.json (ip/port/playerId/playerToken) and whether the server is online."
      );
    }
    setTimeout(connect, delay);
  });

  rustplus.on("error", (err) => {
    log("Connection error:", err.message || err);
  });

  rustplus.connect();
}

function onAlarmTriggered(alarm) {
  log(`Sending alarm notification via ntfy: ${alarm.title} - ${alarm.message}`);
  sendAlarmNotification({
    ntfyServer: ntfyConfig.server,
    ntfyTopic: ntfyConfig.topic,
    title: alarm.title,
    message: alarm.message,
    log,
  });
}

if (autoSwitchServer || alarmNotificationsEnabled) {
  createPairingListener({
    onServerPaired: autoSwitchServer ? handleServerPaired : undefined,
    onAlarmTriggered: alarmNotificationsEnabled ? onAlarmTriggered : undefined,
    log,
  }).start();
} else {
  log("autoSwitchServer = false and no ntfy topic configured - FCM listener is disabled.");
}

connect();
