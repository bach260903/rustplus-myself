"use strict";
// Cong cu chuan doan FCM listener. CHI nghe thong bao, KHONG gui gi vao game.
// Chay:  node diag-fcm.js
// Roi vao game pair server moi de xem thong bao co toi khong.
const fs = require("fs");
const path = require("path");
const PushReceiverClient = require("@liamcottle/push-receiver/src/client");

const ts = () => new Date().toLocaleTimeString();

let creds = null;
try {
  creds = JSON.parse(fs.readFileSync(path.join(__dirname, "rustplus.config.json"), "utf8")).fcm_credentials;
} catch (e) {
  console.log("KHONG doc duoc rustplus.config.json:", e.message);
  process.exit(1);
}

if (!creds || !creds.gcm || !creds.gcm.androidId || !creds.gcm.securityToken) {
  console.log("THIEU fcm_credentials.gcm trong rustplus.config.json. Hay chay: npm run pair:register");
  process.exit(1);
}
console.log(`[${ts()}] Co FCM credentials. androidId=${String(creds.gcm.androidId).slice(0, 6)}...`);

const client = new PushReceiverClient(creds.gcm.androidId, creds.gcm.securityToken, []);

client.on("connect", () => console.log(`[${ts()}] >>> FCM CONNECTED (da thong toi Google, dang cho thong bao)`));
client.on("disconnect", () => console.log(`[${ts()}] <<< FCM DISCONNECTED (mat ket noi toi Google)`));

client.on("ON_DATA_RECEIVED", (data) => {
  console.log(`[${ts()}] === ON_DATA_RECEIVED ===`);
  console.log(JSON.stringify(data, null, 2));
});
client.on("ON_NOTIFICATION_RECEIVED", (data) => {
  console.log(`[${ts()}] === ON_NOTIFICATION_RECEIVED ===`);
  console.log(JSON.stringify(data, null, 2));
});

console.log(`[${ts()}] Dang ket noi toi mtalk.google.com:5228 ...`);
client
  .connect()
  .then(() => console.log(`[${ts()}] connect() xong. Neu KHONG thay dong 'FCM CONNECTED' o tren -> bi chan cong 5228.`))
  .catch((e) => console.log(`[${ts()}] connect() LOI:`, e.message || e));
