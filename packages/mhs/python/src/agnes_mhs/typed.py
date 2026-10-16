"""Tool parameters from a function's signature: type hints become the input schema (MHS 6.1).

    @dev.tool(timeout=30, uses=["chassis"], motion=True)
    async def move(call: Call, x: Annotated[float, Param("meters forward", min=-2, max=2)], y: float = 0):
        \"\"\"Drive straight.\"\"\"

bool, int, float and str map to boolean, integer, number and string; Literal to an enum; list[T] to an
array; dict to an object; T | None to T. A parameter with a default is optional and the default goes
into the schema. The parameter named `call`, or annotated with Call, receives the call instead.
"""

from __future__ import annotations

import inspect
import types
import typing
from dataclasses import dataclass
from typing import Annotated, Any, Callable, Literal, Union, get_args, get_origin


@dataclass(frozen=True)
class Param:
    """What a type hint cannot say about a parameter, given as Annotated[T, Param(...)]."""

    description: str | None = None
    min: float | None = None
    max: float | None = None
    max_length: int | None = None

    def schema(self) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for key, value in (("description", self.description), ("minimum", self.min), ("maximum", self.max), ("maxLength", self.max_length)):
            if value is not None:
                out[key] = value
        return out


def type_schema(hint: Any) -> dict[str, Any]:
    """The JSON Schema of one parameter's type hint."""
    origin = get_origin(hint)
    if origin is Annotated:
        base, *extras = get_args(hint)
        schema = type_schema(base)
        for extra in extras:
            if isinstance(extra, Param):
                schema.update(extra.schema())
            elif isinstance(extra, str):
                schema["description"] = extra
        return schema
    if origin is Literal:
        values = list(get_args(hint))
        schema = {"enum": values}
        kinds = {type_schema(type(v))["type"] for v in values}
        if kinds <= {"integer", "number"}:
            schema["type"] = "integer" if kinds == {"integer"} else "number"
        elif len(kinds) == 1:
            schema["type"] = kinds.pop()
        return schema
    if origin in (Union, types.UnionType):
        rest = [a for a in get_args(hint) if a is not type(None)]
        if len(rest) == 1:
            return type_schema(rest[0])
        raise TypeError(f"a union of several types is not supported: {hint!r}")
    if origin in (list, tuple, set):
        args = get_args(hint)
        return {"type": "array", "items": type_schema(args[0])} if args else {"type": "array"}
    if hint is dict or origin is dict:
        return {"type": "object"}
    if hint is list:
        return {"type": "array"}
    simple = {bool: "boolean", int: "integer", float: "number", str: "string"}  # bool before int: bool is an int
    if hint in simple:
        return {"type": simple[hint]}
    raise TypeError(f"unsupported parameter type {hint!r}")


def signature_schema(fn: Callable[..., Any], call_type: type) -> tuple[dict[str, Any], str | None]:
    """The input schema of a tool function, and the name of its parameter that receives the call."""
    hints = typing.get_type_hints(fn, include_extras=True)
    properties: dict[str, Any] = {}
    required: list[str] = []
    call_arg = None
    for p in inspect.signature(fn).parameters.values():
        hint = hints.get(p.name)
        if p.name == "call" or hint is call_type:
            call_arg = p.name
            continue
        if p.kind in (p.VAR_POSITIONAL, p.VAR_KEYWORD):
            raise TypeError(f"{fn.__name__}: *{p.name} cannot be a tool parameter")
        if hint is None:
            raise TypeError(f"{fn.__name__}: annotate parameter {p.name}, or give params=")
        schema = type_schema(hint)
        if p.default is p.empty:
            required.append(p.name)
        elif p.default is not None:
            schema["default"] = list(p.default) if isinstance(p.default, tuple) else p.default
        properties[p.name] = schema
    out: dict[str, Any] = {"type": "object"}
    if properties:
        out["properties"] = properties
    if required:
        out["required"] = required
    return out, call_arg
