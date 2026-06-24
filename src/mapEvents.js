"use strict";

const { toGridReference } = require("./grid");

const MARKER_TYPE = {
  EXPLOSION: 2,
  CRATE: 6,
  PATROL_HELICOPTER: 8,
};

function distance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function createMapEventTracker({ sendAlert, worldSize, launchSitePos, crateRadius }) {
  let heli = null;
  const seenCrateIds = new Set();

  function handleMarkers(markers) {
    const currentHeli = markers.find((m) => m.type === MARKER_TYPE.PATROL_HELICOPTER);
    const explosions = markers.filter((m) => m.type === MARKER_TYPE.EXPLOSION);
    const crates = markers.filter((m) => m.type === MARKER_TYPE.CRATE);

    if (currentHeli && !heli) {
      heli = { id: currentHeli.id, x: currentHeli.x, y: currentHeli.y };
      sendAlert(`[HELI] Patrol Helicopter xuat hien tai ${toGridReference(heli.x, heli.y, worldSize)}`);
    } else if (currentHeli && heli) {
      heli.x = currentHeli.x;
      heli.y = currentHeli.y;
    } else if (!currentHeli && heli) {
      const lastPos = heli;
      const shotDown = explosions.some((e) => distance(e.x, e.y, lastPos.x, lastPos.y) < 50);
      const grid = toGridReference(lastPos.x, lastPos.y, worldSize);
      sendAlert(
        shotDown
          ? `[HELI] Patrol Helicopter da bi ban ha gan ${grid}`
          : `[HELI] Patrol Helicopter da roi khoi ban do (lan cuoi thay o ${grid})`
      );
      heli = null;
    }

    if (launchSitePos) {
      for (const crate of crates) {
        if (seenCrateIds.has(crate.id)) continue;
        seenCrateIds.add(crate.id);
        if (distance(crate.x, crate.y, launchSitePos.x, launchSitePos.y) <= crateRadius) {
          const grid = toGridReference(launchSitePos.x, launchSitePos.y, worldSize);
          sendAlert(`[TANK] Bradley APC co the vua bi ha tai Launch Site (${grid}) - loot crate vua roi gan do.`);
        }
      }
      const currentCrateIds = new Set(crates.map((c) => c.id));
      for (const id of [...seenCrateIds]) {
        if (!currentCrateIds.has(id)) seenCrateIds.delete(id);
      }
    }
  }

  return { handleMarkers };
}

module.exports = { createMapEventTracker };
