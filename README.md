# AirControl

AirControl is a webcam-powered gesture controller for Windows with a professional cloud dashboard. It lets you move the cursor and trigger common actions with deliberate hand gestures while keeping computer-vision processing on the local laptop.

## Current MVP

| Gesture | Action |
| --- | --- |
| Move index finger | Move cursor |
| Thumb + Pinky / Little finger | Left click |
| Thumb + Middle | Copy |
| Thumb + Ring | Paste |
| Thumb + Index | Right click |
| Open palm hold | Screenshot |

## Architecture

```text
Webcam
  ↓
Windows Agent (Python + OpenCV + MediaPipe)
  ├─ Native Windows input (local, low latency)
  └─ Socket.IO status/events
             ↓
      Render API / Socket.IO
         ↙           ↘
    MongoDB         Vercel
                    React UI
```

### Stack

- **Frontend:** React + Vite + TypeScript
- **Backend:** Node.js + Express + Socket.IO + MongoDB
- **Windows Agent:** Python + OpenCV + MediaPipe + Win32 `SendInput`
- **Frontend hosting:** Vercel
- **Backend hosting:** Render

The cloud is not in the mouse-control path. If internet goes down, local gesture control can keep working.

## 1. Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Set:

- `DASHBOARD_PASSWORD` — password used by the dashboard login
- `JWT_SECRET` — long random secret
- `AGENT_TOKEN` — shared secret used by the Windows agent
- `FRONTEND_ORIGIN` — e.g. `http://localhost:5173`
- `MONGODB_URI` — optional for development; without it, activity/settings use memory

Health check: `GET /health`.

## 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Set:

- `VITE_API_URL` — backend URL
- `VITE_DEVICE_ID` — stable name for the Windows laptop, e.g. `afnan-laptop`

## 3. Windows Agent

Python 3.11 is recommended.

```powershell
cd agent
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python main.py
```

The agent and frontend must use the same device ID. The agent token must match the backend `AGENT_TOKEN`.

## Deploy to Render

This repository includes `render.yaml`.

Create a Render Blueprint from the repo and set:

```text
DASHBOARD_PASSWORD
AGENT_TOKEN
FRONTEND_ORIGIN=https://YOUR-VERCEL-DOMAIN
MONGODB_URI=mongodb+srv://...
```

`JWT_SECRET` can be generated automatically by Render.

## Deploy to Vercel

Create a Vercel project from this repo and set **Root Directory** to:

```text
frontend
```

Environment variables:

```text
VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com
VITE_DEVICE_ID=my-laptop
```

Deploy, then update Render's `FRONTEND_ORIGIN` to the final Vercel URL.

## Safety / behavior

- AirControl does not disable the physical mouse or keyboard.
- Closing the local agent immediately stops gesture injection.
- A gesture cooldown prevents repeated click/copy/paste events.
- Open-palm screenshot requires a hold to reduce accidental screenshots.
- Camera frames stay local in the Windows agent.

## Next milestones

- Drag-and-drop gesture
- Scroll gesture
- Calibration wizard
- Windows tray app / auto-start
- Per-gesture enable/disable and remapping
- Installer packaging
- Multi-device dashboard
