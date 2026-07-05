"use strict";

const DEFAULT_NTFY_SERVER = "https://ntfy.sh";

// Publish a max-priority ntfy notification so a Smart Alarm trigger rings
// loudly on the phone (priority/sound behaviour is configured in the ntfy app).
async function sendAlarmNotification({ ntfyServer, ntfyTopic, title, message, log }) {
  if (!ntfyTopic) return;

  const base = (ntfyServer || DEFAULT_NTFY_SERVER).replace(/\/$/, "");
  try {
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: ntfyTopic,
        title: title || "Rust Alarm",
        message: message || "Smart Alarm triggered!",
        priority: 5,
        tags: ["rotating_light"],
      }),
    });
    if (!res.ok) {
      log(`ntfy publish failed: HTTP ${res.status}`);
    }
  } catch (err) {
    log("ntfy publish error:", err.message || err);
  }
}

module.exports = { sendAlarmNotification };
