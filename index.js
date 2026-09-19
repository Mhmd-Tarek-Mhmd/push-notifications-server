import dotenv from "dotenv";
dotenv.config({ path: new URL(".env", import.meta.url) });

import express from "express";

import {
  handleDeleteSubscriptions,
  handleHealth,
  handlePostSubscriptions,
  handlePostTestPush,
  handleStatus,
} from "./routes.js";
import { configureSender } from "./sender.js";
import { startScheduler } from "./scheduler.js";

const app = express();
app.use(express.json({ limit: "16kb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.get("/health", handleHealth);
app.get("/api/status", handleStatus);
app.post("/api/subscriptions", handlePostSubscriptions);
app.delete("/api/subscriptions", handleDeleteSubscriptions);
app.post("/api/test-push", handlePostTestPush);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  const ready = configureSender();
  startScheduler();
  console.info(`[push] listening on :${port} (vapid: ${ready ? "ok" : "missing"})`);
});
