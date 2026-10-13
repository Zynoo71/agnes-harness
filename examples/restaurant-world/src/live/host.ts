import { type Call, CallError } from '@agnes/mhs/device'
import { besideSeat, DOOR, guestSeat, HOMES, TABLES } from '../layout.js'
import { landmark } from './floormap.js'
import { addPlace, face, quietCall, Robot, WALK, walk } from './motion.js'
import { fromMap, planNear, toMap } from './route.js'
import { TABLE_IDS } from './service.js'
import { Body, type World, WorldDevice, wait } from './world.js'

/** Where the guest stands outside before coming in, and inside the door waiting to be met. */
const STREET = { x: (DOOR.x0 + DOOR.x1) / 2, y: -1.6 }
const INSIDE = { x: (DOOR.x0 + DOOR.x1) / 2, y: 0.9 }
/** Where they walk off to along the street when they leave. */
const AWAY = { x: DOOR.x0 - 5, y: -2.4 }

/**
 * The host robot at the door: it leads the guest to a table and later back to the door, and says
 * things to them in a bubble. The guest is not a device; this is how they move. They come in by
 * themselves a few seconds after the page opens.
 */
export function host(world: World, log: (line: string) => void): WorldDevice {
  const { service } = world
  const { guest, host: model } = world.actors
  const robot = new Robot(
    world,
    model.object,
    { id: 'host-01', label: 'host robot', radius: 0.32, speed: 2.9, home: HOMES.host, idleS: 6 },
    log,
  )
  const walker = new Body(guest.object, world)
  let mode: 'at_door' | 'leading' | 'seeing_off' | 'returning' = 'at_door'
  const dev = new WorldDevice({
    id: 'host-01',
    kind: 'robot',
    name: 'Host robot',
    model: 'Agnes Restaurant host robot',
    mobile: true,
    radius: 0.32,
    localization: 'self',
    profile: {
      size_m: [0.6, 0.6, 1.3],
      max_speed: 2.9,
      notes:
        'The robot at the door that meets the guest: it leads them, and everyone in their party, to a table, and at the end back to the door, and says things to them in a speech bubble. There is one party of guests at a time; party says how many came, the guest included, and child whether one is a small child. A table seats only as many as it has seats (floor-01). It goes back to the door by itself when it has nothing to do.',
    },
    resources: { chassis: 'reject', voice: 'queue' },
    ui: { primary: 'pose' },
    state: {
      mode: { type: 'string', enum: ['at_door', 'leading', 'seeing_off', 'returning'] },
      guest: {
        type: 'string',
        enum: ['outside', 'at_door', 'following', 'seated', 'leaving', 'left'],
        description:
          'where the guest is: outside, waiting inside the door, following the robot, seated, leaving, gone',
      },
      table: { type: 'string', description: "the guest's table (t1 to t6), empty before they sit" },
      party: { type: 'integer', min: 1, max: 8, description: 'how many came, the guest included' },
      child: { type: 'boolean', description: 'one of them is a small child, who sits in a baby chair' },
    },
  })
  dev.log = log
  const report = () =>
    dev.update({
      mode,
      guest: service.guest,
      table: service.table ?? '',
      party: world.party.size,
      child: world.party.kid,
    })
  report()
  service.listeners.push(report)
  robot.onHome = (phase) => {
    mode = phase === 'leaving' ? 'returning' : 'at_door'
    report()
  }
  addPlace(dev, world, robot.body, 'host robot', log)
  dev.after = () => ({ pose: robot.body.pose() })

  /** The guest's walk off down the street after the see-off, which Reset stops. */
  let walkAway: ReturnType<typeof quietCall> | undefined

  /** The guest walks a planned way to plan point `to`. */
  const guestTo = async (call: Call, to: { x: number; y: number }) => {
    const plan = planNear(world.planGrid(), walker.at, fromMap(to.x, to.y), [], 0.22, 1)
    const points = plan ? plan.path.map(toMap) : [to]
    await walk(call, walker, points, guest, WALK * 0.85)
  }

  // The guest comes in from the street by themselves a few seconds after the page opens or resets.
  const arrive = () => {
    const { call } = quietCall()
    guest.object.visible = true
    void (async () => {
      await wait(call, 1500)
      await walk(call, walker, [INSIDE], guest)
      await face(call, walker, 90)
      service.guest = 'at_door'
      service.changed()
    })().catch((e) => log(`guest: ${String(e)}`))
  }
  arrive()

  dev.tool(
    {
      name: 'seat_guest',
      description:
        "Lead the guest to a free table (see floor-01's state) and seat them; their menu opens on their screen. Also moves a seated guest to another table before any dish is served.",
      timeout: 120,
      params: { table: { type: 'string', enum: TABLE_IDS, description: 'the table, t1 to t6' } },
      required: ['table'],
      uses: ['chassis'],
      motion: true,
      ui: { label: 'Seat the guest' },
    },
    async (call, { table }) => {
      const t = TABLES.find((x) => x.id === table)
      if (!t) throw new CallError('x_no_table', `there is no table ${table}`)
      if (service.guest === 'outside') throw new CallError('x_not_here', 'the guest has not come in yet')
      if (service.guest === 'left' || service.guest === 'leaving')
        throw new CallError('x_gone', 'the guest has left')
      if (service.guest === 'following')
        throw new CallError('x_seating', 'the guest is already being led to a table')
      if (service.table === t.id) return `the guest is already seated at ${t.id}`
      const status = service.status(t.id)
      if (status !== 'free')
        throw new CallError('x_table_taken', `${t.id} is ${status.replace('_', ' ')}; pick a free table`)
      const { size, kid } = world.party
      if (t.seats.length < size)
        throw new CallError(
          'x_too_small',
          `${t.id} seats ${t.seats.length} and the party is ${size}; pick a free table for at least ${size} (floor-01)`,
        )
      if (service.lines.some((l) => l.stage === 'served'))
        throw new CallError(
          'x_dishes_served',
          `dishes are already on ${service.table}; the guest stays there`,
        )
      return robot.work(async () => {
        mode = 'leading'
        report()
        const from = service.table
        try {
          // To the guest first, then off to the table with the guest following a little behind.
          const g = toMap(walker.at)
          await robot.goTo(call, { x: g.x, y: g.y + (g.y < 2 ? 0.9 : 0), yaw: 270 })
          if (from) {
            guest.stand()
            await walk(
              call,
              walker,
              [besideSeat(TABLES.find((x) => x.id === from) ?? t, service.seat ?? guestSeat(t))],
              guest,
            )
          }
          service.guest = 'following'
          service.table = undefined
          service.seat = undefined
          if (from) service.dirty.delete(from)
          service.changed()
          const seat = guestSeat(t)
          const lead = robot.goTo(call, t.serve)
          await wait(call, 700)
          await guestTo(call, besideSeat(t, seat))
          await walk(call, walker, [seat], guest, WALK * 0.6)
          await face(call, walker, seat.yaw)
          guest.sit()
          await lead
          await face(
            call,
            robot.body,
            Math.round((Math.atan2(seat.y - t.serve.y, seat.x - t.serve.x) * 180) / Math.PI + 360) % 360,
          )
          service.guest = 'seated'
          service.table = t.id
          service.seat = seat
          service.seatedAt ??= performance.now()
          service.menuOpen = true
          service.changed()
          const who = size > 1 ? `the party of ${size} is` : 'the guest is'
          const little = kid
            ? '; their small child stands beside them, with no chair to sit on yet (a baby chair is in supplies-01)'
            : ''
          return `${who} seated at ${t.id}, ${t.name.en.toLowerCase()}${little}; the menu is open on their screen, and they tell you what they would like`
        } finally {
          mode = 'at_door'
          report()
        }
      })
    },
  )
  dev.tool(
    {
      name: 'see_off',
      description:
        'Walk the guest from their table to the door when they want to leave, the bill is paid (pos-01) and a small child is back from the play area (play-01 bring_back); they leave, and the table is left for clearing.',
      timeout: 120,
      uses: ['chassis'],
      motion: true,
      ui: { label: 'See the guest off' },
    },
    async (call) => {
      const t = TABLES.find((x) => x.id === service.table)
      if (service.guest !== 'seated' || !t) throw new CallError('x_not_seated', 'the guest is not at a table')
      if (service.bill !== 'paid')
        throw new CallError('x_not_paid', 'the bill is not paid yet: pos-01 bill, then charge, first')
      if (world.companions.some((m) => m.held))
        throw new CallError(
          'x_child_playing',
          'the small child is still in the play area: play-01 bring_back first',
        )
      return robot.work(async () => {
        mode = 'seeing_off'
        report()
        try {
          await robot.goTo(call, t.serve)
          guest.stand()
          service.guest = 'leaving'
          service.menuOpen = false
          service.changed()
          await walk(call, walker, [besideSeat(t, service.seat ?? guestSeat(t))], guest)
          const door = landmark('door')
          const lead = robot.goTo(call, { ...door, y: door.y + 0.6, yaw: 270 })
          await wait(call, 600)
          await guestTo(call, door)
          await lead
          // Out of the door the guest has left; they walk off down the street on their own.
          walkAway = quietCall()
          void walk(walkAway.call, walker, [STREET, AWAY], guest)
            .then(() => {
              if (service.guest === 'left') guest.object.visible = false
            })
            .catch(() => undefined)
          service.guest = 'left'
          service.billOpen = false
          service.dirty.add(t.id)
          service.changed()
          return `the guest has left; ${t.id} needs clearing: runner-01 clear table ${t.id}, then cleaner-01 clean place ${t.id}`
        } finally {
          mode = 'at_door'
          report()
        }
      })
    },
  )
  dev.tool(
    {
      name: 'say',
      description:
        'Say something to the guest: it shows in a speech bubble over the robot for a few seconds.',
      timeout: 20,
      params: {
        text: { type: 'string', maxLength: 120, description: 'what to say, in the guest’s language' },
      },
      required: ['text'],
      uses: ['voice'],
      ui: { label: 'Say' },
    },
    async (call, { text }) => {
      // The bubble stays up long enough to read; the call ends once the words are out.
      const ms = Math.min(9000, 2500 + String(text).length * 150)
      world.speech = { text: String(text), until: performance.now() + ms }
      await wait(call, 600)
      return `said: ${text}`
    },
  )
  world.onReset(() => {
    walkAway?.stop()
    robot.reset()
    walker.reset()
    guest.stand()
    mode = 'at_door'
    world.speech = { text: '', until: 0 }
    report()
    arrive()
  })
  return dev
}

export { STREET }
