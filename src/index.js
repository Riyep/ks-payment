const PACKAGES = {
  preview: {
    title: "Preview Konten",
    price: 0,
    description: "Lihat contoh konten sebelum membeli."
  },
  senyap_100: {
    title: "Kode Senyap",
    price: 100000,
    description: "Paket Kode Senyap."
  },
  senyap_super_200: {
    title: "Kode Senyap Super",
    price: 200000,
    description: "Paket Kode Senyap Super."
  },
  bundling_250: {
    title: "Bundling All",
    price: 250000,
    description: "Semua paket dalam satu bundling."
  }
};

const PACKAGE_BUTTONS = [
  [{ text: "Preview Konten", callback_data: "package:preview" }],
  [{ text: "Kode Senyap 100k", callback_data: "package:senyap_100" }],
  [{ text: "Kode Senyap Super 200k", callback_data: "package:senyap_super_200" }],
  [{ text: "Bundling All 250k", callback_data: "package:bundling_250" }]
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return json({ ok: true, service: "telegram-qris-payment-bot" });
    }

    if (request.method === "POST" && url.pathname === `/telegram/${env.WEBHOOK_SECRET}`) {
      const update = await request.json();
      await handleTelegramUpdate(update, env);
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/payment/webhook") {
      return handlePaymentWebhook(request, env);
    }

    return json({ ok: false, error: "Not found" }, 404);
  }
};

async function handleTelegramUpdate(update, env) {
  if (update.message) {
    await handleMessage(update.message, env);
    return;
  }

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, env);
  }
}

async function handleMessage(message, env) {
  const chatId = message.chat.id;
  const text = (message.text || "").trim();

  if (text === "/start") {
    await sendWelcome(chatId, env);
    return;
  }

  if (text.startsWith("/konfirmasi")) {
    await handleManualConfirmation(message, env);
    return;
  }

  await sendMessage(chatId, "Ketik /start untuk memilih paket.", {}, env);
}

async function sendWelcome(chatId, env) {
  const caption = [
    "Selamat datang.",
    "",
    "Silahkan pilih paket:"
  ].join("\n");

  await sendPhoto(chatId, env.LOGO_URL, {
    caption,
    reply_markup: { inline_keyboard: PACKAGE_BUTTONS }
  }, env);
}

async function handleCallbackQuery(query, env) {
  const data = query.data || "";
  const chatId = query.message.chat.id;

  await answerCallbackQuery(query.id, env);

  if (data.startsWith("paid:")) {
    const [, orderId] = data.split(":");
    await sendMessage(chatId, `Baik, pembayaran untuk ${orderId} akan diperiksa.\n\nKirim juga:\n/konfirmasi ${orderId}`, {}, env);
    return;
  }

  if (data.startsWith("approve:")) {
    await handleAdminApproval(query, env);
    return;
  }

  if (!data.startsWith("package:")) {
    return;
  }

  const packageKey = data.replace("package:", "");
  const selectedPackage = PACKAGES[packageKey];

  if (!selectedPackage) {
    await sendMessage(chatId, "Paket tidak ditemukan. Silakan ketik /start lagi.", {}, env);
    return;
  }

  if (packageKey === "preview") {
    await sendMessage(chatId, "Preview konten akan dikirim di sini. Ganti teks ini dengan link preview kamu.", {}, env);
    return;
  }

  const orderId = createOrderId(chatId, packageKey);
  const caption = [
    `Paket: ${selectedPackage.title}`,
    `Harga: ${formatRupiah(selectedPackage.price)}`,
    `Order ID: ${orderId}`,
    "",
    "Silakan scan QRIS berikut.",
    "Setelah transfer, kirim:",
    `/konfirmasi ${orderId}`,
    "",
    "Catatan: QRIS static tidak bisa otomatis mendeteksi pembayaran tanpa webhook/API dari payment gateway."
  ].join("\n");

  await sendPhoto(chatId, env.QRIS_URL, {
    caption,
    reply_markup: {
      inline_keyboard: [
        [{ text: "Saya sudah bayar", callback_data: `paid:${orderId}:${packageKey}` }]
      ]
    }
  }, env);
}

