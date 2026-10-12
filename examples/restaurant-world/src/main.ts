import * as THREE from 'three'
import { buildActors } from './actors.js'
import { ROOM } from './layout.js'
import { connectDevices } from './live/index.js'
import { buildRoom } from './room.js'
import { IsoView } from './view.js'

const params = new URLSearchParams(location.search)
const app = document.getElementById('app') as HTMLElement
const status = document.getElementById('status') as HTMLElement

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: params.has('shot'),
})
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
renderer.setSize(innerWidth, innerHeight)
renderer.toneMapping = THREE.AgXToneMapping
renderer.toneMappingExposure = 1.1
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
// Nothing large moves yet, so the shadow map is redrawn a few times a second, not every frame.
renderer.shadowMap.autoUpdate = false
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x17110e)
const view = new IsoView()
// ?view=x,y,span frames a plan point (x east, y north) with `span` metres of floor top to bottom.
const framing = params.get('view')?.split(',').map(Number)
if (framing?.length === 3)
  view.set({ x: framing[0] as number, y: framing[1] as number, span: framing[2] as number })
view.listen(renderer.domElement)

const room = await buildRoom()
scene.add(room.group)
const actors = buildActors()
scene.add(actors.group)

// Warm light from the ceiling: a soft fill, and one key light high above for the shadows.
const fill = new THREE.HemisphereLight(0xfff3e2, 0x4a3426, 1.9)
scene.add(fill)
const key = new THREE.DirectionalLight(0xffe7cc, 2.2)
key.position.set(ROOM.w / 2 + 4, 18, -ROOM.d / 2 + 5)
key.target.position.set(ROOM.w / 2, 0, -ROOM.d / 2)
key.castShadow = true
key.shadow.mapSize.setScalar(4096)
Object.assign(key.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 50 })
key.shadow.bias = -0.0005
key.shadow.normalBias = 0.02
scene.add(key, key.target)
// room-01's lighting scenes: the lights ease to each; party cycles slowly through colours.
const SCENES: Record<string, { fill: number; key: number; color: number; exposure: number }> = {
  bright: { fill: 2.4, key: 2.8, color: 0xffffff, exposure: 1.15 },
  warm: { fill: 1.9, key: 2.2, color: 0xfff3e2, exposure: 1.1 },
  dim: { fill: 0.7, key: 0.55, color: 0xffc98a, exposure: 1.0 },
  party: { fill: 1.6, key: 0.5, color: 0xff8ad8, exposure: 1.05 },
}
let lighting = 'warm'
const want = new THREE.Color()
function updateLights(t: number) {
  const s = SCENES[lighting] ?? (SCENES.warm as (typeof SCENES)[string])
  want.set(s.color)
  if (lighting === 'party') want.setHSL((t * 0.08) % 1, 0.95, 0.55)
  fill.color.lerp(want, 0.05)
  key.color.lerp(want, 0.05)
  fill.intensity += (s.fill - fill.intensity) * 0.05
  key.intensity += (s.key - key.intensity) * 0.05
  renderer.toneMappingExposure += (s.exposure - renderer.toneMappingExposure) * 0.05
}
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight)
  view.apply()
})

// Frames are capped at 30 a second by default; ?fps=60 lifts the cap.
const FPS = Number(params.get('fps')) || 30
let frames = 0
let last = 0
let fpsFrames = 0
let fpsSince = performance.now()
renderer.setAnimationLoop(() => {
  const start = performance.now()
  if (start - last < 1000 / FPS - 4) return
  last = start
  actors.update(start / 1000)
  updateLights(start / 1000)
  if (frames % 10 === 0) renderer.shadowMap.needsUpdate = true
  renderer.render(scene, view.camera)
  frames += 1
  fpsFrames += 1
  if (start - fpsSince > 1000) {
    status.textContent = `${Math.round((fpsFrames * 1000) / (start - fpsSince))} fps`
    fpsFrames = 0
    fpsSince = start
  }
  // Screenshots wait for this marker: a few frames after everything has loaded.
  if (frames === 30) document.body.dataset.ready = '1'
})

// ?hub=ws://127.0.0.1:4180 connects the restaurant's devices to an AgnesHub.
const hub = params.get('hub')
const live = hub
  ? connectDevices(
      hub,
      renderer,
      scene,
      actors,
      (line) => console.log(line),
      params.get('devices')?.split(','),
    )
  : undefined
if (live)
  live.world.light = (name) => {
    lighting = name
  }
// Scripts (an evaluation, a test) reach the world here.
if (live) Object.assign(window, { restaurant: { world: live.world, reset: live.reset, view } })
