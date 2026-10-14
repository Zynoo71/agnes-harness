import type { Call } from '@agnes/mhs/device'
import * as THREE from 'three'
import { LAYOUT } from '../base.js'
import { sunAt } from '../clock.js'
import { placed } from './basemap.js'
import { addCamera } from './camera.js'
import { reading } from './place.js'
import { every, turnTo, type World, WorldDevice, wait } from './world.js'

/** Places the camera can be pointed at by name, in world coordinates. */
const PRESETS: Record<string, readonly [number, number]> = {
  base: [2, -2],
  'hopper pad': LAYOUT.hopperPad,
  dock: LAYOUT.dock,
  airlock: LAYOUT.airlockDoor,
  'landing pad': LAYOUT.landingPad,
  'west field': LAYOUT.field,
}
const FOV = 50

/** The base camera on its mast: pans, tilts and zooms to check the pads, the dock and the airlock. */
export function baseCamera(world: World, log: (line: string) => void): WorldDevice {
  const head = world.parts.camHead
  head.rotation.order = 'YXZ'
  const at = head.getWorldPosition(new THREE.Vector3())
  /** Pan 0 looks north over the base; positive pans left (west), positive tilt looks up. */
  const NORTH = Math.PI
  const aim = (x: number, z: number) => ({
    pan: THREE.MathUtils.radToDeg(Math.atan2(x - at.x, z - at.z) - NORTH),
    tilt: THREE.MathUtils.radToDeg(Math.atan2(world.ground({ x, z }) - at.y, Math.hypot(x - at.x, z - at.z))),
  })
  const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180
  /** The devices that move about the base, by id: look_at follows them, photos name them. */
  const movers: [string, THREE.Object3D][] = [
    ['rover-01', world.parts.rover],
    ['hopper-01', world.parts.hopper],
    ['monolith-01', world.parts.monolith.group],
    ['suit-01', world.parts.astronaut],
  ]
  /** Where a mover is now, a metre above its feet, in the air too. */
  const middle = (o: THREE.Object3D) =>
    o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1, 0))
  const aimAt = (p: THREE.Vector3) => ({
    pan: THREE.MathUtils.radToDeg(Math.atan2(p.x - at.x, p.z - at.z) - NORTH),
    tilt: THREE.MathUtils.radToDeg(Math.atan2(p.y - at.y, Math.hypot(p.x - at.x, p.z - at.z))),
  })
  let pan = 0
  let tilt = 0
  let zoom = 1
  let preset = 'base'
  const dev = new WorldDevice({
    id: 'cam-base',
    kind: 'camera',
    name: 'Base camera',
    model: 'Agnes Base mast camera',
    localization: 'fixed',
    // Unpanned, it looks north over the base.
    placement: placed(LAYOUT.camBase, 90),
    profile: {
      notes:
        'Pan-tilt-zoom camera on a 6 m mast south of the base, for checking pads, the dock and the airlock.',
    },
    resources: { head: 'reject' },
    state: {
      preset: {
        type: 'string',
        enum: [...Object.keys(PRESETS), 'manual'],
        description: 'what it is pointed at',
      },
      pan: {
        type: 'number',
        unit: 'deg',
        min: -170,
        max: 170,
        description:
          '0 looks north over the base, positive left: 90 looks west, -90 east (pan is minus the compass azimuth)',
      },
      tilt: { type: 'number', unit: 'deg', min: -60, max: 20, description: 'positive looks up' },
      zoom: { type: 'number', min: 1, max: 4, description: 'magnification' },
    },
    // The whole base in one view: pages show it first, the suit's helmet camera next.
    ui: { primary: 'view_video', order: -2 },
  })
  dev.log = log
  const cam = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 2000)
  // The lens is on the head's +z side; a camera looks along its own -z.
  cam.rotation.y = Math.PI
  cam.position.z = 0.3
  head.add(cam)
  addCamera(
    dev,
    world,
    cam,
    {
      id: 'view',
      description: 'the mast camera, wherever it is pointed',
      mount: { xyz: [0.3, 0, 0], rpy: [0, 0, 0] },
      default: true,
    },
    log,
  )
  const health = dev.source('housing', 'values', 'the camera housing', {
    hz: 0.5,
    fields: {
      temperature: {
        type: 'number',
        unit: '°C',
        min: -60,
        max: 70,
        role: 'temperature',
        of: 'housing',
        alert: { warn: 50, bad: 60 },
      },
    },
  })
  every(2000, () => void (health.wants() && health.send({ temperature: reading(4, 0.3) })), log)

  const report = () =>
    dev.update({ preset, pan: Math.round(pan * 10) / 10, tilt: Math.round(tilt * 10) / 10, zoom })
  const point = async (call: Call, p: number, t: number) => {
    const ms = 300 + Math.max(Math.abs(p - pan), Math.abs(t - tilt)) * 12
    await turnTo(call, head, { y: NORTH + THREE.MathUtils.degToRad(p), x: THREE.MathUtils.degToRad(-t) }, ms)
    pan = p
    tilt = t
  }
  const start = aim(...(PRESETS.base as [number, number]))
  pan = wrap(start.pan)
  tilt = start.tilt
  head.rotation.set(THREE.MathUtils.degToRad(-tilt), NORTH + THREE.MathUtils.degToRad(pan), 0)
  report()

  dev.tool(
    {
      name: 'look_at',
      description: `Point the camera at a named place (${Object.keys(PRESETS).join(', ')}) or at a device that moves about the base where it is now (in the air too), or to a pan and tilt in degrees.`,
      timeout: 15,
      params: {
        preset: {
          type: 'string',
          enum: [...Object.keys(PRESETS), ...movers.map(([id]) => id)],
          description: 'a named place, or a device that moves about the base, pointed at where it is now',
        },
        pan: {
          type: 'number',
          minimum: -170,
          maximum: 170,
          description:
            'degrees, 0 north over the base, positive left: 90 west, -90 east; for a compass azimuth (clockwise from north) pan is minus it, so azimuth 270 is pan 90',
        },
        tilt: { type: 'number', minimum: -60, maximum: 20, description: 'degrees, positive up' },
      },
      uses: ['head'],
      motion: true,
      ui: { label: 'Look at' },
    },
    async (call, args) => {
      const place = PRESETS[args.preset as string]
      const mover = movers.find(([id]) => id === args.preset)?.[1]
      const target = place
        ? aim(...(place as [number, number]))
        : mover
          ? aimAt(middle(mover))
          : { pan: args.pan ?? pan, tilt: args.tilt ?? tilt }
      await point(call, wrap(target.pan), Math.max(-60, Math.min(20, target.tilt)))
      // Pointed at a device, it stays where the device was: no named place.
      preset = place ? (args.preset as string) : 'manual'
      report()
      const what = place ? `the ${preset}` : mover ? (args.preset as string) : undefined
      // Above or below what the head tilts to, the aim stops short: at zoom z the picture reaches
      // FOV / 2z past it, so a zoom that keeps the target in is named.
      const short = Math.abs(target.tilt - tilt)
      const keep = Math.floor(FOV / 2 / short)
      const beyond =
        short > 0.5
          ? `; it is ${Math.round(target.tilt)}° ${target.tilt > tilt ? 'up' : 'down'}, past the ${Math.round(tilt)}° the head tilts to, so it shows ${short < FOV / 2 / zoom ? 'near the edge of the picture' : 'outside the picture at this zoom'}${keep >= 1 ? `; zoom ${Math.min(4, keep)} or less keeps it in` : '; no zoom brings it in'}`
          : ''
      return `looking at ${what ?? `pan ${Math.round(pan)}°, tilt ${Math.round(tilt)}°`}${what && preset === 'manual' ? ` (pan ${Math.round(pan)}°, tilt ${Math.round(tilt)}°)` : ''}${beyond}`
    },
  )
  dev.tool(
    {
      name: 'zoom',
      description: 'Zoom the camera in or out.',
      timeout: 10,
      params: { level: { type: 'number', minimum: 1, maximum: 4, description: 'magnification, 1 to 4' } },
      required: ['level'],
      uses: ['head'],
      ui: { label: 'Zoom' },
    },
    async (call, { level }) => {
      const from = zoom
      for (let i = 1; i <= 10; i++) {
        await wait(call, 60)
        zoom = from + (level - from) * (i / 10)
        cam.fov = FOV / zoom
        cam.updateProjectionMatrix()
      }
      zoom = level
      report()
      return `zoom ${level}×`
    },
  )
  dev.tool(
    {
      name: 'take_photo',
      description:
        'Take a full-size photo of what the camera sees now and keep it; comms-01 send can take it home with a report by its id.',
      timeout: 10,
      params: {},
      ui: { label: 'Take photo' },
    },
    async () => {
      const id = `photo-${world.photos.size + 1}`
      const hour = world.clock.hour()
      const { elevation, azimuth } = sunAt(hour)
      // The sun is in the picture when it is above the horizon and inside the zoomed field of view;
      // the camera's own azimuth is minus its pan (pan is positive to the left, azimuth clockwise).
      const vfov = FOV / zoom
      const hfov = THREE.MathUtils.radToDeg(
        2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(vfov / 2)) * (16 / 9)),
      )
      const across = Math.abs(wrap(azimuth + pan))
      const inFrame = elevation > -1 && across < hfov / 2 && Math.abs(elevation - tilt) < vfov / 2
      world.photos.set(id, {
        id,
        by: dev.id,
        jpeg: await world.snapshot(cam, 1280, 720),
        at: world.clock.label(),
        sun: { inFrame, elevation, azimuth },
      })
      // The devices inside the zoomed view, near enough to make out.
      cam.updateMatrixWorld()
      const frustum = new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse),
      )
      const seen = movers
        .filter(
          ([, o]) => o.visible && frustum.containsPoint(middle(o)) && middle(o).distanceTo(at) < 150 * zoom,
        )
        .map(([id]) => id)
      const sun = inFrame
        ? 'the sun is in the picture'
        : `the sun (azimuth ${Math.round(azimuth)}°, elevation ${Math.round(elevation)}°) is ${elevation > -1 ? 'not in the picture' : 'below the horizon'}`
      return {
        detail: `${id} taken at ${world.clock.label()}: pan ${Math.round(pan)}°, tilt ${Math.round(tilt)}°, zoom ${zoom}×; ${seen.length ? `in the picture: ${seen.join(', ')}` : 'no device in the picture'}; ${sun}`,
        data: { photo: id, devices: seen, sun_in_picture: inFrame },
      }
    },
  )
  world.onReset(() => {
    pan = wrap(start.pan)
    tilt = start.tilt
    zoom = 1
    cam.fov = FOV
    cam.updateProjectionMatrix()
    preset = 'base'
    head.rotation.set(THREE.MathUtils.degToRad(-tilt), NORTH + THREE.MathUtils.degToRad(pan), 0)
    report()
  })
  return dev
}
