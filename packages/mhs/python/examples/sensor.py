"""The smallest device worth checking: a simulated room sensor in Agnes MHS.

    uv run python -m agnes_mhs check examples/sensor.py --profile core,perception,streaming
    uv run python -m agnes_mhs run examples/sensor.py ws://127.0.0.1:4180

It streams the air in the room (a values source) and a door contact (a switch, sent on change and at
least every 2 s), keeps its battery and a writable LED brightness in its state, and has one tool,
blink. It passes the Core, Perception and Streaming profiles of mhs-check.
"""

from __future__ import annotations

import asyncio
import math
import time
from typing import Annotated

from agnes_mhs import Call, Device, Param


def make_sensor() -> Device:
    dev = Device(
        "sensor-01",
        "sensor",
        name="Room sensor",
        model="Example Air 1",
        state={"battery": {"type": "integer", "unit": "%", "min": 0, "max": 100, "role": "battery", "alert": {"warn": 20, "bad": 10, "below": True}}},
    )
    dev.update(battery=87)

    @dev.setting(initial=50, unit="%")
    def led(value: Annotated[int, Param(min=0, max=100)]) -> int:
        """status LED brightness"""
        return value

    @dev.tool(timeout=5)
    async def blink(call: Call, times: Annotated[int, Param(min=1, max=5)]) -> str:
        """Blink the status LED to find the sensor."""
        for i in range(times):
            await call.checkpoint()
            call.progress(done=i, total=times)
            await asyncio.sleep(0.2)
        return f"blinked {times} times"

    @dev.source(
        "air", "values", "air at desk height", hz=10, default=True,
        fields={
            "temperature": {"type": "number", "unit": "°C", "min": -10, "max": 50, "role": "temperature", "of": "air", "alert": {"warn": 30, "bad": 35}},
            "humidity": {"type": "number", "unit": "%", "min": 0, "max": 100},
            "co2": {"type": "integer", "unit": "ppm", "min": 300, "max": 5000, "alert": {"warn": 1000, "bad": 1500}},
        },
    )  # fmt: skip
    def air() -> dict:
        now = time.time()
        return {
            "temperature": round(22 + math.sin(now / 60), 2),
            "humidity": round(41 + 3 * math.sin(now / 90), 1),
            "co2": int(700 + 200 * math.sin(now / 120)),
        }

    last = {"open": None, "t": 0.0}

    @dev.source("door", "switch", "door contact", fields={"open": {"type": "boolean"}})
    def door() -> dict | None:
        now = time.time()
        is_open = int(now / 20) % 3 == 0
        if is_open == last["open"] and now - last["t"] < 2:
            return None  # a switch is sent on change and at least every 2 s
        last.update(open=is_open, t=now)
        return {"open": is_open}

    return dev


dev = make_sensor()

if __name__ == "__main__":
    dev.serve()
