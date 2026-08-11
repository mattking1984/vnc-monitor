import json
import os

DEFAULT_CONFIG = {
    "stations": [
        {"label": "Station 1", "ip": "10.0.0.2"},
        {"label": "Station 2", "ip": "10.0.0.3"},
    ],
    "vnc_port": 5900,
    "vnc_password": "",
    "poll_interval": 3.0,
    "jpeg_quality": 70,
}

_config = None


def load_config(path: str = "config.json") -> dict:
    global _config
    if not os.path.exists(path):
        _config = DEFAULT_CONFIG.copy()
        return _config
    with open(path) as f:
        data = json.load(f)
    _config = {**DEFAULT_CONFIG, **data}
    return _config


def get_config() -> dict:
    if _config is None:
        return load_config()
    return _config
