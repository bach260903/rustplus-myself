"use strict";
// Chan doan: noi vao server trong config.json, in team info, gui 1 tin test.
// Chay:  node diag-chat.js
const path = require("path");
const RustPlus = require("@liamcottle/rustplus.js");
const config = require("./config.json");

const ts = () => new Date().toLocaleTimeString();
const s = config.server;
console.log(`[${ts()}] Server trong config: ${s.ip}:${s.port}  (playerId ${s.playerId})`);

const rustplus = new RustPlus(s.ip, s.port, s.playerId, s.playerToken, s.useFacepunchProxy || false);

let done = false;
function finish(code) {
  if (done) return;
  done = true;
  try { rustplus.disconnect(); } catch (e) {}
  setTimeout(() => process.exit(code), 200);
}

rustplus.on("connecting", () => console.log(`[${ts()}] connecting...`));
rustplus.on("error", (e) => console.log(`[${ts()}] ERROR socket:`, e.message || e));
rustplus.on("disconnected", () => console.log(`[${ts()}] disconnected`));

rustplus.on("connected", async () => {
  console.log(`[${ts()}] >>> CONNECTED toi server`);
  try {
    const info = await rustplus.sendRequestAsync({ getInfo: {} });
    console.log(`[${ts()}] Server name: "${info.info.name}" | players ${info.info.players}/${info.info.maxPlayers}`);
  } catch (e) {
    console.log(`[${ts()}] getInfo LOI:`, e.message || e);
  }

  try {
    const t = await rustplus.sendRequestAsync({ getTeamInfo: {} });
    const ti = t.teamInfo;
    const members = (ti && ti.members) || [];
    console.log(`[${ts()}] TEAM: leaderSteamId=${ti && ti.leaderSteamId} | so thanh vien=${members.length}`);
    members.forEach((m) => console.log(`        - ${m.name} (${m.steamId}) online=${m.isOnline} alive=${m.isAlive}`));
    if (members.length <= 1) {
      console.log(`[${ts()}] !!! CHU Y: team chi co <=1 nguoi -> co the bot KHONG o trong team nao -> team chat se khong hien.`);
    }
  } catch (e) {
    console.log(`[${ts()}] getTeamInfo LOI:`, e.message || e);
  }

  try {
    await rustplus.sendRequestAsync({ sendTeamMessage: { message: "[TEST] Rust+ bot check - neu thay dong nay la bot chat duoc. Bo qua." } });
    console.log(`[${ts()}] >>> DA GUI tin test vao team chat (kiem tra trong game xem co hien khong).`);
  } catch (e) {
    console.log(`[${ts()}] sendTeamMessage LOI:`, e.message || e);
  }

  finish(0);
});

setTimeout(() => {
  console.log(`[${ts()}] Het 15s - thoat. Neu khong thay 'CONNECTED' o tren -> sai token/server offline/khac server.`);
  finish(1);
}, 15000);

rustplus.connect();
