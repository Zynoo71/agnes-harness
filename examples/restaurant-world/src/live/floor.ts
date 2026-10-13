import { CallError } from '@agnes/mhs/device'
import { TABLES } from '../layout.js'
import { FLOOR_MAP } from './floormap.js'
import { TABLE_IDS } from './service.js'
import { type World, WorldDevice } from './world.js'

/**
 * The floor plan: it declares the restaurant's map (the frame, the tables' serving points, the
 * door, the pass, …) and keeps each table's status: free, reserved by someone else, occupied by
 * the guest, or waiting to be cleared after they left.
 */
export function floor(world: World, log: (line: string) => void): WorldDevice {
  const { service } = world
  const STATUS = ['free', 'reserved', 'occupied', 'needs_clearing']
  const dev = new WorldDevice({
    id: 'floor-01',
    kind: 'system',
    name: 'Floor plan',
    model: 'Agnes Restaurant floor plan',
    localization: 'none',
    maps: [FLOOR_MAP],
    profile: {
      notes: `The restaurant's floor map and its six tables: ${TABLES.map(
        (t) => `${t.id} ${t.name.en.replace(/^Table \d, ?/, '') || t.kind} for ${t.seats.length}`,
      ).join(
        '; ',
      )}. A table is free, reserved (booked by others), occupied (the guest's), or needs clearing after the guest left (runner-01 clear, then cleaner-01 clean frees it).`,
    },
    resources: { tables: 'queue' },
    state: Object.fromEntries(
      TABLES.map((t) => [
        t.id,
        { type: 'string', enum: STATUS, description: `${t.name.en}, ${t.seats.length} seats` },
      ]),
    ),
  })
  dev.log = log
  const report = () => dev.update(Object.fromEntries(TABLE_IDS.map((id) => [id, service.status(id)])))
  report()
  service.listeners.push(report)
  dev.tool(
    {
      name: 'set_table',
      description:
        'Book a table for someone who has not come in yet, such as a booking by phone (reserved), or release a booking (free). The guest in the restaurant needs no booking: host-01 seat_guest seats them at a free table.',
      timeout: 5,
      params: {
        table: { type: 'string', enum: TABLE_IDS },
        status: { type: 'string', enum: ['free', 'reserved'] },
      },
      required: ['table', 'status'],
      uses: ['tables'],
      ui: { label: 'Set table' },
    },
    async (_call, { table, status }) => {
      const now = service.status(table)
      if (now === 'occupied' || now === 'needs_clearing')
        throw new CallError('x_table_in_use', `${table} is ${now.replace('_', ' ')}`)
      if (status === 'reserved') service.reserved.add(table)
      else service.reserved.delete(table)
      service.changed()
      return `${table} is ${status}`
    },
  )
  return dev
}
