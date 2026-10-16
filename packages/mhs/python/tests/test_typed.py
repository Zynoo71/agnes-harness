import asyncio
from typing import Annotated, Literal

import pytest

from agnes_mhs import Call, Device, Param, is_valid
from agnes_mhs.typed import type_schema
from test_device import FakeHub


def test_type_hints_map_to_json_schema():
    assert type_schema(bool) == {"type": "boolean"}
    assert type_schema(int) == {"type": "integer"}
    assert type_schema(float) == {"type": "number"}
    assert type_schema(str) == {"type": "string"}
    assert type_schema(Literal["warm", "cold"]) == {"enum": ["warm", "cold"], "type": "string"}
    assert type_schema(Literal[1, 2.5]) == {"enum": [1, 2.5], "type": "number"}
    assert type_schema(list[int]) == {"type": "array", "items": {"type": "integer"}}
    assert type_schema(dict) == {"type": "object"}
    assert type_schema(float | None) == {"type": "number"}
    assert type_schema(Annotated[float, Param("meters", min=-2, max=2)]) == {"type": "number", "description": "meters", "minimum": -2, "maximum": 2}
    assert type_schema(Annotated[str, "what to say", Param(max_length=5)]) == {"type": "string", "description": "what to say", "maxLength": 5}
    with pytest.raises(TypeError):
        type_schema(int | str)
    with pytest.raises(TypeError):
        type_schema(bytes)


def make_typed() -> Device:
    dev = Device("dev-01", "car", mobile=True, resources={"chassis": "reject"})

    @dev.tool(timeout=5, uses=["chassis"], motion=True)
    async def move(call: Call, x: Annotated[float, Param("meters forward", min=-2, max=2)], y: float = 0) -> str:
        """Drive straight."""
        call.progress(done=0, total=x)
        return f"moved {x} {y}"

    @dev.tool(timeout=2)
    def tone(kind: Literal["warm", "cold"] = "warm", times: list[int] | None = None) -> dict:
        """Set the light's tone."""
        return {"detail": f"{kind} {times}"}

    @dev.tool("Report the call id.", timeout=2, name="whoami")
    def who(c: Call) -> str:
        return c.id

    return dev


def test_tools_declared_from_signatures():
    tools = {t["name"]: t for t in make_typed().description()["tools"]}
    assert tools["move"]["description"] == "Drive straight."
    assert tools["move"]["inputSchema"] == {
        "type": "object",
        "properties": {"x": {"type": "number", "description": "meters forward", "minimum": -2, "maximum": 2}, "y": {"type": "number", "default": 0}},
        "required": ["x"],
    }
    assert tools["tone"]["inputSchema"] == {
        "type": "object",
        "properties": {"kind": {"enum": ["warm", "cold"], "type": "string", "default": "warm"}, "times": {"type": "array", "items": {"type": "integer"}}},
    }
    assert tools["whoami"]["inputSchema"] == {"type": "object"}
    assert is_valid("RegisterParams", make_typed().description())


def test_a_tool_needs_a_description_and_annotations():
    dev = Device("d", "car")
    with pytest.raises(TypeError, match="docstring"):
        dev.tool(timeout=1)(lambda: None)
    with pytest.raises(TypeError, match="annotate parameter x"):

        @dev.tool(timeout=1)
        def bad(x):
            """No type."""


def test_typed_tools_get_checked_arguments_and_the_call_only_when_asked():
    async def main() -> None:
        hub = FakeHub()
        url = await hub.start()
        dev = make_typed()
        task = asyncio.ensure_future(dev.run(url))
        try:
            await asyncio.wait_for(hub.registered.wait(), 5)
            rid, reply = await hub.call("move", {"x": 5})
            assert reply == {"accepted": True}
            result = await hub.result(rid)
            assert result["status"] == "done" and result["detail"] == "moved 2 0"
            assert "x was 5, clamped to 2" in result["notes"]
            rid, _ = await hub.call("tone", {})
            assert (await hub.result(rid))["detail"] == "warm None"
            _, reply = await hub.call("tone", {"kind": "hot"})
            assert reply["reason"] == "invalid"
            rid, _ = await hub.call("whoami", {})
            assert (await hub.result(rid))["detail"] == rid
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            hub.server.close()

    asyncio.run(main())
