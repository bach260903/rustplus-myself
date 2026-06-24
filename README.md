# Rust Team Bot

Bot Rust+ chạy nền (Node.js), gửi thẳng vào **team chat trong game** — không cần Discord, không cần điện thoại.

## Tính năng

- `!leader` gõ trong team chat → người gõ lệnh tự được lên leader (chỉ hoạt động khi acc Steam dùng để pair bot đang là leader hiện tại, xem phần Giới hạn).
- Tự động báo khi đồng đội AFK (không di chuyển quá X phút).
- Tự động báo vị trí khi đồng đội chết.
- Tự động báo khi Patrol Helicopter xuất hiện / bị bắn hạ / rời bản đồ, kèm toạ độ lưới (vd K15).
- Tự động báo khi Bradley APC (tank) có thể vừa bị hạ tại Launch Site.
- Tự kết nối lại khi rớt mạng, chạy được liên tục dù bạn không mở game (chỉ cần máy chạy bot vẫn mở).

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

Bot sẽ tự gửi dòng "Bot Rust+ da ket noi va san sang." vào team chat khi kết nối thành công.

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
- `teamPollIntervalSeconds` / `mapPollIntervalSeconds`: tần suất hỏi server (đừng để quá thấp, Rust+ API có giới hạn số request).
- `launchSiteCrateRadius`: bán kính (mét) quanh Launch Site để tính crate là từ Bradley.
- `useFacepunchProxy`: đổi thành `true` nếu kết nối trực tiếp `ip:port` bị chặn (vd do firewall), bot sẽ nối qua proxy của Facepunch.