async function handleManualConfirmation(message, env) {
  const chatId = message.chat.id;
  const parts = (message.text || "").split(/\s+/);
  const orderId = parts[1];

  if (!orderId) {
    await sendMessage(chatId, "Format: /konfirmasi ORDER_ID", {}, env);
    return;
  }

  const adminIds = parseAdminIds(env.ADMIN_IDS);
  if (adminIds.length === 0) {
    await sendMessage(chatId, "Konfirmasi diterima. Admin akan memeriksa pembayaran kamu.", {}, env);
    return;
  }

  const user = message.from;
  const adminText = [
    "Konfirmasi pembayaran masuk.",
    `Order ID: ${orderId}`,
    `User: ${user.first_name || "-"} ${user.last_name || ""}`.trim(),
    `Username: ${user.username ? `@${user.username}` : "-"}`,
    `Telegram ID: ${user.id}`,
    "",
    "Klik approve jika pembayaran sudah masuk."
  ].join("\n");

  await Promise.all(adminIds.map((adminId) => sendMessage(adminId, adminText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Approve dan kirim link join", callback_data: `approve:${chatId}:${orderId}` }]
      ]
    }
  }, env)));

  await sendMessage(chatId, "Konfirmasi diterima. Admin akan memeriksa pembayaran kamu.", {}, env);
}

async function handleAdminApproval(query, env) {
  const adminIds = parseAdminIds(env.ADMIN_IDS);
  const adminId = String(query.from.id);

  if (!adminIds.includes(adminId)) {
    await sendMessage(query.message.chat.id, "Hanya admin yang bisa approve pembayaran ini.", {}, env);
    return;
  }

  const [, targetChatId, orderId] = query.data.split(":");
  const inviteLink = await createInviteLink(env);

  await sendMessage(targetChatId, `Pembayaran berhasil untuk ${orderId}.\n\nLink join grup:\n${inviteLink.invite_link}`, {}, env);
  await sendMessage(query.message.chat.id, `Approved.\nLink join sudah dikirim ke user.\nOrder ID: ${orderId}`, {}, env);
}

async function handlePaymentWebhook(request, env) {
  const secret = request.headers.get("x-payment-secret");
  if (env.PAYMENT_WEBHOOK_SECRET && secret !== env.PAYMENT_WEBHOOK_SECRET) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const payload = await request.json();
  const chatId = payload.telegram_chat_id;

  if (!chatId || payload.status !== "PAID") {
    return json({ ok: true, ignored: true });
  }

  const inviteLink = await createInviteLink(env);
  await sendMessage(chatId, `Pembayaran berhasil.\n\nLink join grup:\n${inviteLink.invite_link}`, {}, env);

  return json({ ok: true });
}

async function createInviteLink(env) {
  const expireDate = Math.floor(Date.now() / 1000) + 3600;
  return telegram("createChatInviteLink", {
    chat_id: env.GROUP_CHAT_ID,
    name: `paid-${Date.now()}`,
    expire_date: expireDate,
    member_limit: 1,
    creates_join_request: false
  }, env);
}

async function sendMessage(chatId, text, extra = {}, env) {
  if (!env && extra && extra.BOT_TOKEN) {
    env = extra;
    extra = {};
  }

  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    ...extra
  }, env);
}

async function sendPhoto(chatId, photo, extra = {}, env) {
  return telegram("sendPhoto", {
    chat_id: chatId,
    photo,
    ...extra
  }, env);
}

async function answerCallbackQuery(callbackQueryId, env) {
  return telegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId
  }, env);
}

async function telegram(method, body, env) {
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const result = await response.json();
  if (!result.ok) {
    console.error(method, result);
    throw new Error(result.description || `Telegram API error on ${method}`);
  }

  return result.result;
}

function createOrderId() {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${time}-${random}`;
}

function formatRupiah(amount) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(amount);
}

function parseAdminIds(value = "") {
  return value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}
