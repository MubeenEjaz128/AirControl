import "dotenv/config";
import cors from "cors";
import express from "express";
import http from "http";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Server } from "socket.io";

const PORT = Number(process.env.PORT || 10000);
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret";
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "aircontrol";
const AGENT_TOKEN = process.env.AGENT_TOKEN || "aircontrol-agent";
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const defaultConfig = {
  enabled: true,
  sensitivity: 1.15,
  smoothing: 0.32,
  pinchThreshold: 0.42,
  gestureCooldownMs: 450,
  screenshotHoldMs: 850,
  activeMargin: 0.08,
  mirrorCamera: true,
};

const configSchema = new mongoose.Schema(
  { deviceId: { type: String, unique: true, index: true }, config: { type: mongoose.Schema.Types.Mixed, default: defaultConfig } },
  { timestamps: true }
);
const activitySchema = new mongoose.Schema(
  { deviceId: { type: String, index: true }, type: String, gesture: String, action: String, meta: mongoose.Schema.Types.Mixed },
  { timestamps: true }
);
const DeviceConfig = mongoose.models.DeviceConfig || mongoose.model("DeviceConfig", configSchema);
const Activity = mongoose.models.Activity || mongoose.model("Activity", activitySchema);

let dbReady = false;
const memoryConfigs = new Map();
const memoryActivity = new Map();

async function connectDb() {
  if (!process.env.MONGODB_URI) return;
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    dbReady = true;
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB unavailable; using memory store:", error.message);
  }
}

async function readConfig(deviceId) {
  if (dbReady) {
    const doc = await DeviceConfig.findOne({ deviceId }).lean();
    return { ...defaultConfig, ...(doc?.config || {}) };
  }
  return { ...defaultConfig, ...(memoryConfigs.get(deviceId) || {}) };
}

async function writeConfig(deviceId, patch) {
  const next = { ...(await readConfig(deviceId)), ...patch };
  if (dbReady) {
    await DeviceConfig.findOneAndUpdate({ deviceId }, { $set: { config: next } }, { upsert: true, new: true });
  } else {
    memoryConfigs.set(deviceId, next);
  }
  return next;
}

async function addActivity(deviceId, payload) {
  const entry = {
    deviceId,
    type: payload.type || "gesture",
    gesture: payload.gesture || "",
    action: payload.action || "",
    meta: payload.meta || {},
    createdAt: new Date().toISOString(),
  };
  if (dbReady) await Activity.create(entry);
  else {
    const list = memoryActivity.get(deviceId) || [];
    list.unshift(entry);
    memoryActivity.set(deviceId, list.slice(0, 100));
  }
  return entry;
}

async function listActivity(deviceId, limit = 25) {
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  if (dbReady) return Activity.find({ deviceId }).sort({ createdAt: -1 }).limit(safeLimit).lean();
  return (memoryActivity.get(deviceId) || []).slice(0, safeLimit);
}

function makeToken() {
  return jwt.sign({ role: "dashboard" }, JWT_SECRET, { expiresIn: "12h" });
}
function verifyDashboardToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  return decoded?.role === "dashboard";
}
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  try {
    if (!token || !verifyDashboardToken(token)) throw new Error("unauthorized");
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

const app = express();
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Origin not allowed"));
  }
}));
app.use(express.json({ limit: "250kb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "aircontrol-api", db: dbReady ? "mongodb" : "memory" }));
app.post("/api/auth/login", (req, res) => {
  if (String(req.body?.password || "") !== DASHBOARD_PASSWORD) return res.status(401).json({ error: "Invalid password" });
  res.json({ token: makeToken() });
});

app.get("/api/device/:deviceId/config", authMiddleware, async (req, res) => {
  res.json({ config: await readConfig(req.params.deviceId) });
});
app.put("/api/device/:deviceId/config", authMiddleware, async (req, res) => {
  const config = await writeConfig(req.params.deviceId, req.body || {});
  io.to(`agent:${req.params.deviceId}`).emit("config:update", config);
  io.to(`dashboard:${req.params.deviceId}`).emit("config:updated", config);
  res.json({ config });
});
app.get("/api/device/:deviceId/activity", authMiddleware, async (req, res) => {
  res.json({ activity: await listActivity(req.params.deviceId, req.query.limit) });
});
app.post("/api/device/:deviceId/command", authMiddleware, (req, res) => {
  const command = { type: req.body?.type || "", payload: req.body?.payload || {} };
  io.to(`agent:${req.params.deviceId}`).emit("command", command);
  res.json({ ok: true, command });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins.includes("*") ? "*" : allowedOrigins },
  transports: ["websocket", "polling"],
});
const deviceStatus = new Map();

io.use((socket, next) => {
  const auth = socket.handshake.auth || {};
  try {
    if (auth.role === "agent") {
      if (!auth.deviceId || auth.token !== AGENT_TOKEN) throw new Error("Invalid agent auth");
      socket.data.role = "agent";
      socket.data.deviceId = String(auth.deviceId);
      return next();
    }
    if (!auth.token || !verifyDashboardToken(auth.token)) throw new Error("Invalid dashboard auth");
    socket.data.role = "dashboard";
    next();
  } catch (error) {
    next(new Error(error.message || "Unauthorized"));
  }
});

io.on("connection", async (socket) => {
  if (socket.data.role === "agent") {
    const deviceId = socket.data.deviceId;
    socket.join(`agent:${deviceId}`);
    const initial = { online: true, camera: "starting", handDetected: false, fps: 0, lastGesture: "—", updatedAt: new Date().toISOString() };
    deviceStatus.set(deviceId, initial);
    io.to(`dashboard:${deviceId}`).emit("device:status", initial);
    socket.emit("config:update", await readConfig(deviceId));

    socket.on("agent:status", (status = {}) => {
      const nextStatus = { ...(deviceStatus.get(deviceId) || {}), ...status, online: true, updatedAt: new Date().toISOString() };
      deviceStatus.set(deviceId, nextStatus);
      io.to(`dashboard:${deviceId}`).emit("device:status", nextStatus);
    });

    socket.on("gesture:event", async (event = {}) => {
      const entry = await addActivity(deviceId, event);
      io.to(`dashboard:${deviceId}`).emit("gesture:event", entry);
    });

    socket.on("disconnect", () => {
      const offline = { ...(deviceStatus.get(deviceId) || {}), online: false, updatedAt: new Date().toISOString() };
      deviceStatus.set(deviceId, offline);
      io.to(`dashboard:${deviceId}`).emit("device:status", offline);
    });
    return;
  }

  socket.on("dashboard:join", ({ deviceId } = {}) => {
    if (!deviceId) return;
    socket.join(`dashboard:${deviceId}`);
    socket.emit("device:status", deviceStatus.get(deviceId) || { online: false, camera: "offline", handDetected: false, fps: 0, lastGesture: "—" });
  });
});

await connectDb();
httpServer.listen(PORT, () => console.log(`AirControl API listening on :${PORT}`));
