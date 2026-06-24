"use strict";

const { toGridReference } = require("./grid");

function createTeamTracker({ sendAlert, worldSize, afkThresholdMs }) {
  const members = new Map();

  function handleTeamInfo(teamInfo) {
    const now = Date.now();
    for (const m of teamInfo.members) {
            console.log(
        "[DEBUG MEMBER]",
        m.name,
        "alive=", m.isAlive,
        "x=", m.x,
        "y=", m.y
      );
      const steamId = String(m.steamId);
      const prev = members.get(steamId);

      if (!prev) {
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

    if (prev.isAlive && !m.isAlive) {
      console.log(
        "[DEBUG DEATH]",
        m.name,
        "x=", m.x,
        "y=", m.y,
        "prevX=", prev.x,
        "prevY=", prev.y,
        "isAlive=", m.isAlive
      );

      sendAlert(
        `[CHET] ${m.name} da chet tai ${toGridReference(
          typeof m.x === "number" ? m.x : prev.x,
          typeof m.y === "number" ? m.y : prev.y,
          worldSize
        )}`
      );
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
        sendAlert(`[AFK] ${member.name} dang AFK (khong di chuyen qua ${Math.round(afkThresholdMs / 60000)} phut)`);
      }
    }
  }

  return { handleTeamInfo, checkAfk };
}

module.exports = { createTeamTracker };
