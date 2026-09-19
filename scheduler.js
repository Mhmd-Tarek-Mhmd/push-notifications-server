import cron from "node-cron";
import { runTick } from "./tick.js";

let running = false;

export function startScheduler() {
  cron.schedule("* * * * *", () => {
    if (running) return;
    running = true;
    runTick()
      .catch((err) => console.error("[scheduler]", err?.message ?? err))
      .finally(() => {
        running = false;
      });
  });
  console.info("[scheduler] every minute");
}
