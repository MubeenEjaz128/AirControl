import {
  Activity,
  Camera,
  Check,
  Copy,
  Crosshair,
  Gauge,
  Hand,
  LogOut,
  MonitorUp,
  MousePointer2,
  Power,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Wifi,
  WifiOff,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Socket } from "socket.io-client";
import { DEVICE_ID, connectSocket, request } from "./api";

type Config = {
  enabled: boolean;
  sensitivity: number;
  smoothing: number;
  pinchThreshold: number;
  gestureCooldownMs: number;
  screenshotHoldMs: number;
  activeMargin: number;
  mirrorCamera: boolean;
};

type DeviceStatus = {
  online: boolean;
  camera: string;
  handDetected: boolean;
  fps: number;
  lastGesture: string;
  updatedAt?: string;
};

type ActivityItem = {
  _id?: string;
  createdAt?: string;
  type?: string;
  gesture?: string;
  action?: string;
};

const fallbackConfig: Config = {
  enabled: true,
  sensitivity: 1.15,
  smoothing: 0.32,
  pinchThreshold: 0.42,
  gestureCooldownMs: 450,
  screenshotHoldMs: 850,
  activeMargin: 0.08,
  mirrorCamera: true,
};

const gestures = [
  ["Index move", "Cursor", MousePointer2],
  ["Thumb + Index", "Left click", Crosshair],
  ["Thumb + Middle", "Copy", Copy],
  ["Thumb + Ring", "Paste", Copy],
  ["Thumb + Pinky", "Right click", MousePointer2],
  ["Open palm hold", "Screenshot", MonitorUp],
] as const;

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("aircontrol_token"));
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [tab, setTab] = useState("overview");
  const [config, setConfig] = useState<Config>(fallbackConfig);
  const [status, setStatus] = useState<DeviceStatus>({
    online: false,
    camera: "offline",
    handDetected: false,
    fps: 0,
    lastGesture: "—",
  });
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const statusLabel = status.online ? "Agent connected" : "Agent offline";

  useEffect(() => {
    if (!token) return;
    let socket: Socket | undefined;
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const [configRes, activityRes] = await Promise.all([
          request<{ config: Config }>(`/api/device/${DEVICE_ID}/config`, {}, token),
          request<{ activity: ActivityItem[] }>(`/api/device/${DEVICE_ID}/activity?limit=30`, {}, token),
        ]);
        if (cancelled) return;

        setConfig(configRes.config);
        setActivity(activityRes.activity);

        socket = connectSocket(token);
        socket.emit("dashboard:join", { deviceId: DEVICE_ID });
        socket.on("device:status", (next: DeviceStatus) => setStatus(next));
        socket.on("config:updated", (next: Config) => setConfig(next));
        socket.on("gesture:event", (item: ActivityItem) => {
          setActivity((prev) => [item, ...prev].slice(0, 40));
        });
      } catch (error) {
        if ((error as Error).message === "Unauthorized") logout();
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [token]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
    try {
      const result = await request<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      localStorage.setItem("aircontrol_token", result.token);
      setToken(result.token);
    } catch (error) {
      setAuthError((error as Error).message);
    }
  }

  function logout() {
    localStorage.removeItem("aircontrol_token");
    setToken(null);
  }

  async function saveConfig(next = config) {
    if (!token) return;
    setSaving(true);
    try {
      const result = await request<{ config: Config }>(
        `/api/device/${DEVICE_ID}/config`,
        { method: "PUT", body: JSON.stringify(next) },
        token
      );
      setConfig(result.config);
      showToast("Settings synced to agent");
    } catch (error) {
      showToast((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function togglePower() {
    const next = { ...config, enabled: !config.enabled };
    setConfig(next);
    await saveConfig(next);
  }

  async function sendCommand(type: string) {
    if (!token) return;
    try {
      await request(
        `/api/device/${DEVICE_ID}/command`,
        { method: "POST", body: JSON.stringify({ type }) },
        token
      );
      showToast(type === "recalibrate" ? "Calibration reset sent" : "Command sent");
    } catch (error) {
      showToast((error as Error).message);
    }
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  const lastSeen = useMemo(() => {
    if (!status.updatedAt) return "No heartbeat";
    return new Date(status.updatedAt).toLocaleTimeString();
  }, [status.updatedAt]);

  if (!token) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand-mark"><Hand size={26} /></div>
          <p className="eyebrow">AIRCONTROL</p>
          <h1>Control your PC<br />with a gesture.</h1>
          <p className="muted">Sign in to your private AirControl dashboard.</p>
          <form onSubmit={login}>
            <label>Dashboard password</label>
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
            {authError && <p className="error">{authError}</p>}
            <button className="primary wide" type="submit">Open dashboard</button>
          </form>
          <div className="secure-note"><ShieldCheck size={16} /> Gesture processing stays on your laptop.</div>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark small"><Hand size={20} /></div>
          <div><strong>AirControl</strong><span>Gesture OS</span></div>
        </div>

        <nav>
          {[
            ["overview", Gauge, "Overview"],
            ["gestures", Hand, "Gestures"],
            ["settings", SlidersHorizontal, "Tuning"],
            ["activity", Activity, "Activity"],
          ].map(([id, Icon, label]) => (
            <button key={String(id)} className={tab === id ? "active" : ""} onClick={() => setTab(String(id))}>
              <Icon size={18} /> {String(label)}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className={status.online ? "agent-state online" : "agent-state"}>
            {status.online ? <Wifi size={16} /> : <WifiOff size={16} />}
            <div><strong>{statusLabel}</strong><span>{DEVICE_ID}</span></div>
          </div>
          <button className="logout" onClick={logout}><LogOut size={17} /> Sign out</button>
        </div>
      </aside>

      <main className="main">
        <header>
          <div>
            <p className="eyebrow">DEVICE / {DEVICE_ID.toUpperCase()}</p>
            <h2>{tab === "overview" ? "Command center" : tab.charAt(0).toUpperCase() + tab.slice(1)}</h2>
          </div>
          <div className="header-actions">
            <span className={status.online ? "connection-pill online" : "connection-pill"}>
              <span className="dot" /> {statusLabel}
            </span>
            <button className={config.enabled ? "power on" : "power"} onClick={togglePower}>
              <Power size={17} /> {config.enabled ? "Control on" : "Control off"}
            </button>
          </div>
        </header>

        {tab === "overview" && (
          <>
            <section className="hero-panel">
              <div>
                <span className="live-chip"><span className="pulse" /> LIVE INPUT</span>
                <h3>{status.handDetected ? "Hand detected." : "Show your hand to the camera."}</h3>
                <p>Your webcam is processed locally. Cloud sync only carries settings, status and gesture events.</p>
                <div className="hero-actions">
                  <button className="primary" onClick={() => sendCommand("recalibrate")}><RefreshCw size={17} /> Recalibrate</button>
                  <button className="secondary" onClick={() => setTab("gestures")}><Settings2 size={17} /> View gestures</button>
                </div>
              </div>
              <div className="hand-orb">
                <div className="ring ring-1" /><div className="ring ring-2" />
                <Hand size={88} strokeWidth={1.25} />
                <span>{status.lastGesture || "Waiting"}</span>
              </div>
            </section>

            <section className="metrics">
              <Metric icon={Camera} label="Camera" value={status.camera || "offline"} good={status.camera === "active"} />
              <Metric icon={Hand} label="Hand tracking" value={status.handDetected ? "Detected" : "Waiting"} good={status.handDetected} />
              <Metric icon={Gauge} label="Tracking speed" value={`${Math.round(status.fps || 0)} FPS`} good={(status.fps || 0) > 15} />
              <Metric icon={Wifi} label="Last heartbeat" value={lastSeen} good={status.online} />
            </section>

            <section className="grid-two">
              <div className="panel">
                <PanelTitle title="Gesture shortcuts" subtitle="Current MVP mapping" />
                <div className="mini-gestures">
                  {gestures.slice(0, 4).map(([gesture, action, Icon]) => (
                    <div key={gesture}><Icon size={18} /><span>{gesture}</span><strong>{action}</strong></div>
                  ))}
                </div>
              </div>
              <div className="panel">
                <PanelTitle title="Recent activity" subtitle="Latest recognized commands" />
                <ActivityList items={activity.slice(0, 5)} />
              </div>
            </section>
          </>
        )}

        {tab === "gestures" && (
          <section className="panel page-panel">
            <PanelTitle title="Gesture mapping" subtitle="Six deliberate gestures designed to avoid accidental commands." />
            <div className="gesture-grid">
              {gestures.map(([gesture, action, Icon], index) => (
                <article className="gesture-card" key={gesture}>
                  <span className="gesture-number">{String(index + 1).padStart(2, "0")}</span>
                  <div className="gesture-icon"><Icon size={25} /></div>
                  <div><h4>{action}</h4><p>{gesture}</p></div>
                  <span className="ready"><Check size={14} /> Ready</span>
                </article>
              ))}
            </div>
            <div className="info-strip"><ShieldCheck size={18} /> Gesture actions are generated locally by the Windows agent using native Windows input events.</div>
          </section>
        )}

        {tab === "settings" && (
          <section className="panel page-panel">
            <PanelTitle title="Tracking & gesture tuning" subtitle="Tune AirControl for your camera distance, lighting and hand movement." />
            <div className="settings-grid">
              <RangeRow label="Cursor sensitivity" value={config.sensitivity} min={0.5} max={2.5} step={0.05}
                detail="Higher values move the cursor farther."
                onChange={(v) => setConfig({ ...config, sensitivity: v })} />
              <RangeRow label="Cursor smoothing" value={config.smoothing} min={0.05} max={0.8} step={0.01}
                detail="Higher values react faster; lower values feel steadier."
                onChange={(v) => setConfig({ ...config, smoothing: v })} />
              <RangeRow label="Pinch threshold" value={config.pinchThreshold} min={0.2} max={0.75} step={0.01}
                detail="Distance required to recognize finger pinches."
                onChange={(v) => setConfig({ ...config, pinchThreshold: v })} />
              <RangeRow label="Gesture cooldown" value={config.gestureCooldownMs} min={150} max={1200} step={25}
                detail="Prevents duplicate clicks and shortcuts."
                suffix=" ms" onChange={(v) => setConfig({ ...config, gestureCooldownMs: v })} />
              <RangeRow label="Screenshot hold" value={config.screenshotHoldMs} min={400} max={1800} step={50}
                detail="How long an open palm must be held."
                suffix=" ms" onChange={(v) => setConfig({ ...config, screenshotHoldMs: v })} />
            </div>

            <div className="setting-toggle">
              <div><strong>Mirror camera</strong><span>Natural mirror-style movement for the cursor.</span></div>
              <button className={config.mirrorCamera ? "switch active" : "switch"} onClick={() => setConfig({ ...config, mirrorCamera: !config.mirrorCamera })}>
                <span />
              </button>
            </div>

            <button className="primary save" onClick={() => saveConfig()} disabled={saving}>
              <Save size={17} /> {saving ? "Saving…" : "Save & sync settings"}
            </button>
          </section>
        )}

        {tab === "activity" && (
          <section className="panel page-panel">
            <PanelTitle title="Gesture activity" subtitle="Recent recognized commands from this device." />
            <ActivityList items={activity} full />
          </section>
        )}
      </main>

      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
    </div>
  );
}

type IconComponent = typeof Camera;

function Metric({ icon: Icon, label, value, good }: { icon: IconComponent; label: string; value: string; good: boolean }) {
  return (
    <article className="metric">
      <div className="metric-icon"><Icon size={19} /></div>
      <div><span>{label}</span><strong>{value}</strong></div>
      <i className={good ? "health good" : "health"} />
    </article>
  );
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="panel-title"><div><h3>{title}</h3><p>{subtitle}</p></div></div>;
}

function ActivityList({ items, full = false }: { items: ActivityItem[]; full?: boolean }) {
  if (!items.length) return <div className="empty-state"><Activity size={22} /><p>No gesture events yet.</p></div>;

  return (
    <div className={full ? "activity-list full" : "activity-list"}>
      {items.map((item, i) => (
        <div className="activity-row" key={item._id || `${item.createdAt}-${i}`}>
          <span className="activity-dot" />
          <div><strong>{item.action || "Gesture detected"}</strong><span>{item.gesture || item.type || "gesture"}</span></div>
          <time>{item.createdAt ? new Date(item.createdAt).toLocaleTimeString() : "now"}</time>
        </div>
      ))}
    </div>
  );
}

function RangeRow(props: {
  label: string;
  detail: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="range-row">
      <div><strong>{props.label}</strong><span>{props.detail}</span></div>
      <div className="range-control">
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={props.step}
          value={props.value}
          onChange={(e) => props.onChange(Number(e.target.value))}
        />
        <output>{props.value}{props.suffix || ""}</output>
      </div>
    </label>
  );
}
