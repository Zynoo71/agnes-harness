import type { Call } from '@agnes/mhs/device'
import * as THREE from 'three'
import { ROOM } from '../layout.js'
import { place } from '../shapes.js'
import { addCamera } from './camera.js'
import { landmark, PLACE_PARAM, placed } from './floormap.js'
import { frame, type World, WorldDevice } from './world.js'

/** The camera's mount: high in the south-east corner, looking over the dining room. */
const MOUNT = { x: ROOM.w - 0.3, y: 0.3, h: 2.8 }

/** The ceiling camera: points at any place on the floor map; stills for models and live video for people. */
export function cam(world: World, log: (line: string) => void): WorldDevice {
  let looking = 'dining-room'
  const head = new THREE.Group()
  const housing = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.3 }),
  )
  housing.scale.z = 1.4
  head.add(housing)
  world.actors.group.add(place(head, MOUNT.x, MOUNT.y, MOUNT.h))
  const lens = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 100)
  // A camera looks along its −z; the head points its +z where it looks.
  lens.rotation.y = Math.PI
  head.add(lens)
  const aim = (x: number, y: number, h = 0.6) => head.lookAt(new THREE.Vector3(x, h, -y))
  const overview = () => aim(ROOM.w / 2 - 2, 6, 0.4)
  overview()
  const dev = new WorldDevice({
    id: 'cam-01',
    kind: 'camera',
    name: 'Dining room camera',
    model: 'Agnes Restaurant ceiling camera',
    localization: 'fixed',
    placement: placed(MOUNT.x, MOUNT.y, 135),
    profile: {
      notes: 'A pan-tilt camera high in the south-east corner that can look at any place on the floor map.',
    },
    resources: { head: 'reject' },
    ui: { primary: 'view_video' },
    state: { looking_at: { type: 'string', description: 'the place it points at' } },
  })
  dev.log = log
  const report = () => dev.update({ looking_at: looking })
  report()
  addCamera(
    dev,
    world,
    lens,
    {
      id: 'view',
      description: 'the ceiling camera, wherever it points',
      mount: { xyz: [0.1, 0, 0], rpy: [0, 0, 0] },
      default: true,
    },
    log,
  )
  const turn = async (call: Call, to: () => void) => {
    const from = head.quaternion.clone()
    to()
    const target = head.quaternion.clone()
    head.quaternion.copy(from)
    const start = performance.now()
    for (;;) {
      const k = Math.min(1, (performance.now() - start) / 900)
      head.quaternion.slerpQuaternions(from, target, k * k * (3 - 2 * k))
      if (k >= 1) return
      await frame(call)
    }
  }
  dev.tool(
    {
      name: 'look_at',
      description: 'Point the camera at a place on the floor map (a table, the door, the pass, …).',
      timeout: 10,
      params: { place: PLACE_PARAM },
      required: ['place'],
      uses: ['head'],
      motion: true,
      ui: { label: 'Look at' },
    },
    async (call, { place: where }) => {
      const p = landmark(where)
      await turn(call, () => aim(p.x, p.y))
      looking = String(where)
      report()
      return `looking at ${where}`
    },
  )
  world.onReset(() => {
    overview()
    looking = 'dining-room'
    report()
  })
  return dev
}
