const required = ["BOT_TOKEN", "PUBLIC_BOT_URL", "WEBHOOK_SECRET"];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing ${key}. Jalankan dengan environment variable yang lengkap.`);
    process.exit(1);
  }
}

const webhookUrl = `${process.env.PUBLIC_BOT_URL.replace(/\/$/, "")}/telegram/${process.env.WEBHOOK_SECRET}`;
const apiUrl = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/setWebhook`;

const response = await fetch(apiUrl, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    allowed_updates: ["message", "callback_query"]
  })
});

const result = await response.json();
console.log(JSON.stringify(result, null, 2));
