# Telegram QRIS Payment Bot

Bot Telegram untuk menjual paket dengan alur:

```text
/start
Bot kirim logo + ucapan selamat datang
User pilih paket
Bot kirim QRIS static
User konfirmasi pembayaran
Admin approve atau payment gateway mengirim webhook
Bot membuat link join grup otomatis
```

Project ini memakai Cloudflare Workers, jadi tidak perlu VPS.

## Fitur

- Menu paket:
  - Preview Konten
  - Kode Senyap 100k
  - Kode Senyap Super 200k
  - Bundling All 250k
- Kirim gambar logo grup saat `/start`.
- Kirim gambar QRIS static setelah paket dipilih.
- Membuat link invite grup otomatis tanpa persetujuan admin.
- Mendukung approval manual untuk QRIS static.
- Endpoint webhook pembayaran jika payment gateway kamu menyediakan callback.

## Catatan Penting QRIS Static

QRIS static tidak otomatis memberi tahu bot bahwa user sudah membayar.

Agar link join bisa dikirim otomatis penuh, kamu butuh salah satu dari ini:

1. Payment gateway dengan API/webhook status pembayaran.
2. QRIS dynamic per transaksi.
3. Approval manual admin setelah user mengirim konfirmasi.

Template ini sudah menyediakan opsi 2 alur:

- Manual: user kirim `/konfirmasi ORDER_ID`, lalu admin klik approve.
- Otomatis: payment gateway POST ke `/payment/webhook` dengan status `PAID`.

## Persiapan Telegram

1. Jadikan bot sebagai admin di grup/channel privat.
2. Beri izin `Invite Users via Link`.
3. Ambil `GROUP_CHAT_ID`.
4. Pastikan fitur join request grup dimatikan jika kamu ingin user langsung masuk tanpa approval.

## Setup Lokal

Install dependency:

```bash
npm install
```

Buat file `.dev.vars`:

```env
BOT_TOKEN=123456:telegram-bot-token
WEBHOOK_SECRET=secret-panjang
PUBLIC_BOT_URL=https://telegram-qris-payment-bot.username.workers.dev
LOGO_URL=https://example.com/logo-grup.png
QRIS_URL=https://example.com/qris-static.png
GROUP_CHAT_ID=-1001234567890
ADMIN_IDS=123456789
PAYMENT_WEBHOOK_SECRET=secret-payment-gateway
```

Jalankan lokal:

```bash
npm run dev
```

## Deploy ke Cloudflare Workers

Login Cloudflare:

```bash
npx wrangler login
```

Set secret:

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put PUBLIC_BOT_URL
npx wrangler secret put LOGO_URL
npx wrangler secret put QRIS_URL
npx wrangler secret put GROUP_CHAT_ID
npx wrangler secret put ADMIN_IDS
npx wrangler secret put PAYMENT_WEBHOOK_SECRET
```

Deploy:

```bash
npm run deploy
```

Set webhook Telegram:

```bash
BOT_TOKEN="token_bot" PUBLIC_BOT_URL="https://worker-kamu.workers.dev" WEBHOOK_SECRET="secret-panjang" npm run set-webhook
```

## Format Webhook Payment Gateway

Jika payment gateway kamu bisa mengirim webhook, arahkan ke:

```text
https://worker-kamu.workers.dev/payment/webhook
```

Header:

```text
x-payment-secret: secret-payment-gateway
```

Body contoh:

```json
{
  "status": "PAID",
  "telegram_chat_id": 123456789,
  "order_id": "ORD-123456789-senyap_100-1710000000000"
}
```

Setelah menerima status `PAID`, bot akan membuat link join sekali pakai dan mengirimkannya ke user.
