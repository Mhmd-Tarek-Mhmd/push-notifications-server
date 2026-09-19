import {
  addOneShot,
  allSubscriptions,
  deleteSubscription,
  getSubscription,
  upsertSubscription,
} from "./store.js";
import { sendPush } from "./sender.js";

function bad(res, message) {
  res.status(400).json({ ok: false, error: message });
}

export async function handleHealth(req, res) {
  res.json({ ok: true });
}

export async function handleStatus(req, res) {
  const subs = await allSubscriptions();
  res.json({
    ok: true,
    subscriptions: subs.length,
    devices: subs.map((s) => ({
      timezone: s.timezone,
      prayer: s.prayer,
      hisn: s.hisn,
    })),
  });
}

export async function handlePostSubscriptions(req, res) {
  const { subscription, timezone, lat, lng, prayer, hisn } = req.body ?? {};
  if (
    !subscription?.endpoint ||
    !subscription?.keys?.p256dh ||
    !subscription?.keys?.auth
  ) {
    bad(res, "subscription with endpoint and keys is required");
    return;
  }
  await upsertSubscription({
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    timezone: timezone ?? null,
    lat: Number.isFinite(Number(lat)) ? Number(lat) : null,
    lng: Number.isFinite(Number(lng)) ? Number(lng) : null,
    prayer: Boolean(prayer),
    hisn: Boolean(hisn),
  });
  res.json({ ok: true, stored: true, timezone: timezone ?? "UTC" });
}

export async function handleDeleteSubscriptions(req, res) {
  const endpoint = req.body?.endpoint ?? req.query?.endpoint;
  if (!endpoint) {
    bad(res, "endpoint is required");
    return;
  }
  await deleteSubscription(endpoint);
  res.json({ ok: true });
}

export async function handlePostTestPush(req, res) {
  const { endpoint, delaySec } = req.body ?? {};
  if (!endpoint) {
    bad(res, "endpoint is required");
    return;
  }
  const sub = await getSubscription(endpoint);
  if (!sub) {
    res.status(404).json({ ok: false, error: "unknown subscription" });
    return;
  }
  if (delaySec) {
    const delay = Math.min(Math.max(Number(delaySec) || 60, 5), 3600);
    const fire_at = Date.now() + delay * 1000;
    await addOneShot({
      endpoint,
      tag: `servertest-${fire_at}`,
      title: "تنبيه تجريبي من الخادم",
      body: "وصلتك من الخلفية — أغلق التطبيق وستصلك التنبيهات",
      url: "/",
      fire_at,
    });
    return res.json({ ok: true, fire_at, queued: true });
  }
  const result = await sendPush(
    { endpoint, p256dh: sub.p256dh, auth: sub.auth },
    {
      title: "تنبيه تجريبي من الخادم",
      body: "وصلتك من الخلفية — أغلق التطبيق وستصلك التنبيهات",
      tag: `servertest-${Date.now()}`,
      url: "/",
    },
    { urgency: "high", ttl: 300 },
  );
  if (result.ok) return res.json({ ok: true, sent: true });
  res.status(502).json({ ok: false, error: result.reason ?? "push failed" });
}
