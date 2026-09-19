import {
  addOneShot,
  allSubscriptions,
  deleteOneShot,
  deleteSubscription,
  getDueOneShots,
  getSubscription,
  getTimingsCache,
  markSent,
  prune,
  setTimingsCache,
  wasSent,
} from "./store.js";
import {
  PRAYERS,
  dayKeyInZone,
  fetchTimings,
  spotKey,
  windowMarks,
  zonedAt,
} from "./timings.js";
import { sendPush } from "./sender.js";

const DUE_WINDOW_MS = 45000;
const HISN_CATEGORY_URL = "/#hisn/27";

async function timingsFor(sub, now) {
  const spot = spotKey(sub.lat, sub.lng);
  const day = dayKeyInZone(sub.timezone, now);
  const cached = await getTimingsCache(spot, day);
  if (cached?.timings) return { timings: cached.timings, meta: cached.meta, day };
  const data = await fetchTimings(sub.lat, sub.lng, sub.timezone, now);
  if (!data?.timings) throw new Error("Aladhan returned no timings");
  await setTimingsCache(spot, day, { timings: data.timings, meta: data.meta });
  return { timings: data.timings, meta: data.meta, day };
}

function prayerTargets(timings, timeZone, ymd, nowMs) {
  const targets = [];
  for (const prayer of PRAYERS) {
    const at = timings[prayer.key]
      ? zonedAt(timings[prayer.key], timeZone, ymd)
      : null;
    if (at != null && Math.abs(nowMs - at) <= DUE_WINDOW_MS) {
      targets.push({
        kind: "prayer",
        key: prayer.key,
        title: `حان الآن وقت صلاة ${prayer.label}`,
        body: "تقبل الله منا ومنكم",
        tag: `prayer-${prayer.key}`,
        url: "/",
      });
    }
  }
  return targets;
}

function hisnTargets(timings, timeZone, ymd, nowMs) {
  const windows = [
    {
      marks: windowMarks(timings.Fajr, timings.Sunrise, timeZone, ymd),
      title: "أذكار الصباح",
      body: "حان وقت أذكار الصباح — اضغط للقراءة",
      tagPrefix: "hisn-sabah",
    },
    {
      marks: windowMarks(timings.Asr, timings.Maghrib, timeZone, ymd),
      title: "أذكار المساء",
      body: "حان وقت أذكار المساء — اضغط للقراءة",
      tagPrefix: "hisn-masa",
    },
  ];
  const targets = [];
  for (const window of windows) {
    for (const at of window.marks) {
      if (Math.abs(nowMs - at) <= DUE_WINDOW_MS) {
        targets.push({
          kind: "hisn",
          key: `${window.tagPrefix}-${at}`,
          title: window.title,
          body: window.body,
          tag: `${window.tagPrefix}-${at}`,
          url: HISN_CATEGORY_URL,
        });
      }
    }
  }
  return targets;
}

async function runOneShots(nowMs, now, stats) {
  for (const shot of await getDueOneShots(nowMs)) {
    if (shot.fire_at < nowMs - 10 * 60 * 1000) {
      await deleteOneShot(shot.endpoint, shot.tag);
      continue;
    }
    const sub = await getSubscription(shot.endpoint);
    if (!sub) {
      await deleteOneShot(shot.endpoint, shot.tag);
      continue;
    }
    const day = dayKeyInZone(sub.timezone || "UTC", now);
    if (await wasSent(sub.endpoint, day, "oneshot", shot.tag)) {
      await deleteOneShot(shot.endpoint, shot.tag);
      continue;
    }
    const result = await sendPush(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      { title: shot.title, body: shot.body, tag: shot.tag, url: shot.url },
      { urgency: "high", ttl: 300 },
    );
    if (result.ok) {
      await markSent(sub.endpoint, day, "oneshot", shot.tag);
      await deleteOneShot(shot.endpoint, shot.tag);
      stats.sent += 1;
    } else if (result.reason === "gone") {
      await deleteSubscription(sub.endpoint);
      await deleteOneShot(shot.endpoint, shot.tag);
    } else {
      stats.failed += 1;
    }
  }
}

export async function runTick() {
  const stats = { checked: 0, sent: 0, failed: 0 };
  const nowMs = Date.now();
  const now = new Date(nowMs);
  await prune();
  await runOneShots(nowMs, now, stats);
  for (const sub of await allSubscriptions()) {
    if (!sub.timezone || sub.lat == null || sub.lng == null) continue;
    if (!sub.prayer && !sub.hisn) continue;
    stats.checked += 1;
    let day, timings, meta;
    try {
      ({ timings, meta, day } = await timingsFor(sub, now));
    } catch (err) {
      stats.failed += 1;
      console.error("[scheduler] timings failed:", err?.message ?? err);
      continue;
    }
    const timeZone = meta?.timezone || sub.timezone;
    const ymd = dayKeyInZone(timeZone, now);
    const targets = [
      ...(sub.prayer ? prayerTargets(timings, timeZone, ymd, nowMs) : []),
      ...(sub.hisn ? hisnTargets(timings, timeZone, ymd, nowMs) : []),
    ];
    for (const target of targets) {
      if (await wasSent(sub.endpoint, day, target.kind, target.key)) continue;
      const result = await sendPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        {
          title: target.title,
          body: target.body,
          tag: target.tag,
          url: target.url,
        },
        target.kind === "prayer"
          ? { urgency: "high", ttl: 1800 }
          : { urgency: "normal", ttl: 1500 },
      );
      if (result.ok) {
        stats.sent += 1;
        await markSent(sub.endpoint, day, target.kind, target.key);
      } else if (result.reason === "gone") {
        await deleteSubscription(sub.endpoint);
      } else {
        stats.failed += 1;
        console.error("[scheduler] send failed:", result.reason);
      }
    }
  }
  return stats;
}
