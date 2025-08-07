# GwenDev_ZaloChat 🤖🇻🇳

Chatbot Zalo cá nhân được xây dựng bằng thư viện không chính thức [zca-js](https://tdung.gitbook.io/zca-js), tích hợp các tính năng tự động và chống spam, cùng với webhook thanh toán SEPay.

> 🛑 **Lưu ý:** Sử dụng `zca-js` có thể vi phạm chính sách của Zalo. Project này chỉ dùng cho mục đích học tập / nghiên cứu.

---

## 🚀 Tính năng chính

- ✅ Đăng nhập bằng Cookie + IMEI
- 🧠 Tự động:
  - Gửi tin nhắn (`AutoSend`)
  - Tải file (`AutoDown`)
  - Tính tương tác theo ngày / tuần / tháng
- 🚫 Chống spam, chống gửi link (`AntiSpam`, `AntiLink`)
- 💳 Nhận webhook thanh toán từ **SEPay**
- 📦 REST API qua Express + body-parser
- 🔧 Quản lý cấu hình qua file

---

## 📂 Cấu trúc thư mục

```
GwenDev_ZaloChat/
├── App/
│   ├── Settings.js         # IMEI, user-agent, cookie
│   ├── BotInstance.js      # Lưu phiên bản Zalo API toàn cục
│   └── Database.js         # Cấu hình MySQL (nếu dùng)
├── Auto/
│   ├── AutoDown.js         # Tự động tải
│   ├── AutoSend.js         # Tự động gửi tin nhắn
│   ├── TuongTacNgay.js     # Top tương tác trong ngày
│   ├── TuongTacTuan.js     # Top tương tác trong tuần
│   └── TuongTacThang.js    # Top tương tác trong tháng
├── Anti/
│   ├── AntiSpam.js         # Chống spam tin nhắn
│   └── AntiLink.js         # Chống gửi link
├── Routes/
│   ├── checkPaymentRouter.js
│   └── sepayWebhook.js
├── Handlers/
│   └── Core.js             # Logic xử lý event chính
├── Utils/
│   └── Logger.js           # Ghi log ra file hoặc console
├── src/                    # Tuỳ chọn thêm
├── index.js / zalo.js      # Entry point (main file)
└── README.md
```

---

## ⚙️ Cài đặt

### 1. Clone repo

```bash
git clone https://github.com/gwendevz/GwenDev_ZaloChat.git
cd GwenDev_ZaloChat
```

### 2. Cài dependencies

```bash
npm install
```

> Hoặc nếu bạn dùng `bun`:
```bash
bun install
```

---

## 🔧 Cấu hình

### `App/Settings.js`
```js
export const settings = {
  imei: "YOUR_IMEI",
  cookie: "YOUR_COOKIE_STRING",
  userAgent: "YOUR_USER_AGENT"
};
```

### `App/Cookie.json` (tuỳ chọn nếu cần tách riêng)
```json
{
  "cookie": "YOUR_COOKIE_STRING"
}
```

### `App/Database.js` (nếu dùng MySQL)
```js
module.exports = {
  host: "localhost",
  user: "your_db_user",
  password: "your_db_password",
  database: "zalo_bot_db"
}
```

---

## ▶️ Chạy bot

```bash
node zalo.js
```

---

## 🔌 Webhook & API

| Route         | Mô tả                         |
|---------------|-------------------------------|
| `/`           | Check thanh toán (SEPay)      |
| `/sepay`      | Nhận webhook từ SEPay Gateway |

---

## 📝 Ghi chú

- Dữ liệu tương tác, anti-spam, top tháng có thể mở rộng với MySQL
- `Logger.js` hỗ trợ ghi log có màu, file, theo tag (auto, error, login,...)
- Hệ thống modular dễ mở rộng cho tính năng như auto-reply theo từ khoá

---

## ⚠️ Cảnh báo

> ❗ **Không sử dụng tài khoản chính để test.**
> ❗ Zalo có thể chặn tài khoản nếu phát hiện hoạt động tự động.
> ❗ Sử dụng tại máy chủ riêng và tránh spam người khác.

---

## 📜 Giấy phép

Dự án này sử dụng license `MIT`. Bạn có thể tự do fork, chỉnh sửa, nhưng **hãy chịu trách nhiệm khi sử dụng zca-js** trong môi trường thật.

---

## 👤 Tác giả

**GwenDev**  
📬 GitHub: [gwendevz](https://github.com/gwendevz)  
💬 Dự án chatbot cá nhân cho Zalo
