# Restaurant world: Agnes Restaurant

A restaurant with a robot front of house and an open kitchen, full of virtual MHS devices, for demos of Agnes driving devices through MHS. You are the guest: you talk to the restaurant in AGH, and the brain runs the devices that seat you, cook, serve and clear.

```sh
pnpm --filter @agnes/restaurant-world start   # starts a hub and the world, opens the browser
```

`start` runs the dev hub of `@agnes/mhs` on `127.0.0.1:4180` and serves the world on `http://127.0.0.1:4200/?hub=ws://127.0.0.1:4180`; `pnpm --filter @agnes/restaurant-world dev` serves the world alone. Only one world runs at a time: the Mars world uses the same ports.
