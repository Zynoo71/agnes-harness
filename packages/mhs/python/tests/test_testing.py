import asyncio
import socket
import subprocess
import sys
import textwrap

from agnes_mhs.testing import TestHub
from kit import make_device


def test_test_hub_calls_sets_reads_and_stops():
    async def main() -> None:
        dev, seen = make_device(per_meter=5.0)
        producing = asyncio.ensure_future(seen["produce"]())
        try:
            async with TestHub(dev) as hub:
                assert hub.description["device"]["id"] == "dev-01"
                said = await hub.call("say", text="hello world")
                assert said.status == "done" and said.notes == ["text was truncated to 5 characters"]
                assert (await hub.call("move")).status == "rejected"
                assert (await hub.set(speed=3))["values"] == {"speed": 1}
                await asyncio.sleep(0.05)  # the state report follows the reply
                assert hub.state["speed"] == 1
                picture = await hub.read("cam")
                assert picture.data == {"w": 4, "h": 4} and picture.binary.startswith(b"\x89PNG")
                moving = await hub.start("move", x=1)
                await hub.stop()
                stopped = await hub.result(moving)
                assert stopped.status == "interrupted" and stopped.reason == "stop"
        finally:
            producing.cancel()

    asyncio.run(main())


DEVICE = """
from typing import Annotated
from agnes_mhs import Device, Param

dev = Device("lamp-01", "lamp", name="Lamp")

@dev.tool(timeout=2)
def blink(times: Annotated[int, Param(min=1, max=3)] = 1) -> str:
    \"\"\"Blink the lamp.\"\"\"
    return f"blinked {times} times"
"""


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_the_cli_checks_a_device_file(tmp_path):
    path = tmp_path / "lamp.py"
    path.write_text(textwrap.dedent(DEVICE))
    args = ["check", str(path), "--profile", "core", "--port", str(free_port()), "--wait", "10", "--replace-wait", "2"]
    done = subprocess.run([sys.executable, "-m", "agnes_mhs", *args], capture_output=True, text=True, timeout=120)
    assert done.returncode == 0, done.stdout + done.stderr
    assert " fail" not in done.stdout.split("\n")[-2]


def test_the_first_state_report_carries_null_values():
    async def main() -> None:
        from agnes_mhs import Device

        dev = Device("probe-01", "sensor", state={"level": {"type": "integer"}, "label": {"type": "string"}})
        dev.update(level=None, label="a")
        async with TestHub(dev) as hub:
            await asyncio.sleep(0.05)  # the state report follows the registration
            assert hub.state["level"] is None and hub.state["label"] == "a"

    asyncio.run(main())


def test_a_tool_argument_may_be_called_name():
    async def main() -> None:
        from agnes_mhs import Device

        dev = Device("probe-01", "sensor")

        @dev.tool(timeout=2)
        def greet(name: str) -> str:
            """Greet someone."""
            return f"hello {name}"

        async with TestHub(dev) as hub:
            assert (await hub.call("greet", name="Ada")).detail == "hello Ada"

    asyncio.run(main())
