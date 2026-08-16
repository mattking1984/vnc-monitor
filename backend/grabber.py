import asyncio
import io
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

import asyncvnc
from PIL import Image

logger = logging.getLogger(__name__)

# Cap each variant's dimensions (aspect-preserving) rather than always
# encoding at native capture resolution — grid tiles never render anywhere
# near full size, and even the fullscreen view rarely needs more than 720p.
FRAME_SIZES = {
    "thumb": (480, 270),
    "medium": (960, 540),
    "full": (1280, 720),
}


def _encode_frames(pixels, quality: int) -> dict:
    """Runs off the event loop thread — PIL's JPEG encoder is CPU-bound and
    releases the GIL during the C-level work, so threading this lets
    multiple stations' encodes actually overlap across CPU cores."""
    img = Image.fromarray(pixels[:, :, :3])
    frames = {}
    for name, max_size in FRAME_SIZES.items():
        variant = img.copy()
        variant.thumbnail(max_size, Image.LANCZOS)
        buf = io.BytesIO()
        variant.save(buf, format="JPEG", quality=quality)
        frames[name] = buf.getvalue()
    return frames


@dataclass
class StationState:
    label: str
    ip: str
    frame_jpeg: dict = field(default_factory=dict)
    last_update: float = 0.0
    error: Optional[str] = None
    online: bool = False


class Grabber:
    def __init__(self, config: dict):
        self._cfg = config
        # Key by index so duplicate IPs (used for dev/testing) all get their own slot
        self._states: dict[int, StationState] = {
            i: StationState(label=s["label"], ip=s["ip"])
            for i, s in enumerate(config["stations"])
        }
        self._tasks: list[asyncio.Task] = []

    def get_states(self) -> list[StationState]:
        return list(self._states.values())

    def get_state(self, idx: int) -> Optional[StationState]:
        return self._states.get(idx)

    async def start(self):
        for idx in self._states:
            task = asyncio.create_task(self._poll_loop(idx), name=f"grab-{idx}")
            self._tasks.append(task)

    async def stop(self):
        for t in self._tasks:
            t.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)

    async def _poll_loop(self, idx: int):
        port = self._cfg["vnc_port"]
        password = self._cfg.get("vnc_password") or None
        interval = self._cfg["poll_interval"]
        quality = self._cfg["jpeg_quality"]
        state = self._states[idx]
        ip = state.ip

        while True:
            try:
                kwargs = {}
                if password:
                    kwargs["password"] = password
                async with asyncvnc.connect(ip, port, **kwargs) as client:
                    state.error = None
                    while True:
                        client.video.refresh()
                        await asyncio.sleep(0.5)
                        pixels = await client.screenshot()
                        state.frame_jpeg = await asyncio.to_thread(_encode_frames, pixels, quality)
                        state.last_update = time.time()
                        state.online = True
                        await asyncio.sleep(interval)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                state.online = False
                state.error = str(exc)
                logger.warning("Station %s (%s) error: %s", state.label, ip, exc)
                await asyncio.sleep(interval)
