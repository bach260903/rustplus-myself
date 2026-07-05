"use strict";

const { toGridReference } = require("./grid");

const MARKER_TYPE = {
  EXPLOSION: 2,
  CH47: 4,
  CARGO_SHIP: 5,
  CRATE: 6,
  PATROL_HELICOPTER: 8,
};

function distance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function createMapEventTracker({ sendAlert, worldSize, launchSitePos, crateRadius }) {
  let heli = null;
  const seenCrateIds = new Set();
  const trackedCargo = new Map(); // id -> { x, y }
  const trackedCH47 = new Map(); // id -> { x, y }

  // Alert when a marker type appears on / leaves the map.
  function trackPresence(tracked, current, tag, label) {
    const currentIds = new Set(current.map((m) => m.id));
    for (const m of current) {
      if (!tracked.has(m.id)) {
        sendAlert(`[${tag}] ${label} spotted at ${toGridReference(m.x, m.y, worldSize)}`);
      }
      tracked.set(m.id, { x: m.x, y: m.y });
    }
    for (const [id, pos] of [...tracked]) {
      if (!currentIds.has(id)) {
        sendAlert(
          `[${tag}] ${label} left the map (last seen at ${toGridReference(
            pos.x,
            pos.y,
            worldSize
          )})`
        );
        tracked.delete(id);
      }
    }
  }

  function handleMarkers(markers) {
    const currentHeli = markers.find((m) => m.type === MARKER_TYPE.PATROL_HELICOPTER);
    const explosions = markers.filter((m) => m.type === MARKER_TYPE.EXPLOSION);
    const crates = markers.filter((m) => m.type === MARKER_TYPE.CRATE);
    const cargos = markers.filter((m) => m.type === MARKER_TYPE.CARGO_SHIP);
    const ch47s = markers.filter((m) => m.type === MARKER_TYPE.CH47);

    // Patrol Helicopter
    if (currentHeli && !heli) {
      heli = { id: currentHeli.id, x: currentHeli.x, y: currentHeli.y };
      sendAlert(`[HELI] Patrol Helicopter spotted at ${toGridReference(heli.x, heli.y, worldSize)}`);
    } else if (currentHeli && heli) {
      heli.x = currentHeli.x;
      heli.y = currentHeli.y;
    } else if (!currentHeli && heli) {
      const lastPos = heli;
      const shotDown = explosions.some((e) => distance(e.x, e.y, lastPos.x, lastPos.y) < 50);
      const grid = toGridReference(lastPos.x, lastPos.y, worldSize);
      sendAlert(
        shotDown
          ? `[HELI] Patrol Helicopter shot down near ${grid}`
          : `[HELI] Patrol Helicopter left the map (last seen at ${grid})`
      );
      heli = null;
    }

    // Cargo Ship & Chinook CH47
    trackPresence(trackedCargo, cargos, "CARGO", "Cargo Ship");
    trackPresence(trackedCH47, ch47s, "CHINOOK", "CH47 Chinook (crate dropper)");

    // Bradley APC: inferred from a loot crate dropping near Launch Site
    if (launchSitePos) {
      for (const crate of crates) {
        if (seenCrateIds.has(crate.id)) continue;
        seenCrateIds.add(crate.id);
        if (distance(crate.x, crate.y, launchSitePos.x, launchSitePos.y) <= crateRadius) {
          const grid = toGridReference(launchSitePos.x, launchSitePos.y, worldSize);
          sendAlert(`[TANK] Bradley APC may have been destroyed at Launch Site (${grid}) - loot crate just dropped nearby.`);
        }
      }
      const currentCrateIds = new Set(crates.map((c) => c.id));
      for (const id of [...seenCrateIds]) {
        if (!currentCrateIds.has(id)) seenCrateIds.delete(id);
      }
    }
  }

  // Current status for the !heli / !cargo commands
  function heliStatus() {
    if (!heli) return "[HELI] No Patrol Helicopter on the map right now.";
    return `[HELI] Patrol Helicopter is at ${toGridReference(heli.x, heli.y, worldSize)}`;
  }

  function cargoStatus() {
    if (trackedCargo.size === 0) return "[CARGO] No Cargo Ship on the map right now.";
    const positions = [...trackedCargo.values()]
      .map((p) => toGridReference(p.x, p.y, worldSize))
      .join(", ");
    return `[CARGO] Cargo Ship is at ${positions}`;
  }

  return { handleMarkers, heliStatus, cargoStatus };
}

module.exports = { createMapEventTracker };
