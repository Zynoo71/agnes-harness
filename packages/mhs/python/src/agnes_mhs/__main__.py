"""Run or check a device file.

    python -m agnes_mhs run device.py [ws://host:port]   # default AGNES_HUB_URL, else ws://127.0.0.1:4180
    python -m agnes_mhs check device.py [mhs-check options]

The file is imported under its own name, not as __main__, and must define exactly one Device at
module level (or name it with --device). check starts mhs-check and points the device at it.
"""

from __future__ import annotations

import argparse
import asyncio
import importlib.util
import logging
import sys
from pathlib import Path

from . import check
from .device import Device


def load(path: str, device_id: str | None = None) -> Device:
    """The Device defined in the file at path."""
    file = Path(path).resolve()
    sys.path.insert(0, str(file.parent))  # so the file can import its neighbours
    spec = importlib.util.spec_from_file_location(file.stem, file)
    if spec is None or spec.loader is None:
        raise SystemExit(f"cannot import {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[file.stem] = module
    spec.loader.exec_module(module)
    devices = [v for v in vars(module).values() if isinstance(v, Device) and device_id in (None, v.id)]
    if len(devices) != 1:
        found = ", ".join(v.id for v in vars(module).values() if isinstance(v, Device)) or "none"
        raise SystemExit(f"{path}: expected one Device{f' with id {device_id}' if device_id else ''} at module level, found {found}")
    return devices[0]


async def check_device(dev: Device, args: argparse.Namespace) -> int:
    running = asyncio.ensure_future(dev.run(f"ws://{args.host}:{args.port}"))
    try:
        return await check.main_async(args)
    finally:
        running.cancel()
        await asyncio.gather(running, return_exceptions=True)


def main(argv: list[str] | None = None) -> None:
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) < 2 or argv[0] not in ("run", "check"):
        raise SystemExit(__doc__)
    command, path, rest = argv[0], argv[1], argv[2:]
    if command == "run":
        options = argparse.ArgumentParser(prog="python -m agnes_mhs run")
        options.add_argument("url", nargs="?")
        options.add_argument("--device")
        args = options.parse_args(rest)
        load(path, args.device).serve(args.url)
        return
    options = check.parser("python -m agnes_mhs check")
    options.add_argument("--device")
    args = options.parse_args(rest)
    dev = load(path, args.device)
    logging.basicConfig(level=logging.WARNING)
    sys.exit(asyncio.run(check_device(dev, args)))


if __name__ == "__main__":
    main()
