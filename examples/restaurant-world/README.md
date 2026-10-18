# Restaurant world: Agnes Restaurant

A modern Chinese restaurant with a robot front of house and an open kitchen, full of virtual MHS devices, for demos of Agnes driving devices through MHS. No hardware is needed. You are the guest, alone or with a party of up to eight, perhaps with a small child: you say what you want in AGH, in plain words, and the brain runs the sixteen devices that seat you, cook, serve, look after the child, bill and clear. To play it from AGH, follow the [restaurant guide](../../docs/guide/restaurant-world.md); this page is the reference for the world and its devices.

```sh
pnpm --filter @agnes/restaurant-world start   # fetches assets, starts a hub and the world, opens the browser
```

`start` runs the dev hub of `@agnes/mhs` on `127.0.0.1:4180` (type `help` in that terminal to call devices by hand) and serves the world on `http://127.0.0.1:4200/?hub=ws://127.0.0.1:4180`. `pnpm --filter @agnes/restaurant-world dev` serves the world alone.

## One world at a time

The restaurant and the [Mars world](../mars-world/README.md) use the same ports: the world on 4200, AgnesHub on 4180. Run one of them at a time against an Agnes:

1. Close the other world's page and stop its `dev` (or `start`).
2. Serve this one: `pnpm --filter @agnes/restaurant-world dev`, and open `http://127.0.0.1:4200/?hub=ws://127.0.0.1:4180` once.
3. Start a new conversation; devices of the other world that are no longer connected show as offline.

## In the page

The restaurant is drawn as in a management game: an orthographic view from the south-east, the near walls cut away. Drag to move, the wheel to zoom. The Agnes mark is on the signboard by the door, in gold before the name, on the host robot's chest and on the runner's base.

