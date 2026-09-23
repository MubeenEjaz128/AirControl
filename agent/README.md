# AirControl Windows Agent

The agent performs all webcam processing and Windows input locally.

## Requirements

- Windows 10/11
- Python 3.11 recommended
- Built-in or USB webcam

## Setup

```powershell
cd agent
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env` so `AIRCONTROL_API`, `AIRCONTROL_DEVICE_ID`, and `AIRCONTROL_AGENT_TOKEN` match the deployed backend.

Run:

```powershell
python main.py
```

Press **Q** or **Esc** in the preview window to stop.

The agent continues local gesture control if the cloud connection drops.
