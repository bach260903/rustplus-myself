"use strict";

const { toGridReference } = require("./grid");

function createTeamTracker({ sendAlert, worldSize, afkThresholdMs }) {
  const members = new Map();

  function handleTeamInfo(teamInfo) {
    const now = Date.now();
    for (const m of teamInfo.members) {
      const steamId = String(m.steamId);
      const prev = members.get(steamId);

      if (!prev) {
        // First time we see this member -> just store state, don't alert
        // (avoids spam when the bot just started).
        members.set(steamId, {
          name: m.name,
          x: m.x,
          y: m.y,
          isOnline: m.isOnline,
          isAlive: m.isAlive,
          lastMovedAt: now,
          isAfk: false,
        });
        continue;
      }

      // Teammate died. Use the death-reading position if it looks valid,
      // otherwise fall back to the last known alive position.
      if (prev.isAlive && !m.isAlive) {
        const hasPos =
          typeof m.x === "number" &&
          typeof m.y === "number" &&
          !(m.x === 0 && m.y === 0);
        const dx = hasPos ? m.x : prev.x;
        const dy = hasPos ? m.y : prev.y;
        sendAlert(`[DEAD] ${m.name} died at ${toGridReference(dx, dy, worldSize)}`);
      }

      // Teammate just came online
      if (!prev.isOnline && m.isOnline) {
        sendAlert(`[ONLINE] ${m.name} just came online`);
      }

      const moved = prev.x !== m.x || prev.y !== m.y;
      if (moved) {
        prev.lastMovedAt = now;
        prev.isAfk = false;
      }

      prev.name = m.name;
      prev.x = m.x;
      prev.y = m.y;
      prev.isOnline = m.isOnline;
      prev.isAlive = m.isAlive;
    }
  }

  function checkAfk() {
    const now = Date.now();
    for (const member of members.values()) {
      if (!member.isOnline || !member.isAlive || member.isAfk) continue;
      if (now - member.lastMovedAt >= afkThresholdMs) {
        member.isAfk = true;
        sendAlert(
          `[AFK] ${member.name} is AFK (no movement for ${Math.round(
            afkThresholdMs / 60000
          )} min)`
        );
      }
    }
  }

  return { handleTeamInfo, checkAfk };
}

module.exports = { createTeamTracker };
