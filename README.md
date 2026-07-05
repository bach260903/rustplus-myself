# Rust Team Bot

Bot Rust+ chạy nền (Node.js), gửi thẳng vào **team chat trong game** — không cần Discord, không cần điện thoại.

## Tính năng

> Bot nhắn tiếng Anh trong team chat (vd `[DEAD] A died at D1`) cho hợp font Rust. README vẫn để tiếng Việt cho bạn dễ đọc.

### Tự động báo vào team chat
- Đồng đội **chết** — kèm toạ độ lưới (vd `[DEAD] A died at D1`).
- Đồng đội **vào game** (vd `[ONLINE] A just came online`).
- Đồng đội **AFK** (không di chuyển quá X phút).
- **Patrol Helicopter** xuất hiện / bị bắn hạ / rời bản đồ, kèm toạ độ lưới (vd K15).
- **Cargo Ship** (tàu hàng) xuất hiện / rời bản đồ.
- **Chinook CH47** (máy bay thả locked crate) xuất hiện / rời bản đồ.
- **Bradley APC** (tank) có thể vừa bị hạ tại Launch Site.
- **Chuyển ngày/đêm** (vd `[TIME] Night falling`) — tiện canh giờ raid/farm.
- **Tự động chuyển server**: pair server mới trong game → bot tự bám theo (xem mục riêng bên dưới).
- **Báo động điện thoại khi Smart Alarm kích hoạt**: đẩy cảnh báo ưu tiên cao qua [ntfy](https://ntfy.sh) để điện thoại kêu to (xem mục riêng bên dưới).
- Tự kết nối lại khi rớt mạng, chạy được liên tục dù bạn không mở game (chỉ cần máy chạy bot vẫn mở).

### Lệnh gõ trong team chat
- `!help` → liệt kê tất cả lệnh ngay trong team chat.
- `!leader` → người gõ lệnh tự được lên leader (chỉ hoạt động khi acc Steam dùng để pair bot đang là leader hiện tại, xem phần Giới hạn).
- `!pop` → số người đang chơi + hàng đợi (vd `[POP] 145/200, queue 12`).
- `!time` → giờ trong game, còn bao lâu tới tối/sáng.
- `!heli` → vị trí Patrol Helicopter hiện tại (hoặc báo chưa có).
- `!cargo` → vị trí Cargo Ship hiện tại (hoặc báo chưa có).
- `!wipe` → server wipe cách đây bao lâu.

## Yêu cầu

- Node.js (đã có sẵn trên máy này).
- Google Chrome (chỉ cần cho bước lấy pairing một lần).
- Server Rust phải bật `app.port` (Rust+) trong server.cfg — server thuê thường bật sẵn.

## Cài đặt

```
npm install
```

(Đã chạy ở bước cài đặt trước đó — chỉ cần chạy lại nếu bạn xoá thư mục `node_modules`.)

## Bước 1 - Lấy thông tin pairing Rust+

Chạy trong thư mục này (`D:\rust+`):

```
npx @liamcottle/rustplus.js fcm-register
```

- Chrome sẽ tự mở ra trang đăng nhập Rust+ chính thức (companion-rust.facepunch.com). Đăng nhập bằng Steam của bạn.
- Đợi đến khi thấy "Successfully registered with Rust Companion API."

Tiếp theo, vẫn trong thư mục này:

```
npx @liamcottle/rustplus.js fcm-listen
```

- Lệnh này sẽ đứng chờ thông báo (đừng tắt cửa sổ này).
- Vào game Rust, vào server bạn muốn pair, bấm **ESC → Rust+ → Pair with Server**.
- Cửa sổ console sẽ in ra một đoạn JSON chứa các trường `ip`, `port`, `playerId`, `playerToken` (có thể nằm trong một object con, cứ tìm 4 trường này).
- Copy 4 giá trị đó.
- Nhấn `Ctrl+C` để dừng `fcm-listen`.

## Bước 2 - Tạo config.json

Copy `config.example.json` thành `config.json`, rồi điền 4 giá trị vừa lấy được:

```json
{
  "server": {
    "ip": "...",
    "port": "...",
    "playerId": "...",
    "playerToken": "...",
    "useFacepunchProxy": false
  },
  "afkThresholdMinutes": 5,
  "teamPollIntervalSeconds": 10,
  "mapPollIntervalSeconds": 15,
  "launchSiteCrateRadius": 80
}
```

`config.json` đã được thêm vào `.gitignore` — không bị lỡ commit/chia sẻ nhầm.

> Nếu server đổi (chơi server khác), bạn chỉ cần lặp lại bước `fcm-listen` + pair lại trong game để lấy `playerToken` mới cho server đó (`playerId`/SteamID giữ nguyên).

## Bước 3 - Chạy bot

```
npm start
```

Bot sẽ tự gửi dòng "Rust+ bot connected and ready." vào team chat khi kết nối thành công.

## Tự động chuyển server (đang chơi A, đổi qua B)

Bot **tự bám theo server bạn pair gần nhất** — không cần sửa config hay khởi động lại tay.

Cách dùng: cứ vào server B trong game, bấm **ESC → Rust+ → Pair with Server** (đúng thao tác pair bình thường). Facepunch gửi một "pairing notification" tới chính tài khoản Rust+ đã đăng ký ở [Bước 1](#bước-1---lấy-thông-tin-pairing-rust). Bot nghe được thông báo đó nên sẽ:

1. Tự lưu `ip` / `port` / `playerToken` của server B vào `config.json`.
2. Ngắt kết nối server A, nối sang server B.
3. Báo `Bot switched to server: <ten server B> and is ready.` trong team chat của server B.

Vài lưu ý:

- Cần đã chạy `fcm-register` ([Bước 1](#bước-1---lấy-thông-tin-pairing-rust)) — bot nghe pairing bằng chính FCM credentials trong `rustplus.config.json`. Thiếu file/credentials thì tính năng tự tắt (bot vẫn chạy bình thường với 1 server).
- Pairing entity (smart switch...) bị bỏ qua — chỉ pairing **server** mới làm bot chuyển. Riêng thông báo **Smart Alarm** được dùng cho tính năng báo động điện thoại (mục bên dưới), không liên quan tới chuyển server.
- Pair lại đúng server đang chạy thì bot bỏ qua (không nối lại vô ích).
- Muốn tắt hẳn (cố định 1 server): đặt `"autoSwitchServer": false` trong `config.json`.

## Báo động điện thoại khi Smart Alarm kích hoạt

Khi 1 Smart Alarm bạn đã pair trong game bị kích hoạt (căn cứ bị tấn công), Rust+ gửi 1 thông báo FCM về. Bot nghe được thông báo đó và đẩy tiếp qua [ntfy](https://ntfy.sh) — một dịch vụ push thông báo miễn phí — với độ ưu tiên cao nhất để điện thoại kêu to như báo thức.

Cách bật:

1. Cài app **ntfy** trên điện thoại (Google Play / App Store).
2. Trong app, bấm **Subscribe to topic**, nhập đúng tên topic đang có trong `config.json` (mục `ntfy.topic`) — coi tên topic như mật khẩu, ai biết tên cũng đọc/gửi được nên đừng chia sẻ ra ngoài.
3. Vào **Settings** của app ntfy → chỉnh âm thanh/độ ưu tiên "Max priority" cho to, và bật quyền bỏ qua chế độ im lặng (Do Not Disturb) nếu điện thoại hỏi.
4. Chạy bot (`npm start`), giữ app ntfy chạy nền trên điện thoại (không cần mở màn hình).
5. Cần đã chạy `fcm-register` như trên — dùng chung FCM credentials với tính năng tự chuyển server.

Tắt tính năng: xoá hoặc để trống `ntfy.topic` trong `config.json`.

> Lưu ý: ntfy chỉ đẩy được 1 thông báo ưu tiên cao, KHÔNG lặp lại chuông liên tục như báo thức thật cho tới khi bạn tắt. Nếu cần mức "chắc chắn đánh thức dậy" hơn nữa (chuông lặp lại, phá mọi chế độ im lặng), cân nhắc đổi qua Pushover (trả phí) hoặc gọi điện thoại thật qua Twilio — có thể yêu cầu bổ sung sau.

## Chạy 24/7 (để dùng được khi bạn offline)

Bot cần một máy luôn mở để chạy nền — máy chơi game của bạn (nếu để máy mở liên tục) hoặc một VPS/máy chủ riêng nếu muốn độc lập hoàn toàn với việc bạn có mở PC hay không.

Cách đơn giản nhất trên Windows là dùng `pm2` (tự khởi động lại nếu crash, chạy ẩn không cần giữ cửa sổ terminal):

```
npm install -g pm2
pm2 start src/index.js --name rust-team-bot
pm2 save
pm2-startup install   # hoặc dùng pm2-windows-startup để tự chạy khi bật máy
```

## Giới hạn cần biết

- **Lệnh `!leader`**: Rust chỉ cho **leader hiện tại** chuyển quyền cho người khác. Bot luôn hành động bằng tài khoản Steam đã pair (acc của bạn). Nghĩa là lệnh chỉ thực hiện được khi chính bạn đang là leader trong game. Nếu leader đã chuyển sang người khác trước đó qua bot, muốn chuyển tiếp cần bạn lấy lại leader trước (bot sẽ báo lỗi rõ trong team chat nếu không chuyển được).
- **Bradley APC (tank)**: Rust+ API không có marker vị trí riêng cho Bradley (đã kiểm tra `rustplus.proto`, chỉ có Player/Explosion/VendingMachine/CH47/CargoShip/Crate/PatrolHelicopter). Bot suy luận Bradley đã bị hạ qua việc phát hiện loot crate rơi gần Launch Site — đây là cách tốt nhất hiện có qua API chính thức, không phải vị trí tank thời gian thực như heli.
- Toạ độ lưới (K15...) là tính gần đúng theo công thức lưới chuẩn 146.3m/ô của Rust, có thể lệch 1 ô so với bản đồ in-game.

## Tuỳ chỉnh

Sửa trong `config.json`:

- `afkThresholdMinutes`: số phút không di chuyển để tính là AFK (mặc định 5).
- `teamPollIntervalSeconds` / `mapPollIntervalSeconds` / `timePollIntervalSeconds`: tần suất hỏi server cho đồng đội / sự kiện map / thời gian ngày-đêm (đừng để quá thấp, Rust+ API có giới hạn số request).
- `launchSiteCrateRadius`: bán kính (mét) quanh Launch Site để tính crate là từ Bradley.
- `autoSwitchServer`: `true` (mặc định) cho bot tự bám theo server bạn pair gần nhất; đặt `false` để cố định 1 server.
- `useFacepunchProxy`: đổi thành `true` nếu kết nối trực tiếp `ip:port` bị chặn (vd do firewall), bot sẽ nối qua proxy của Facepunch.
