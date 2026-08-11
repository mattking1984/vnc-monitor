# VNC Monitor — Project Handover

## What this is
A classroom monitoring dashboard. A teacher Pi runs a Python backend that connects to student Raspberry Pi 5s via VNC (WayVNC), grabs a JPEG frame from each every 2-3 seconds, and serves them via FastAPI. A React frontend displays all screens in a tiled grid with click-to-fullscreen.

## Repo
Clone from GitHub — Matt knows the URL.

## Project structure
```
vnc-monitor/
├── backend/
│   ├── __init__.py
│   ├── config.py       # loads config.json
│   ├── grabber.py      # async per-host VNC frame grabber
│   └── main.py         # FastAPI app
├── frontend/
│   └── src/
│       ├── App.js      # full React app (grid, fullscreen, settings modal)
│       └── App.css     # dark/light theme via CSS variables
├── desktop-shortcuts/
│   ├── classroom-monitor.desktop   # double-click to start on Pi
│   └── stop-monitor.desktop        # double-click to stop on Pi
├── config.json         # station list — edit this to add/remove Pis
├── requirements.txt
├── start.bat           # Windows dev launcher (not needed on Mac)
└── start_pi.sh         # Pi launcher (superseded by .desktop files)
```

## Tech stack
- **Backend:** Python 3.11+, FastAPI, uvicorn, asyncvnc, Pillow
- **Frontend:** React (Create React App), plain CSS, no component library

## Key architectural decisions
- asyncvnc keyed by **index** not IP so duplicate IPs work (used for testing with fewer physical machines)
- `client.video.refresh()` must be called before every `client.screenshot()` — required for TigerVNC compatibility, harmless with WayVNC
- Backend endpoints: `GET /stations`, `GET /frame/{idx}`, `GET /config`, `POST /config`
- POST /config writes config.json AND hot-restarts the grabber — no backend restart needed after settings change
- Frontend polls /stations every 3s for status, each tile polls /frame/{idx} independently

## Frontend features
- Responsive tiled grid — auto-calculates cols/rows to fill viewport
- View selector: 2, 4, 8, 10, 12, All — with station picker chips when subset selected
- Click any tile → fullscreen modal (Esc to close)
- Dark/light mode toggle
- Settings modal: add/remove/reorder stations, change IPs, VNC port, password, poll interval, JPEG quality

## Mac dev setup
```bash
cd ~/Documents/VNCviewer   # or wherever you cloned it

# Backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (separate terminal)
cd frontend
npm install
npm start
# opens http://localhost:3000
```

## Pi deployment (teacher Pi)
- Pi is at raspberrypi.local on the local network
- SSH: `ssh teacher@raspberrypi.local`
- Project lives at `~/vnc-monitor`
- Venv at `~/vnc-monitor/venv`
- Frontend is served as a static build via `python3 -m http.server 3000 --directory frontend/build`
- Desktop shortcuts on Pi desktop start/stop everything

## Deploying updates to the Pi
After making and committing changes on the Mac:
```bash
# On Mac — push changes
git push

# On Pi — pull and rebuild
ssh teacher@raspberrypi.local
cd ~/vnc-monitor
git pull
source venv/bin/activate
pip install -r requirements.txt   # only if requirements changed
cd frontend && npm ci && npm run build   # only if frontend changed
cd ..
# then restart via the desktop shortcut
```

## Current config.json
- Station 1: 192.168.1.65 (Windows test PC / TigerVNC)
- Stations 2-16: 192.168.1.136 (Pi test machine, duplicated)
- School network will be 10.0.0.x — update config.json via the Settings modal in the UI
- VNC port: 5900, no password, poll interval: 2s, JPEG quality: 70

## Known issues / open items
- asyncvnc + TigerVNC requires `client.video.refresh()` before screenshot — already fixed in grabber.py
- School network IPs (10.0.0.x) not yet configured — do this via Settings modal once in the lab
- No authentication on the FastAPI backend — fine for a local school network
- WayVNC on student Pis may need a password — add it to config.json vnc_password field if so
