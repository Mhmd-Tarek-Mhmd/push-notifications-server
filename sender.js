import webPush from "web-push";

let configured = false;

export function configureSender() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("[push] VAPID keys missing — pushes will fail.");
    return false;
  }
  webPush.setVapidDetails(
    VAPID_SUBJECT || "mailto:admin@example.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
  configured = true;
  return true;
}

export async function sendPush(
  subscription,
  payload,
  { urgency = "normal", ttl = 1800 } = {},
) {
  if (!configured) return { ok: false, reason: "no-vapid" };
  try {
    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      { TTL: ttl, urgency },
    );
    return { ok: true };
  } catch (err) {
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      return { ok: false, reason: "gone" };
    }
    console.error("[push] send failed:", err?.statusCode, err?.message);
    return { ok: false, reason: "failed" };
  }
}