- **Follow camera.** Like a broadcast camera at a football match, the view keeps its way round and glides across and in or out so every device at work stays in frame with where it is heading; a device stays in frame 5 s after its call ends, and with nothing at work, or work all over the room, it shows the whole room (`src/director.ts`). `T` turns it off and on; a number key, the wheel or a drag takes the view by hand; `?track=0`, `?shot=` or `?view=` starts without it.
- **Fixed views.** Keys `1`–`9`: the overview, the door and cashier, the dining room, the round table, the kitchen, the pass, the drinks bar, the window tables and the private room. `?shot=<name>` picks one (see `src/shots.ts`); `?view=x,y,span` frames any plan point with `span` metres of floor. Close views tag only the devices they are about.
- **Minimap.** Top right: the floor plan (x east, y north, metres from the south-west corner) with the walls, counters, the tables coloured by their status (free, reserved, the guest's, needs clearing), the guest and their party, and every device where it is now (the moving robots in orange with their heading). `M` toggles it; `?minimap=0` hides it.
- **Who is at work.** While a device runs a call, a ring breathes on the floor under it, in its caller's colour (Jev green, the LLM blue, anyone else warm white); a robot sent somewhere shows the way it still has to go, dashed on the floor in the same colour, with a small ring where it ends, gone once it arrives (its trips home show none). The tags of devices with nothing to do and nothing wrong step back, smaller and fainter, so the busy ones stand out. When the runner sets dishes on the table, their names float over it for a few seconds ("✓ Kung Pao chicken served") and steam rises from the hot ones; a payment that goes through shows over the table the same way. The rings and routes are drawn in the main view only, never in a device's camera.
- **The guest's cards.** On the right, what the guest would see on their table's screen: the menu while menu-01 has it open (prices, spice, house specials, vegetarian dishes, allergens, sold-out dishes struck through; `C` shows or hides it), the guest's table with each order line's stage (ordered, cooking, plating, at the pass, on the way, served; cancelled struck through), what else is on the table and the running total, and the bill once pos-01 makes it, with the discount and a QR code to scan; once paid, "Thank you — see you again!". The QR code only looks like one, unless a `gift.json` sits next to the page (kept out of git): `{ "url": "https://…/#", "codes": ["…"] }` makes each bill's QR code open that url with a code no earlier bill in this browser showed and the total (`#CODE-TOTAL`), going round again once every code has been shown.
- **What is going on.** In English or Chinese (the button in the bar, or `?lang=zh`): the bar along the bottom shows where the guest is and how long they have sat, their table, how busy the kitchen is, and the room's lights, music and temperature; a device's tag shows the tool it runs, a progress bar and who called it, and turns amber or red at an alert, a failure or a refusal; the host robot's `say` shows as a speech bubble over it; in its own column on the left, the activity list, a chat of every call and alert since the page opened (up to 300, the newest at the bottom), each a card with its time, caller and device (marked with its emoji) above what it did and what it was about (the words said, the dishes ordered), in large type on an opaque ground so it reads when Agnes shows the page scaled down, folded away with `A`; banners at the top for an alarm or a failed call. `E` opens the controls panel, `?` the About card (it opens by itself on a first visit).
- **Reset.** With a hub, the Reset button (bottom right) or `R` first asks who comes in next: how many (one to eight, the guest included) and whether one is a small child; `?party=4&kid=1` sets the first party. Then it puts the restaurant back as the page started it, without reloading, so the devices stay connected: every running call ends `interrupted` / `stop` as on `mhs/stop`; the robots go home, dishes and supplies leave the tables, spills dry up, the orders, bill and sold-out dishes are cleared, table 2 is booked again, the lights, music and air go back to warm, guzheng and 24 °C (the private room's music off), and the guest walks in from the street again with the new party behind them. Reset is a control of this page, not part of any device.
- **The party.** Whoever came with the guest walks in behind them, sits in the seats nearest theirs once the host has seated the guest, and leaves with them. A small child stands beside the guest until a baby chair is served there, then sits on it; a balloon served at the table floats tied by the child's place, and the child beams; an emoji over the child shows when they cry or laugh.
- **Sound.** The 🔈 button in the bar turns the speakers on (browsers allow sound only after a click): while room-01 or room-02 plays the birthday song, the page plays its melody at that room's volume.
- `L` toggles the device tags. `?quality=high|balanced|low` trades sharpness for frame rate. Frames run at up to 60 a second, the shadows following the robots at 30; `?fps=30` halves the work on a slow machine. `?stats` adds draw calls, triangles and JavaScript time per frame to the bar.

## The restaurant

The street and the door are at the south. Inside: the children's play area in the south-west corner (a slide, a ball pit and a mat, behind a low fence), the waiting area west of the door, the cashier and a fish tank east of it, five tables in the dining room, the private room in the east end with its sliding door, and along the north the low wall with the dish return, the pass under its heat lamps and the drinks bar. Behind it are the kitchen and the bar's back shelves. The floor map (`restaurant`) names the places a device can be sent to or pointed at: `door`, `waiting-area`, `cashier`, `pass`, `bar`, `supplies`, `dish-return` and the tables `t1`–`t6`; it also marks out the `dining-room`, the `private-room`, the `play-area` and the `kitchen` as areas. host-01 refuses a table with fewer seats than the party.

| Table | Where | Seats |
| --- | --- | --- |
| `t1`, `t2` | By the window (`t2` is booked by someone else at the start) | 2 |
| `t3`, `t4` | Long tables in the middle | 4 |
| `t5` | The round table on its red rug | 6 |
| `t6` | The round table in the private room | 8 |

## Live devices

| Device | What it does | Tools |
| --- | --- | --- |
| `host-01` | The host robot at the door. The guest walks in a few seconds after the page opens, with their party; its state says how many came and whether one is a small child. The host leads them to a table big enough and, once they have paid and the child is back, to the door | `seat_guest(table)`, `see_off()`, `say(text)` |
| `floor-01` | The floor plan and the tables' status: free, reserved, occupied, needs clearing | `set_table(table, free \| reserved)` |
| `menu-01` | The menu on the guest's screen and the orders. One order line per portion (`o1`, `o2`, …), with a note such as "less spicy"; a line is cancelled only before anyone starts it | `show_menu(open?)`, `order(items[{dish, qty?, note?}])`, `cancel(item)`, `hurry(item)`, `report_problem(item, problem)` |
| `prep-01` | The prep robot: takes the ingredients of the kitchen's lines from the cold store, washes and cuts them at the prep counter, and sets each bowl beside the wok or the stove, every waiting line in one trip | `prep(item?)` |
| `wok-01` | Stir-fries and braises, one line at a time; hurried lines go twice as fast | `cook(item?)` |
| `stove-01` | Steams and boils: fish, dumplings, noodles, soup, rice | `cook(item?)` |
| `arm-01` | The kitchen arm: takes a finished dish from the wok or the stove and sets it on the pass | `plate(item?)` |
| `bar-01` | The bar robot: drinks and desserts, set on the bar counter | `make(item?)` |
| `runner-01` | The runner robot: collects up to three things from the pass, the bar and the supplies cabinet, nearest first, serves them at the guest's table, and clears tables to the dish return. Battery | `deliver(items?)`, `clear(table?, items?)` |
| `supplies-01` | Napkins, chopsticks, bowls, spoons, cups, takeaway boxes, a baby chair, and balloons as the house's little gift for a small child; the result names each (`s1`, `s2`, …) for the runner | `dispense(item, qty)`, `restock()` |
| `cleaner-01` | Scrubs a spill off the floor, and wipes a table once nothing is left on it | `clean(place)` |
| `room-01` | The dining room's lights (bright, warm, dim, party), music (guzheng, jazz, pop, the birthday song, off) with a settable `volume`, and the air conditioning; reports the air's temperature, and whether it is day or evening outside | `set_lights(scene)`, `play_music(track, volume?)`, `set_temperature(celsius)` |
| `room-02` | The same for the private room, its lantern over table 6 showing the lighting scene; its music starts off | `set_lights(scene)`, `play_music(track, volume?)`, `set_temperature(celsius)` |
| `play-01` | The play robot in the play area: walks the small child from the table to play and back, and reports how `upset` the child is (crying at 4 or more); each game calms them | `take_child()`, `play(slide \| bubbles \| blocks)`, `bring_back()` |
| `pos-01` | The payment terminal: the bill on the guest's screen, with its discount and reason (up to 50 % as a courtesy, up to 100 % only for a dish with a problem), single lines on the house at ¥0 (a dish with a problem, or the birthday cake on a birthday) and how the guest pays (QR code, card or cash), and the payment; a bill of nothing is on the house | `bill(percent, comp?, reason?, method?)`, `charge()` |
| `cam-01` | A ceiling camera in the south-east corner; stills for the model and live video for people | `look_at(place)` |

The menu has seventeen dishes (`src/menu.ts`), each made at one station: five from the wok, five from the steamer and stove, seven drinks and desserts from the bar, among them a birthday cake with candles. A dish made at the wrong station is refused with the station that makes it.

**An order line's way.** `order` → `prep` (not for bar items) → `cook` at its station (or `make` at the bar) → `plate` onto the pass (not for bar items) → `deliver` → at the end `bill`, `charge`, `see_off`, `clear` and `clean`. Every step refuses with a reason when the line is not where it should be (`x_not_prepped`, `x_not_waiting`, `x_not_ready`, `x_wrong_station`), and `see_off` refuses until the bill is paid and the child is back from the play area. The prep robot, a station, the arm and the runner given no line take what is waiting, so the line moves on with no ids to pass, and the DM can take those steps. The bill needs its discount decided, even if it is 0, so only the LLM makes it, when the guest asks; payment and the see-off can only follow it.

## Conditions

The controls panel (`E`) brings about trouble a device then reports:

| Condition | What happens | Who handles it |
| --- | --- | --- |
| A hair in the guest's latest dish | a hair shows on the dish and on the table card; the bill may now take more than 50 % off | the brain apologises, has it made again, takes it off the bill or makes the meal free |
| Sea bass sold out | menu-01 lists it as sold out and refuses orders for it | menu-01, the brain suggests something else |
| Napkins run out | supplies-01 has none left | `supplies-01 restock` |
| The guest knocks over their tea | a spill by the guest's table | `cleaner-01 clean` |
| The room gets hot | the air conditioning fails for a minute and the room warms to over 27 °C (warning) | `room-01 set_temperature` once it is back |
| Evening falls | it gets dark outside and the dining room darker | `room-01 set_lights bright` |
| The small child starts crying | with a child in the party: play-01's `upset` goes to 8 (alert), 😭 over the child | `play-01 take_child`, then `play` |

Scripts reach the world in the page as `window.restaurant` (`world.service`, `world.conditions`, `reset()`, `view.set({x, y, span})`). `node tools/play.mjs <scenario.json> <out-dir> [page] [hub]` plays a list of device calls and screenshots against a page and a hub, for checking chains without a model.

## DM and LLM

Agnes's DM (`packages/mhs/server/hub-api.md` section 15.5) can take a step in the LLM's place after a device result and hands the rest to the LLM; it is switched per conversation in Agnes's composer. It learns where it is from the description of the floor map that floor-01 declares, so switching worlds needs no restart. The page shows who acted, as the Mars world does: each tag and line in the activity list carries Jev (the DM, green, a bolt) or LLM (blue, a speech bubble); a step the DM left to the LLM gets a line of its own; any line the DM decided opens to show the result it read and the four likeliest actions; each call shows how long it was thought over and how long the device took; two rows above the list share out the decisions and the time.
