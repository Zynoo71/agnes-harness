# Restaurant world: Agnes Restaurant

A modern Chinese restaurant with a robot front of house and an open kitchen, full of virtual MHS devices, for demos of Agnes driving devices through MHS. No hardware is needed. You are the one guest: you say what you want in AGH, in plain words, and the brain runs the thirteen devices that seat you, cook, serve, bill and clear. To play it from AGH, follow the [restaurant guide](../../docs/guide/restaurant-world.md); this page is the reference for the world and its devices.

```sh
pnpm --filter @agnes/restaurant-world start   # fetches assets, starts a hub and the world, opens the browser
```

`start` runs the dev hub of `@agnes/mhs` on `127.0.0.1:4180` (type `help` in that terminal to call devices by hand) and serves the world on `http://127.0.0.1:4200/?hub=ws://127.0.0.1:4180`. `pnpm --filter @agnes/restaurant-world dev` serves the world alone.

## One world at a time

The restaurant and the [Mars world](../mars-world/README.md) use the same ports: the world on 4200, AgnesHub on 4180. Run one of them at a time against an Agnes:

1. Close the other world's page and stop its `dev` (or `start`).
2. Serve this one: `pnpm --filter @agnes/restaurant-world dev`, and open `http://127.0.0.1:4200/?hub=ws://127.0.0.1:4180` once.
3. If the DM is configured, point `AGNES_DM_SCENE` at this world's scene file, `examples/restaurant-world/dm-scene.md`, and restart Agnes: AgnesHub reads the file when it starts. The DM then knows it serves a restaurant, not a base on Mars.
4. Start a new conversation; devices of the other world that are no longer connected show as offline.

## In the page

The restaurant is drawn as in a management game: an orthographic view from the south-east, the near walls cut away. Drag to move, the wheel to zoom.

