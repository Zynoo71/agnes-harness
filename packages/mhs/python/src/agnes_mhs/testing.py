"""An in-process hub for testing a device without AgnesHub.

    async with TestHub(dev) as hub:
        result = await hub.call("move", x=0.5)
        assert result.status == "done"
        assert (await hub.set(speed=0.3))["values"] == {"speed": 0.3}
        reading = await hub.read("air")

It runs the device against a local hub on a free port and checks every registration, result and
state report the device sends against the schema; a message that does not validate raises.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any

from websockets.asyncio.server import ServerConnection, serve

from .device import SUBPROTOCOL, Device
from .schema import errors


@dataclass
class Result:
    """How a call ended: a rejection, or the device's mhs/result."""

    status: str
    detail: str = ""
    reason: str | None = None
    data: Any = None
    notes: list[str] = field(default_factory=list)
    after: dict[str, Any] | None = None


@dataclass
class Reading:
    """One Nerve data message, with the binary frame that followed it."""

    source: str
    data: dict[str, Any]
    t: float
    binary: bytes | None = None


class TestHub:
    __test__ = False  # not a pytest test class

    def __init__(self, device: Device, timeout: float = 5.0):
        self.device = device
        self.timeout = timeout
        self.description: dict[str, Any] = {}
        self.state: dict[str, Any] = {}
        self.progress: list[dict[str, Any]] = []
        self._cmd: ServerConnection | None = None
        self._results: dict[str, asyncio.Future] = {}
        self._replies: dict[str, asyncio.Future] = {}
        self._readings: dict[str, asyncio.Queue] = {}
        self._registered = asyncio.Event()
        self._nerve_up = asyncio.Event()
        self._next = 0

    async def __aenter__(self) -> TestHub:
        self._server = await serve(self._handler, "127.0.0.1", 0, subprotocols=[SUBPROTOCOL], max_size=None)
        port = self._server.sockets[0].getsockname()[1]
        self._task = asyncio.ensure_future(self.device.run(f"ws://127.0.0.1:{port}"))
        await asyncio.wait_for(self._registered.wait(), self.timeout)
        if self.device._needs_nerve():
            await asyncio.wait_for(self._nerve_up.wait(), self.timeout)
        return self

    async def __aexit__(self, *exc: Any) -> None:
        self._task.cancel()
        await asyncio.gather(self._task, return_exceptions=True)
        self._server.close()
        await self._server.wait_closed()

    # What a test does

    async def call(self, name: str, /, **arguments: Any) -> Result:
        """Calls a tool and waits for its result; a rejected call is a Result with status rejected."""
        call_id, _ = await self._call(name, arguments)
        return await self.result(call_id)

    async def start(self, name: str, /, **arguments: Any) -> str:
        """Starts a call and returns its id without waiting for the result. Raises if rejected."""
        call_id, reply = await self._call(name, arguments)
        if not reply.get("accepted"):
            raise AssertionError(f"{name} was rejected: {reply.get('reason')} {reply.get('detail')}")
        return call_id

    async def result(self, call_id: str) -> Result:
        """Waits for the result of a call."""
        params = await asyncio.wait_for(self._results[call_id], self.timeout)
        return Result(params["status"], params.get("detail", ""), params.get("reason"), params.get("data"), params.get("notes", []), params.get("after"))

    async def set(self, **values: Any) -> dict[str, Any]:
        """Sets writable state fields; returns the device's reply (values, notes, refused)."""
        return await self.request("mhs/set", {"values": values})

    async def stop(self) -> dict[str, Any]:
        return await self.request("mhs/stop", {})

    async def cancel(self, call_id: str) -> dict[str, Any]:
        return await self.request("mhs/cancel", {"call": call_id})

    async def read(self, source: str) -> Reading:
        """Waits for the next message of a source."""
        return await asyncio.wait_for(self._queue(source).get(), self.timeout)

    async def request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        """Sends any hub request on the command channel and returns the result."""
        self._next += 1
        rid = f"t{self._next}"
        reply = await self._send(rid, method, params)
        if "error" in reply:
            raise AssertionError(f"{method} failed: {reply['error']}")
        return reply["result"]

    # The hub side

    async def _call(self, name: str, arguments: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        self._next += 1
        call_id = f"c{self._next}"
        self._results[call_id] = asyncio.get_running_loop().create_future()
        reply = (await self._send(call_id, "mhs/call", {"name": name, "arguments": arguments}))["result"]
        if not reply.get("accepted"):
            self._results[call_id].set_result(reply)
        return call_id, reply

    async def _send(self, rid: str, method: str, params: dict[str, Any]) -> dict[str, Any]:
        reply = self._replies[rid] = asyncio.get_running_loop().create_future()
        try:
            await self._cmd.send(json.dumps({"jsonrpc": "2.0", "id": rid, "method": method, "params": params}))
            return await asyncio.wait_for(reply, self.timeout)
        finally:
            self._replies.pop(rid, None)

    def _queue(self, source: str) -> asyncio.Queue:
        return self._readings.setdefault(source, asyncio.Queue())

    @staticmethod
    def _check(definition: str, value: Any) -> None:
        problems = errors(definition, value)
        if problems:
            raise AssertionError(f"invalid {definition}: {problems}")

    async def _handler(self, ws: ServerConnection) -> None:
        if ws.request.path == "/ws/mhs":
            await self._command(ws)
        else:
            await self._nerve(ws)

    async def _command(self, ws: ServerConnection) -> None:
        register = json.loads(await ws.recv())
        self._check("RegisterParams", register["params"])
        self.description = register["params"]
        self._cmd = ws
        await ws.send(json.dumps({"jsonrpc": "2.0", "id": register["id"], "result": {"session": "test", "hub": {"name": "agnes_mhs.testing", "version": "1"}, "time": 0}}))
        self._registered.set()
        async for raw in ws:
            msg = json.loads(raw)
            method, params = msg.get("method"), msg.get("params", {})
            if method is None and msg.get("id") in self._replies:
                self._replies[msg["id"]].set_result(msg)
            elif method == "mhs/result":
                self._check("ResultParams", params)
                self._results[params["call"]].set_result(params)
            elif method == "mhs/state":
                self._check("StateParams", params)
                self.state.update(params["values"])
            elif method == "mhs/progress":
                self.progress.append(params)

    async def _nerve(self, ws: ServerConnection) -> None:
        await ws.recv()  # hello
        self._nerve_up.set()
        pending: dict[str, Any] | None = None
        async for raw in ws:
            if isinstance(raw, bytes):
                if pending is not None:
                    self._queue(pending["source"]).put_nowait(Reading(pending["source"], pending["data"], pending["t"], raw))
                pending = None
                continue
            msg = json.loads(raw)
            if msg.get("type") != "data":
                continue
            if msg.get("bin"):
                pending = msg
            else:
                self._queue(msg["source"]).put_nowait(Reading(msg["source"], msg["data"], msg["t"]))
