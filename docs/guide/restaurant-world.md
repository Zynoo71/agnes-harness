# Agnes Restaurant: be the guest, AGH runs the room

English | [简体中文](restaurant-world.zh-CN.md)

<a id="agnes-餐厅你当客人agh-经营餐厅"></a>

[Documentation](../README.md) · [MHS and devices](mhs.md) · [Mars base](mars-world.md) · [Example reference](../../examples/restaurant-world/README.md)

[`examples/restaurant-world`](../../examples/restaurant-world/README.md) is a modern Chinese restaurant drawn in 3D in the browser, as in a management game. Its thirteen devices are virtual, but they speak MHS like real ones: the host robot at the door, the kitchen's wok, steamer and arm, the bar robot, the runner, the cleaner, the supplies cabinet, the payment terminal, the room's lights and music, a ceiling camera, the menu and the floor plan. You are the one guest. You say what you want in AGH, in your own words; the brain drives the devices, and you watch your table fill up.

<a id="开始之前"></a>

## Before you start

- A [source build of AGH](install.md) with a model configured in Web that supports tool calls (and images, for the camera).
- The `@agnes/mhs` plugin installed, as in [Use devices from AGH](mhs.md#use-devices-from-agh) steps 1–3. AgnesHub then listens on `127.0.0.1:4180`.
- A desktop browser with WebGL.

<a id="启动"></a>

## Start

1. Start Web with AgnesHub's origin, if it is not running yet:

   ```sh
   AGNES_HUB_ORIGIN=http://127.0.0.1:4180 node packages/cli/dist/local/agnes.mjs serve
   ```

2. In another terminal, from the repository root, serve the world. The first run downloads its models and textures and checks their hashes:

   ```sh
   pnpm --filter @agnes/restaurant-world dev
   ```

3. Open `http://127.0.0.1:4200/?hub=ws://127.0.0.1:4180`, once. The devices live in this page; keep it open while you play.
4. In the workbench, the Devices panel lists the thirteen devices, and its World tab shows the floor plan.

The restaurant and the Mars base use the same ports, so run one at a time: close the other world's page and stop its `dev` first. If you use the DM, point `AGNES_DM_SCENE` at `examples/restaurant-world/dm-scene.md` and restart AGH, so the DM knows where it is.

<a id="你是这位客人"></a>

## You are the guest

A few seconds after the page opens, the guest walks in from the street and waits at the door; a green marker floats over them. The page has no text box: everything you want, you tell AGH, and the brain decides which devices to use. Talk as a guest would, not as an operator: no device names needed.

<a id="可以这样说"></a>

## Things to say

**Arriving**

> Just me today. Could I sit by the window?

The host robot leads you to a free window table (one is booked by someone else) and the menu opens on your screen.

**Ordering**

> I'll have the Kung Pao chicken, not too spicy, and a bowl of rice. And a pot of chrysanthemum tea.

Each dish goes to its station: the wok, the steamer, the bar. The arm plates the kitchen's dishes onto the pass, and the runner brings them to your table, up to three at a time. Your table's card shows each dish's stage.

> What do you recommend? I don't eat peanuts.

> Hmm, cancel the rice. · Where's my food? Could you hurry it?

**Little things**

> Could I have some more napkins? · I've got a little one with me, do you have a baby chair?

> Oops, I knocked my tea over.

> It's a bit warm in here. · Could you turn the music down a little?

**The birthday surprise**

> It's my birthday today. Can you make it feel special?

There is no single right answer: the lights can go to party, the birthday song can play, the cake with candles comes from the bar, the host can sing out a greeting, and the bill can take something off.

**Leaving**

> Can I have the bill? I'll pay with QR code.

The bill opens on your screen with a QR code; once paid, the host robot walks you to the door, and the runner and the cleaner reset your table.

**Trouble** — open the controls with `E` on the world page and bring some about while you eat: the sea bass sells out, the napkins run out, you knock over your tea, the air conditioning fails, or evening falls. The brain only learns of it from the devices.

<a id="观察过程"></a>

## Watch it happen

- **In the conversation**, every device call shows as a card with its arguments, progress and result.
- **In the world page**, each device's tag shows the tool it is running, its progress and who called it (the LLM in blue; with the DM on, Jev in green); the host robot's words float over it as a speech bubble; the list at the bottom left keeps the latest calls and alerts; the cards on the right show the menu, your table and the bill; the bar along the bottom shows how long you have sat, your table, the kitchen and the room. A frame in the top-left corner shows the device at work. Keys `1`–`9` switch between fixed views, drag and the wheel move the view, `M` toggles the minimap, `L` the tags, `C` the menu, `P` the picture in picture, `E` the controls and `?` the page's own guide. The button beside it switches the page to Chinese.

<a id="重来一次"></a>

## Start over

Press **Reset** at the bottom right of the world page, or `R`. Every running call ends as if stopped, the robots go home, the tables are cleared, the orders and the bill are gone and the guest walks in again. The devices stay connected. Open a new conversation too, so the brain does not plan from the last visit.

<a id="遇到问题"></a>

## When something is off

| What you see | What to check |
| --- | --- |
| No devices in the panel | Is the world page open with `?hub=ws://127.0.0.1:4180`? Is the plugin enabled? Only one program can hold port 4180 |
| The Mars devices are listed too, offline | They were connected before; a new conversation only uses what is connected |
| A device keeps going offline and back | The world is open in two pages; close one |
| The world runs slowly | Add `&quality=low` to the world page's address |
