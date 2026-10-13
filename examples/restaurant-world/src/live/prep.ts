import { type Call, CallError } from '@agnes/mhs/device'
import { prepped } from '../actors.js'
import { COUNTER_H, FIXTURES, HOMES, PREP_STOPS } from '../layout.js'
import { STATION_DEVICE } from '../menu.js'
import { place } from '../shapes.js'
import { stageText } from './menu.js'
import { addPlace, Robot } from './motion.js'
import type { Line } from './service.js'
import { type World, WorldDevice, wait } from './world.js'

const F = FIXTURES

/** Where a prepped bowl waits beside its station, k-th one along. */
const BOWL_AT = {
  wok: (k: number) => ({ x: F.wok.x - 0.6 - k * 0.22, y: F.wok.y - 0.2, h: COUNTER_H.wok }),
  stove: (k: number) => ({ x: F.stove.x + 0.6 + k * 0.22, y: F.stove.y - 0.2, h: COUNTER_H.stove }),
}

/**
 * The prep robot: for each kitchen order line it takes the ingredients from the cold store, washes
 * and cuts them at the prep counter, and sets the bowl beside the wok or the stove to cook.
 */
export function prepBot(world: World, log: (line: string) => void): WorldDevice {
  const { service } = world
  const model = world.actors.prep
  const robot = new Robot(
    world,
    model.object,
    { id: 'prep-01', label: 'prep robot', radius: 0.3, speed: 4, home: HOMES.prep, idleS: 4 },
    log,
  )
  let mode: 'idle' | 'fetching' | 'washing' | 'cutting' | 'carrying' | 'returning' = 'idle'
  let holding: Line | undefined
  const dev = new WorldDevice({
    id: 'prep-01',
    kind: 'robot',
    name: 'Prep robot',
    model: 'Agnes Restaurant prep robot',
    mobile: true,
    radius: 0.3,
    localization: 'self',
    profile: {
      size_m: [0.6, 0.6, 1.7],
      max_speed: 4,
      notes:
        'A kitchen robot with two arms and a knife. prep takes wok-01 and stove-01 order lines’ ingredients from the cold store, washes and cuts them at the prep counter, and sets each bowl beside its station; the station cooks only prepped lines. Drinks and desserts need no prep.',
    },
    resources: { hands: 'queue' },
    ui: { primary: 'pose' },
    state: {
      mode: { type: 'string', enum: ['idle', 'fetching', 'washing', 'cutting', 'carrying', 'returning'] },
      holding: { type: 'string', description: 'the order line it is prepping' },
    },
  })
  dev.log = log
  const report = () => dev.update({ mode, holding: holding ? `${holding.id} ${holding.dish.en}` : '' })
  report()
  robot.onHome = (phase) => {
    mode = phase === 'leaving' ? 'returning' : 'idle'
    report()
  }
  addPlace(dev, world, robot.body, 'prep robot', log)

  /** Works the arms for `ms`: `chop` brings the knife down and up, else both arms scrub. */
  const work = async (call: Call, ms: number, chop: boolean, text: string) => {
    const steps = Math.max(1, Math.round(ms / 100))
    for (let k = 0; k < steps; k++) {
      await wait(call, 100)
      model.arms.forEach((arm, side) => {
        const beat = Math.sin(k * 1.6 + side * (chop ? 0 : Math.PI))
        arm.shoulder.rotation.x = -0.9 + (chop && side === 0 ? 0 : beat * 0.25)
        arm.elbow.rotation.x = -0.6 + (chop && side === 0 ? 0 : beat * 0.35)
      })
      call.progress({ done: k + 1, total: steps, text })
    }
  }

  dev.tool(
    {
      name: 'prep',
      description:
        'Prep wok-01 and stove-01 order lines from menu-01: fetch their ingredients from the cold store, wash and cut them, and set each bowl beside its station to cook. The line named, else every kitchen line waiting (up to three) in one trip. Calls wait their turn.',
      timeout: 120,
      params: { item: { type: 'string', maxLength: 8, description: 'the order line, such as o1' } },
      uses: ['hands'],
      motion: true,
      ui: { label: 'Prep' },
    },
    async (call, { item }) => {
      const named = item === undefined || item === '' ? undefined : String(item)
      let lines: Line[]
      if (named) {
        const l = service.line(named)
        if (!l) throw new CallError('x_no_line', `there is no order line ${named}`)
        if (l.dish.station === 'bar')
          throw new CallError('x_bar_item', `${l.id} ${l.dish.en} is made at the bar; bar-01 make it`)
        if (l.stage !== 'queued')
          throw new CallError('x_not_waiting', `${l.id} ${l.dish.en} is ${stageText(l)}`)
        lines = [l]
      } else {
        lines = service.lines.filter((x) => x.dish.station !== 'bar' && x.stage === 'queued').slice(0, 3)
        if (!lines.length) return 'no kitchen order line waits for prep'
      }
      for (const l of lines) l.stage = 'prepping'
      model.busy = true
      service.changed()
      const names = lines.map((l) => `${l.id} ${l.dish.en}`)
      const bowls = new Map<Line, ReturnType<typeof prepped>>()
      try {
        return await robot.work(async () => {
          mode = 'fetching'
          report()
          await robot.goTo(call, PREP_STOPS.coldStore)
          await work(call, 250, false, `taking ${names.join(', ')} from the cold store`)
          await robot.goTo(call, PREP_STOPS.board)
          for (const l of lines) {
            holding = l
            mode = 'washing'
            report()
            await work(call, 300, false, `washing ${l.id} ${l.dish.en}`)
            mode = 'cutting'
            report()
            await work(call, 400, true, `cutting ${l.id} ${l.dish.en}`)
            const bowl = prepped(l.dish.color)
            bowl.position.set((bowls.size - 1) * 0.12, bowls.size * 0.08, 0)
            model.tray.add(bowl)
            bowls.set(l, bowl)
          }
          holding = undefined
          mode = 'carrying'
          report()
          // The wok is nearer the prep counter than the stove.
          for (const which of ['wok', 'stove'] as const) {
            const here = lines.filter((l) => l.dish.station === which)
            if (!here.length) continue
            await robot.goTo(call, PREP_STOPS[which])
            for (const l of here) {
              const k = service.lines.filter((x) => x.stage === 'prepped' && x.dish.station === which).length
              const at = BOWL_AT[which](k)
              const bowl = bowls.get(l) as ReturnType<typeof prepped>
              bowl.position.set(0, 0, 0)
              world.actors.group.add(place(bowl, at.x, at.y, at.h))
              l.prepObject = bowl
              bowls.delete(l)
              l.stage = 'prepped'
              service.changed()
            }
          }
          const left = service.lines.filter((x) => x.dish.station !== 'bar' && x.stage === 'queued')
          return lines
            .map(
              (l) => `${l.id} ${l.dish.en} is washed, cut and set beside ${STATION_DEVICE[l.dish.station]}`,
            )
            .join('; ')
            .concat(', ready to cook')
            .concat(
              left.length
                ? `; still waiting for prep: ${left.map((l) => `${l.id} ${l.dish.en}`).join(', ')}`
                : '',
            )
        })
      } catch (e) {
        for (const bowl of bowls.values()) bowl.removeFromParent()
        for (const l of lines) if (l.stage === 'prepping') l.stage = 'queued'
        service.changed()
        throw e
      } finally {
        holding = undefined
        model.busy = false
        mode = 'idle'
        report()
      }
    },
  )
  world.onReset(() => {
    for (const c of [...model.tray.children]) c.removeFromParent()
    robot.reset()
    holding = undefined
    model.busy = false
    mode = 'idle'
    report()
  })
  return dev
}
