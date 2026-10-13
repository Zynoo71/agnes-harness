# Mars base: command eleven devices from AGH

English | [简体中文](mars-world.zh-CN.md)

<a id="火星基地在-agh-里指挥十一台设备"></a>

[Documentation](../README.md) · [MHS and devices](mhs.md) · [Example reference](../../examples/mars-world/README.md)

[`examples/mars-world`](../../examples/mars-world/README.md) is a small research base on Mars, drawn in 3D in the browser. Its eleven devices are virtual, but they speak MHS like real ones: they connect to AgnesHub, declare their tools, state and cameras, and move in the world when they are called. You give the task in AGH; the brain plans it and drives the devices, and you watch it happen. No hardware is needed.

<a id="开始之前"></a>

## Before you start

- A [source build of AGH](install.md) with a model configured in Web. The brain reads camera pictures and calls tools, so choose a model that supports both images and tool calls.
- The `@agnes/mhs` plugin installed, as in [Use devices from AGH](mhs.md#use-devices-from-agh) steps 1–3. AgnesHub then listens on `127.0.0.1:4180`.
- A desktop browser with WebGL and WebCodecs (a recent Chrome, Edge or Safari).

<a id="启动"></a>

## Start

1. Start Web with AgnesHub's origin and enable the plugin, if they are not running yet:

   ```sh
   AGNES_HUB_ORIGIN=http://127.0.0.1:4180 node packages/cli/dist/local/agnes.mjs serve
   ```

2. In another terminal, from the repository root, serve the world. The first run downloads about 27 MB of models and textures and checks their hashes:

   ```sh
   pnpm --filter @agnes/mars-world dev
   ```

3. Open `http://127.0.0.1:4200/?hub=ws://127.0.0.1:4180`. The devices live in this page and connect to AgnesHub from it. Keep it open while you play; a background tab keeps them running. Open it only once: a second page takes the same devices over.
4. In the workbench, the Devices panel docks on the right; Devices in the sidebar opens it. The eleven devices appear in the Devices tab, and the World tab shows the base map with every device on it.

`pnpm --filter @agnes/mars-world start` is the variant without AGH: it starts a hub with a command line on `127.0.0.1:4180`, serves the world on port 4200 and opens it in the browser. Stop `dev` and AGH's AgnesHub before running it, since it needs both ports.

<a id="基地里有什么"></a>

## What is on the base

| Device | What it does |
| --- | --- |
| `rover-01` | Drives, follows routes, collects rock samples and docks to charge. Stops by itself before boulders and people |
| `hopper-01` | A rocket lander. Takes off, flies, surveys an area from the air and plans a route for the rover. Limited by its propellant |
| `monolith-01` | A walking robot of four metal slabs. Walks or rolls, follows, carries the astronaut or a sample, and speaks. Its `humor` and `honesty` can be set |
| `suit-01` | Worn by the astronaut working at the rock outcrop in the west field. Reports oxygen, vital signs and a helmet camera |
| `airlock-01`, `habitat-01` | The airlock cycles people in and out; the habitat reports its air and switches modes |
| `lab-01` | Unloads a docked rover's sample and analyzes it |
| `comms-01` | Points the dish and sends reports to Earth while the window is open |
| `power-01`, `weather-01`, `cam-base` | The battery bank and solar array, the weather station, and a camera overlooking the base |

The habitat declares the base map with named places (airlock, rover dock, hopper pad, lab, rock outcrop, west field and more), so you can name places in a task instead of giving coordinates. The [example reference](../../examples/mars-world/README.md) lists every tool, state field and data source.

<a id="世界自己会变"></a>

## The world changes on its own

Left alone, the base does not stay as it is, so the brain has something to notice:

- **Mars time.** A sol takes 40 real minutes. The sun, the light and the solar output follow it; at night the battery bank carries the base, and the air gets much colder.
- **Drift.** Dust settles on the solar panels, the astronaut's oxygen runs down while they work, and a hopper left away from its pad boils off propellant.
- **Events.** Every few minutes something happens: a dust storm, a leak in the astronaut's suit, a dust devil over the solar array, or a meteorite that falls and lies in the field as a new unusual rock. The world page shows each as a banner and in the activity list; the brain learns of it only from the devices, as it would on a real base.

With a model behind the world's event director, the model picks what happens and when, from a summary of the base; the world keeps its picks to the rules. Set it up when you serve the world, with any OpenAI-compatible API:

```sh
MARS_DIRECTOR_URL=http://127.0.0.1:8488/v1 MARS_DIRECTOR_MODEL=<model> pnpm --filter @agnes/mars-world dev
```

`MARS_DIRECTOR_KEY` carries an API key if the service needs one; it stays on the server. Without these, the world picks events from a seed. Add `&events=manual` to the world page's address to start events only from its events panel (`E`), or `&events=off` for none.

<a id="试试这些任务"></a>

## Tasks to try

Type these into a conversation, in English or any language your model handles. Start with the short ones.

**Look around**

> How is the base doing? Check the habitat's air, the power and the weather.

> What does the base camera see right now?

**One device**

> Drive the rover to the airlock door.

> Set Monolith's humor to 100% and have it say hello to the crew.

**Several devices**

> The astronaut out in the field has gone quiet. Send the hopper to find them in the west field, then have Monolith bring them back into the habitat.

The brain flies the hopper out to survey, sends Monolith to the astronaut, cycles the airlock open, has Monolith carry the astronaut into the chamber and cycles them into the habitat. If another device stands in the way, it moves that first.

> Look for an unusual rock in the west field from the air, have the rover collect a sample along the hopper's route, analyze it in the lab and send the result to Earth.

The rover cannot drive straight to the rock, because the outcrop is in the way; the hopper's route goes around it. The dish can only send while the window to Earth is open: closed for the first two minutes after the world page opens, then open three minutes in every four. The brain waits for it.

> A dust storm is coming. Get the base ready.

There is no single right answer: the weather station, the solar array, the hopper, the rover and the airlock all have a part.

**Let the world happen**

> Keep an eye on the base for the next half hour and handle whatever comes up.

The brain sets watches on the devices and waits; when an event shows up in their state, it acts. A leaking suit stops the astronaut where they stand, so Monolith has to carry them in; after a storm the panels need cleaning; a meteorite is worth a survey and a sample.

> Call the astronaut back in before their oxygen gets low.

The suit's `radio` asks them to walk back to the airlock; the brain still has to cycle the airlock and open its door for them.

<a id="观察过程"></a>

## Watch it happen

- **In the conversation**, every device call shows as a card with its arguments, progress and result. A finished turn folds its cards under its summary line, Completed · took …; click that line to unfold them.
- **In the Devices panel**: Activity lists the brain's device calls in this conversation, newest first; World shows the devices moving on the base map; a device's own page shows its state, data and cameras. Stop on a device page, or `stop_device`, stops it at once.
- **In the world page**, each device's tag shows the tool it is running, its progress and who called it; a device at work has a ring breathing on the ground under it in its caller's colour (Jev green, the LLM blue), a device on its way a dashed line to where it is going, and the tags of devices at rest are smaller and fainter; the rover leaves wheel tracks, and the rover and the hopper raise dust; the activity list at the bottom left keeps every call, alert and event since the page opened, each device marked with its emoji; banners at the top flag events and alarms; the bar along the bottom shows the Mars time, the window to Earth and the weather. Keys `1`–`9` switch between fixed views (overview, rover dock and lab, hopper pad, airlock, field worksite, power, flag, comms, and one that follows the hopper), `0` follows Monolith, `M` toggles the minimap, `L` the device tags, `E` the events panel, `A` folds the activity list, and `?` opens the page's own guide. The button beside it switches the page to Chinese.

<a id="重来一次"></a>

## Start over

Press **Reset** at the bottom right of the world page, or `R`. Every running call ends as if stopped, and the devices go back to where they started, with the battery, propellant and oxygen levels they started with, the rock whole again and the airlock closed; the Mars clock goes back to morning, events end and fallen meteorites are gone. The devices stay connected, so you can give the next task right away. Open a new conversation too, so the brain does not plan from the last run.

<a id="遇到问题"></a>

## When something is off

| What you see | What to check |
| --- | --- |
| No devices in the panel | Is the world page open with `?hub=ws://127.0.0.1:4180`? Is the plugin enabled? Only one program can hold port 4180: `mars-world start` and AGH's AgnesHub cannot run together |
| The panel cannot connect to AgnesHub | Web was started without `AGNES_HUB_ORIGIN=http://127.0.0.1:4180` |
| A device keeps going offline and back | The world is open in two pages; close one |
| The world runs slowly | Add `&quality=low` to the world page's address |
