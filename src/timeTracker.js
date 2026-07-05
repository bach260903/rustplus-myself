"use strict";

// AppTime.time is the in-game time as a float (e.g. 14.5 = 14:30).
function formatGameTime(t) {
  if (typeof t !== "number" || !Number.isFinite(t)) return "??:??";
  let hours = Math.floor(t) % 24;
  let minutes = Math.floor((t - Math.floor(t)) * 60);
  if (minutes >= 60) {
    minutes -= 60;
    hours = (hours + 1) % 24;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function createTimeTracker({ sendAlert }) {
  let wasDay = null;

  function isDayTime(time) {
    return time.time >= time.sunrise && time.time < time.sunset;
  }

  // Called periodically -> alert on day/night transitions.
  function handleTime(time) {
    const day = isDayTime(time);
    if (wasDay === null) {
      wasDay = day; // first sample, don't alert
      return;
    }
    if (day !== wasDay) {
      wasDay = day;
      sendAlert(
        day
          ? `[TIME] Daytime now (~${formatGameTime(time.sunrise)})`
          : `[TIME] Night falling (~${formatGameTime(time.sunset)})`
      );
    }
  }

  // Returns a single line for the !time command.
  function statusLine(time) {
    const day = isDayTime(time);
    const next = day
      ? `sunset ~${formatGameTime(time.sunset)}`
      : `sunrise ~${formatGameTime(time.sunrise)}`;
    return `[TIME] Now ${formatGameTime(time.time)} (${day ? "day" : "night"}), ${next}`;
  }

  return { handleTime, statusLine };
}

module.exports = { createTimeTracker, formatGameTime };
