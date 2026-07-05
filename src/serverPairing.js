"use strict";

const fs = require("fs");
const path = require("path");
const PushReceiverClient = require("@liamcottle/push-receiver/src/client");

const RUSTPLUS_CONFIG_PATH = path.join(__dirname, "..", "rustplus.config.json");
const SEEN_PATH = path.join(__dirname, "..", "fcm-seen.json"); // remember handled notifications
const MAX_SEEN = 1000;

// Extract server info from a Rust+ pairing notification.
// appData is an array of { key, value }; server info is in the "body" key (JSON).
function extractServerFromNotification(data) {
  const appData = data && data.appData;
  if (!Array.isArray(appData)) return null;

  const bodyEntry = appData.find((kv) => kv && kv.key === "body");
  if (!bodyEntry || !bodyEntry.value) return null;

  let body;
  try {
    body = JSON.parse(bodyEntry.value);
  } catch (err) {
    return null;
  }

  // Only care about "server" pairing (ignore entity pairing: smart switch, alarm...).
  if (body.type !== "server") return null;
  if (!body.ip || !body.port || !body.playerId || !body.playerToken) return null;

  return {
    ip: String(body.ip),
    port: String(body.port),
    playerId: String(body.playerId),
    playerToken: String(body.playerToken),
    name: body.name ? String(body.name) : String(body.ip),
  };
}

// Extract title/message from a Smart Alarm notification.
// Rust+ tags these with channelId "alarm" and puts the text directly in
// top-level appData keys (no need to parse the "body" JSON for this).
function extractAlarmFromNotification(data) {
  const appData = data && data.appData;
  if (!Array.isArray(appData)) return null;

  const get = (key) => {
    const entry = appData.find((kv) => kv && kv.key === key);
    return entry ? entry.value : null;
  };

  const channelId = get("channelId") || get("gcm.notification.android_channel_id");
  if (channelId !== "alarm") return null;

  return {
    title: get("title") || get("gcm.notification.title") || "Alarm",
    message: get("message") || get("gcm.notification.body") || "",
  };
}

function loadSeenIds() {
  try {
    const arr = JSON.parse(fs.readFileSync(SEEN_PATH, "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    return [];
  }
}

function saveSeenIds(ids) {
  try {
    fs.writeFileSync(SEEN_PATH, JSON.stringify(ids.slice(-MAX_SEEN)), "utf8");
  } catch (err) {
    /* if we can't write, ignore - don't block the main flow */
  }
}

// Listen for pairing notifications (auto-switch servers) and Smart Alarm
// notifications (onAlarmTriggered, optional).
// Returns { start } - if FCM credentials are missing, start() just logs an error.
function createPairingListener({ onServerPaired, onAlarmTriggered, log }) {
  let creds = null;
  try {
    creds = JSON.parse(fs.readFileSync(RUSTPLUS_CONFIG_PATH, "utf8")).fcm_credentials;
  } catch (err) {
    creds = null;
  }

  if (!creds || !creds.gcm || !creds.gcm.androidId || !creds.gcm.securityToken) {
    return {
      start() {
        log(
          "FCM credentials not found (rustplus.config.json) - auto server-switch is disabled. Run 'npm run pair:register' to enable it."
        );
      },
    };
  }

  const seenIds = loadSeenIds();
  const seenSet = new Set(seenIds);

  async function start() {
    // Pass already-handled persistentIds so Google won't resend them (avoids jumping to an old server on restart).
    const client = new PushReceiverClient(creds.gcm.androidId, creds.gcm.securityToken, [...seenIds]);

    client.on("connect", () =>
      log("FCM connected - pair a new server in-game and the bot will auto-switch to it.")
    );
    client.on("disconnect", () => log("FCM disconnected, retrying automatically..."));

    client.on("ON_DATA_RECEIVED", (data) => {
      const pid = data && data.persistentId;
      if (pid) {
        if (seenSet.has(pid)) return; // already handled this notification
        seenSet.add(pid);
        seenIds.push(pid);
        saveSeenIds(seenIds);
      }

      const server = extractServerFromNotification(data);
      if (server) {
        if (onServerPaired) {
          log(`Pairing notification received for server: ${server.name} (${server.ip}:${server.port})`);
          onServerPaired(server);
        }
        return;
      }

      const alarm = extractAlarmFromNotification(data);
      if (alarm && onAlarmTriggered) {
        log(`Alarm notification received: ${alarm.title} - ${alarm.message}`);
        onAlarmTriggered(alarm);
      }
    });

    try {
      log("Connecting to FCM to listen for pairing notifications...");
      await client.connect();
    } catch (err) {
      log("Failed to start FCM listener (auto server-switch):", err.message || err);
    }
  }

  return { start };
}

module.exports = { createPairingListener, extractServerFromNotification, extractAlarmFromNotification };
