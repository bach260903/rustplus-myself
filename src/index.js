"use strict";

const fs = require("fs");
const path = require("path");
const RustPlus = require("@liamcottle/rustplus.js");
const { createTeamTracker } = require("./teamTracker");
const { createMapEventTracker } = require("./mapEvents");

const CONFIG_PATH = path.join(__dirname, "..", "config.json");

function log(...args) {
  console.log(`[${new Date().toLocaleString()}]`, ...args);
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(
      "Khong tim thay config.json. Hay copy config.example.json thanh config.json va dien thong tin pairing (xem README.md)."
    );
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const required = ["ip", "port", "playerId", "playerToken"];
  const missing = required.filter((k) => !config.server || !config.server[k]);
  if (missing.length) {
    console.error(
      `config.json thieu field trong "server": ${missing.join(", ")}. Xem README.md de biet cach lay thong tin pairing.`
    );
    process.exit(1);
  }
  return config;
}

const config = loadConfig();
const afkThresholdMs = (config.afkThresholdMinutes ?? 5) * 60 * 1000;
const teamPollMs = (config.teamPollIntervalSeconds ?? 10) * 1000;
const mapPollMs = (config.mapPollIntervalSeconds ?? 15) * 1000;
const crateRadius = config.launchSiteCrateRadius ?? 80;

let rustplus = null;
let teamTracker = null;
let mapEventTracker = null;
let intervals = [];
let reconnectAttempts = 0;
let leaderCommandCooldownUntil = 0;

function clearIntervals() {
  intervals.forEach(clearInterval);
  intervals = [];
}

function sendAlert(text) {
  log("ALERT:", text);
  if (rustplus && rustplus.isConnected()) {
    rustplus.sendTeamMessage(text);
  }
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
    log("Khong lay duoc danh sach monument:", err.message || err);
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
      rustplus.sendTeamMessage(`[LEADER] ${requesterName} da duoc len leader.`);
    } else {
      rustplus.sendTeamMessage(
        `[LEADER] Khong the chuyen leader cho ${requesterName} - tai khoan bot hien khong phai leader.`
      );
    }
  } catch (err) {
    rustplus.sendTeamMessage(`[LEADER] Loi khi chuyen leader cho ${requesterName}.`);
    log("promoteToLeader error:", err);
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
}

async function onConnected() {
  reconnectAttempts = 0;
  log("Da ket noi toi Rust+ server.");

  const info = await rustplus.sendRequestAsync({ getInfo: {} }).catch((err) => {
    log("Khong lay duoc getInfo:", err.message || err);
    return null;
  });
  const worldSize = info ? info.info.mapSize : 4500;

  const launchSitePos = await findLaunchSite();
  if (!launchSitePos) {
    log("Khong tim thay Launch Site tren ban do nay - tinh nang bao Bradley se bi bo qua.");
  }

  teamTracker = createTeamTracker({ sendAlert, worldSize, afkThresholdMs });
  mapEventTracker = createMapEventTracker({ sendAlert, worldSize, launchSitePos, crateRadius });

  rustplus.getTeamInfo((message) => {
    if (message.response && message.response.teamInfo) {
      teamTracker.handleTeamInfo(message.response.teamInfo);
    }
  });
  rustplus.sendRequest({ getTeamChat: {} });

  startPolling();
  sendAlert("Bot Rust+ da ket noi va san sang.");
}

function connect() {
  rustplus = new RustPlus(
    config.server.ip,
    config.server.port,
    config.server.playerId,
    config.server.playerToken,
    config.server.useFacepunchProxy || false
  );

  rustplus.on("connected", onConnected);

  rustplus.on("message", (message) => {
    if (!message.broadcast) return;

    if (message.broadcast.teamChanged && teamTracker) {
      teamTracker.handleTeamInfo(message.broadcast.teamChanged.teamInfo);
    }

    if (message.broadcast.teamMessage) {
      const teamMessage = message.broadcast.teamMessage.message;
      const text = teamMessage.message.trim().toLowerCase();
      if (text === "!leader") {
        handleLeaderCommand(teamMessage);
      }
    }
  });

  rustplus.on("disconnected", () => {
    clearIntervals();
    reconnectAttempts += 1;
    const delay = Math.min(10000 * reconnectAttempts, 60000);
    log(`Mat ket noi (lan thu ${reconnectAttempts}). Thu lai sau ${delay / 1000}s...`);
    if (reconnectAttempts === 5) {
      log(
        "Da thu ket noi lai nhieu lan khong thanh cong - kiem tra lai config.json (ip/port/playerId/playerToken) va server co dang online khong."
      );
    }
    setTimeout(connect, delay);
  });

  rustplus.on("error", (err) => {
    log("Loi ket noi:", err.message || err);
  });

  rustplus.connect();
}

connect();
