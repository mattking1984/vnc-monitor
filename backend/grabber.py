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


# Bound on how long an *incremental* capture waits for a change before
# giving up and reusing the existing (unchanged) frame. The very first
# capture on a connection always waits unbounded, since it's a genuine
# full-screen transfer that has to complete.
INCREMENTAL_CAPTURE_TIMEOUT_S = 3.0


async def _capture(client: asyncvnc.Client):
    """Requests a video update and returns the current RGBA framebuffer.

    client.screenshot() resets internal state and re-requests the entire
    screen on every call, regardless of whether anything changed — with 20+
    stations all doing that every cycle, that full-frame retransfer was the
    actual network bottleneck. Driving refresh()/read() directly instead
    lets asyncvnc's own incremental logic kick in after the first frame, so
    only changed regions get requested and transferred.
    """
    first_capture = client.video.data is None
    client.video.refresh()
    if first_capture:
        while True:
            update_type = await client.read()
            if update_type is asyncvnc.UpdateType.VIDEO and client.video.is_complete():
                break
    else:
        try:
            while True:
                update_type = await asyncio.wait_for(
                    client.read(), timeout=INCREMENTAL_CAPTURE_TIMEOUT_S
                )
                if update_type is asyncvnc.UpdateType.VIDEO and client.video.is_complete():
                    break
        except asyncio.TimeoutError:
            pass  # nothing changed since the last capture — reuse the existing frame
    return client.video.as_rgba()


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
                        capture_start = time.monotonic()
                        pixels = await _capture(client)
                        capture_s = time.monotonic() - capture_start

                        encode_start = time.monotonic()
                        state.frame_jpeg = await asyncio.to_thread(_encode_frames, pixels, quality)
                        encode_s = time.monotonic() - encode_start

                        if capture_s + encode_s > 2.0:
                            logger.warning(
                                "Station %s (%s) slow cycle: capture=%.2fs encode=%.2fs",
                                state.label, ip, capture_s, encode_s,
                            )

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