- **Fixed views.** Keys `1`–`9`: the overview, the door and cashier, the dining room, the round table, the kitchen, the pass, the drinks bar, the window tables and the robots' corner. `?shot=<name>` picks one (see `src/shots.ts`); `?view=x,y,span` frames any plan point with `span` metres of floor. Close views tag only the devices they are about.
- **Minimap.** Top right: the floor plan (x east, y north, metres from the south-west corner) with the walls, counters, the tables coloured by their status (free, reserved, the guest's, needs clearing), the guest, and every device where it is now (the moving robots in orange with their heading). `M` toggles it; `?minimap=0` hides it.
- **The guest's cards.** On the right, what the guest would see on their table's screen: the menu while menu-01 has it open (prices, spice, house specials, vegetarian dishes, allergens, sold-out dishes struck through; `C` shows or hides it), the guest's table with each order line's stage (ordered, cooking, plating, at the pass, on the way, served; cancelled struck through), what else is on the table and the running total, and the bill once pos-01 makes it, with the discount and a QR code to scan; once paid, "Thank you — see you again!".
- **What is going on.** In English or Chinese (the button in the bar, or `?lang=zh`): the bar along the bottom shows where the guest is and how long they have sat, their table, how busy the kitchen is, and the room's lights, music and temperature; a device's tag shows the tool it runs, a progress bar and who called it, and turns amber or red at an alert, a failure or a refusal; the host robot's `say` shows as a speech bubble over it; bottom left, the last eight calls and alerts with what each was about (the words said, the dishes ordered); banners at the top for an alarm or a failed call. `E` opens the controls panel, `?` the About card (it opens by itself on a first visit).
- **Picture in picture.** With a hub, the main view stays where it is, and a frame in the top-left corner shows the device that just started a call: from its own camera (cam-01), else from a camera that keeps beside it, following a robot as it moves. It shows the ceiling camera until the first call and holds each device at least 8 s. `P` toggles it; `?pip=0` starts with it off.
- **Reset.** With a hub, the Reset button (bottom right) or `R` puts the restaurant back as the page started it, without reloading, so the devices stay connected: every running call ends `interrupted` / `stop` as on `mhs/stop`; the robots go home, dishes and supplies leave the tables, spills dry up, the orders, bill and sold-out dishes are cleared, table 2 is booked again, the lights, music and air go back to warm, guzheng and 24 °C, and the guest walks in from the street again. Reset is a control of this page, not part of any device.
- `L` toggles the device tags. `?quality=high|balanced|low` trades sharpness for frame rate. Frames are capped at 30 a second; `?fps=60` lifts the cap. `?stats` adds draw calls, triangles and JavaScript time per frame to the bar.

## The restaurant

The street and the door are at the south. Inside: the waiting area west of the door, the cashier and a fish tank east of it, six tables in the dining room, and along the north the low wall with the dish return, the pass under its heat lamps and the drinks bar. Behind it are the kitchen and the bar's back shelves. The floor map (`restaurant`) names the places a device can be sent to or pointed at: `door`, `waiting-area`, `cashier`, `pass`, `bar`, `supplies`, `dish-return` and the tables `t1`–`t6`; it also marks out the `dining-room` and the `kitchen` as areas.

| Table | Where | Seats |
| --- | --- | --- |
| `t1`, `t2` | By the window (`t2` is booked by someone else at the start) | 2 |
| `t3`, `t4` | Long tables in the middle | 4 |
| `t5` | The round table on its red rug | 6 |
| `t6` | A booth by the bar | 4 |

## Live devices

| Device | What it does | Tools |
| --- | --- | --- |
| `host-01` | The host robot at the door. The guest walks in a few seconds after the page opens; the host leads them to a table and, once they have paid, back to the door | `seat_guest(table)`, `see_off()`, `say(text)` |
| `floor-01` | The floor plan and the tables' status: free, reserved, occupied, needs clearing | `set_table(table, free \| reserved)` |
| `menu-01` | The menu on the guest's screen and the orders. One order line per portion (`o1`, `o2`, …), with a note such as "less spicy"; a line is cancelled only before anyone starts it | `show_menu(open?)`, `order(items[{dish, qty?, note?}])`, `cancel(item)`, `hurry(item)` |
| `wok-01` | Stir-fries and braises, one line at a time; hurried lines go twice as fast | `cook(item?)` |
| `stove-01` | Steams and boils: fish, dumplings, noodles, soup, rice | `cook(item?)` |
| `arm-01` | The kitchen arm: takes a finished dish from the wok or the stove and sets it on the pass | `plate(item?)` |
| `bar-01` | The bar robot: drinks and desserts, set on the bar counter | `make(item?)` |
| `runner-01` | The runner robot: collects up to three things from the pass, the bar and the supplies cabinet, nearest first, serves them at the guest's table, and clears tables to the dish return. Battery | `deliver(items?)`, `clear(table?, items?)` |
| `supplies-01` | Napkins, chopsticks, bowls, spoons, cups, takeaway boxes and a baby chair; the result names each (`s1`, `s2`, …) for the runner | `dispense(item, qty)`, `restock()` |
| `cleaner-01` | Scrubs a spill off the floor, and wipes a table once nothing is left on it | `clean(place)` |
| `room-01` | Lights (bright, warm, dim, party), music (guzheng, jazz, pop, the birthday song, off) with a settable `volume`, and the air conditioning; reports the air's temperature, and whether it is day or evening outside | `set_lights(scene)`, `play_music(track, volume?)`, `set_temperature(celsius)` |
| `pos-01` | The payment terminal: the bill on the guest's screen, with a discount of up to 50 % and its reason and how the guest pays (QR code, card or cash), and the payment | `bill(percent, reason?, method?)`, `charge()` |
| `cam-01` | A ceiling camera in the south-east corner; stills for the model and live video for people | `look_at(place)` |

The menu has seventeen dishes (`src/menu.ts`), each made at one station: five from the wok, five from the steamer and stove, seven drinks and desserts from the bar, among them a birthday cake with candles. A dish made at the wrong station is refused with the station that makes it.

**An order line's way.** `order` → `cook` at its station (or `make` at the bar) → `plate` onto the pass (not for bar items) → `deliver` → at the end `bill`, `charge`, `see_off`, `clear` and `clean`. Every step refuses with a reason when the line is not where it should be (`x_not_waiting`, `x_not_ready`, `x_wrong_station`), and `see_off` refuses until the bill is paid. A station, the arm and the runner given no line take the next one waiting, so the line moves on with no ids to pass, and the DM can take those steps. The bill needs its discount decided, even if it is 0, so only the LLM makes it, when the guest asks; payment and the see-off can only follow it.

## Conditions

The controls panel (`E`) brings about trouble a device then reports:

| Condition | What happens | Who handles it |
| --- | --- | --- |
| Sea bass sold out | menu-01 lists it as sold out and refuses orders for it | menu-01, the brain suggests something else |
| Napkins run out | supplies-01 has none left | `supplies-01 restock` |
| The guest knocks over their tea | a spill by the guest's table | `cleaner-01 clean` |
| The room gets hot | the air conditioning fails for a minute and the room warms to over 27 °C (warning) | `room-01 set_temperature` once it is back |
| Evening falls | it gets dark outside and the dining room darker | `room-01 set_lights bright` |

Scripts reach the world in the page as `window.restaurant` (`world.service`, `world.conditions`, `reset()`, `view.set({x, y, span})`). `node tools/play.mjs <scenario.json> <out-dir> [page] [hub]` plays a list of device calls and screenshots against a page and a hub, for checking chains without a model.

## DM and LLM

Agnes's DM (`packages/mhs/server/hub-api.md` section 15.5) can take a step in the LLM's place after a device result and hands the rest to the LLM; it is switched per conversation in Agnes's composer. `dm-scene.md` is this world's scene for it (`AGNES_DM_SCENE`). The page shows who acted, as the Mars world does: each tag and line in the activity list carries Jev (the DM, green, a bolt) or LLM (blue, a speech bubble); a step the DM left to the LLM gets a line of its own; any line the DM decided opens to show the result it read and the four likeliest actions; each call shows how long it was thought over and how long the device took; two rows above the list share out the decisions and the time.
