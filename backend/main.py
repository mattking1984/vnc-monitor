import asyncio
import json
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import load_config
from .grabber import Grabber

_grabber: Grabber | None = None
_config_path: str = "config.json"


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _grabber, _config_path
    _config_path = os.environ.get("CONFIG_PATH", "config.json")
    cfg = load_config(_config_path)
    _grabber = Grabber(cfg)
    await _grabber.start()
    yield
    await _grabber.stop()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/stations")
def list_stations():
    states = _grabber.get_states()
    return [
        {
            "idx": i,
            "label": s.label,
            "ip": s.ip,
            "online": s.online,
            "last_update": s.last_update,
            "error": s.error,
        }
        for i, s in enumerate(states)
    ]


@app.get("/frame/{idx}")
def get_frame(idx: int):
    state = _grabber.get_state(idx)
    if state is None:
        raise HTTPException(status_code=404, detail="Station not found")
    if not state.frame_jpeg:
        raise HTTPException(status_code=503, detail="No frame available")
    return Response(
        content=state.frame_jpeg,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/config")
def get_config():
    with open(_config_path) as f:
        return json.load(f)


class StationEntry(BaseModel):
    label: str
    ip: str


class ConfigPayload(BaseModel):
    stations: list[StationEntry]
    vnc_port: int = 5900
    vnc_password: str = ""
    poll_interval: float = 3.0
    jpeg_quality: int = 70


@app.post("/config")
async def save_config(payload: ConfigPayload):
    global _grabber
    data = payload.model_dump()
    with open(_config_path, "w") as f:
        json.dump(data, f, indent=2)
    # Restart the grabber with the new config
    await _grabber.stop()
    _grabber = Grabber(data)
    await _grabber.start()
    return {"ok": True}
