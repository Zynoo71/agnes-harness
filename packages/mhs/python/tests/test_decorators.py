import asyncio
from typing import Annotated, Any

import pytest

from agnes_mhs import Device, Param, is_valid
from test_device import FakeHub


def make_decorated() -> tuple[Device, dict[str, Any]]:
    seen: dict[str, Any] = {"stops": 0, "ticks": 0}
    dev = Device("dev-01", "lamp")

    @dev.setting(initial=50, unit="%")
    def brightness(value: Annotated[int, Param(min=0, max=80)]) -> int:
        """LED brightness."""
        seen["brightness"] = value
        return value

    @dev.source("air", "values", "air at the desk", hz=10, fields={"t": {"type": "number", "unit": "°C"}})
    def air() -> dict:
        return {"t": 21.5}

    @dev.source("cam", "image", "front camera", mime="image/png", hz=5)
    async def cam() -> tuple[dict, bytes] | None:
        return None  # nothing to send yet

    @dev.hook
    def on_stop() -> None:
        seen["stops"] += 1

    @dev.background
    async def tick() -> None:
        while True:
            seen["ticks"] += 1
            await asyncio.sleep(0.01)

    @dev.tool(timeout=1)
    def ping() -> str:
        """Answer."""
        return "pong"

    return dev, seen


def test_a_setting_declares_a_writable_state_field():
    dev, _ = make_decorated()
    desc = dev.description()
    assert is_valid("RegisterParams", desc)
    assert desc["state"]["brightness"] == {"type": "integer", "writable": True, "min": 0, "max": 80, "description": "LED brightness.", "unit": "%"}
    assert dev.state["brightness"] == 50


def test_hook_names_and_setting_signatures_are_checked():
    dev = Device("d", "lamp")
    with pytest.raises(TypeError, match="not a hook"):
        dev.hook(lambda: None)
    with pytest.raises(TypeError, match="exactly one annotated parameter"):
        dev.setting()(lambda value: value)


def test_samplers_settings_hooks_and_background_run_with_the_device(monkeypatch):
    async def main() -> None:
        hub = FakeHub()
        monkeypatch.setenv("AGNES_HUB_URL", await hub.start())
        dev, seen = make_decorated()
        task = asyncio.ensure_future(dev.run())  # the address comes from AGNES_HUB_URL
        try:
            await asyncio.wait_for(hub.registered.wait(), 5)
            msg = await hub.expect(hub.nerve_in, lambda m: isinstance(m, dict) and m.get("source") == "air")
            assert msg["data"] == {"t": 21.5}
            assert not any(isinstance(m, dict) and m.get("source") == "cam" for m in hub.nerve_in)
            reply = await hub.request("mhs/set", {"values": {"brightness": 95}})
            assert reply["values"] == {"brightness": 80} and seen["brightness"] == 80
            await hub.request("mhs/stop", {})
            assert seen["stops"] == 1
            assert seen["ticks"] > 0
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            hub.server.close()
        ticks = seen["ticks"]
        await asyncio.sleep(0.05)
        assert seen["ticks"] == ticks  # the background task ended with the device

    asyncio.run(main())
