import * as THREE from 'three'
import { buildActors } from './actors.js'
import { DmWatch } from './dm/watch.js'
import { DEVICES } from './labels.js'
import { BACK_OF_HOUSE_Y, BAR_X, FIXTURES, PRIVATE_ROOM, PRIVATE_SPEAKER, ROOM, TABLES } from './layout.js'
import { deviceCameras } from './live/camera.js'
import { connectDevices } from './live/index.js'
import { watchers } from './live/world.js'
import { buildMinimap } from './minimap.js'
import { buildOverlay, type Lang } from './overlay.js'
import { buildRoom } from './room.js'
import { place } from './shapes.js'
import { SHOTS, shotNamed } from './shots.js'
import { buildSound } from './sound.js'
import { IsoView } from './view.js'

const params = new URLSearchParams(location.search)
const app = document.getElementById('app') as HTMLElement

// ?quality=high renders at the full Retina resolution; low at one pixel per CSS pixel.
const QUALITY = params.get('quality') ?? 'balanced'
const PIXEL_RATIO =
  QUALITY === 'high' ? Math.min(devicePixelRatio, 2) : QUALITY === 'low' ? 1 : Math.min(devicePixelRatio, 1.5)

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: params.has('shot'),
})
renderer.setPixelRatio(PIXEL_RATIO)
renderer.setSize(innerWidth, innerHeight)
renderer.toneMapping = THREE.AgXToneMapping
renderer.toneMappingExposure = 1.1
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
// Nothing large moves fast, so the shadow map is redrawn a few times a second, not every frame.
renderer.shadowMap.autoUpdate = false
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x17110e)
const view = new IsoView()
// Fixed views: keys 1–9, or ?shot=<name>; ?view=x,y,span frames a plan point (x east, y north)
// with `span` metres of floor top to bottom.
let shot = shotNamed(params.get('shot') ?? 'overview')
view.set(shot)
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
// In the evening (room-01's `outside`) the daylight through the windows is gone: every scene is darker.
const EVENING = { fill: 1.1, key: 1.4 }
function updateLights(t: number) {
  const s = SCENES[lighting] ?? (SCENES.warm as (typeof SCENES)[string])
  const dark = live?.world.outside === 'evening' ? 1 : 0
  want.set(s.color)
  if (lighting === 'party') want.setHSL((t * 0.08) % 1, 0.95, 0.55)
  fill.color.lerp(want, 0.05)
  key.color.lerp(want, 0.05)
  fill.intensity += (Math.max(0.35, s.fill - EVENING.fill * dark) - fill.intensity) * 0.05
  key.intensity += (Math.max(0.3, s.key - EVENING.key * dark) - key.intensity) * 0.05
  renderer.toneMappingExposure += (s.exposure - renderer.toneMappingExposure) * 0.05
  // The private room's lamp, over its table: room-02's scene, on top of the dining room's light.
  const p = PRIVATE_SCENES[privateLighting] ?? (PRIVATE_SCENES.warm as (typeof PRIVATE_SCENES)[string])
  want.set(p.color)
  if (privateLighting === 'party') want.setHSL((t * 0.08 + 0.5) % 1, 0.95, 0.55)
  lamp.color.lerp(want, 0.05)
  lamp.intensity += (p.intensity - lamp.intensity) * 0.05
  shade.color.copy(lamp.color).multiplyScalar(0.25 + lamp.intensity / 40)
}
// room-02's scenes for the lamp in the private room.
const PRIVATE_SCENES: Record<string, { intensity: number; color: number }> = {
  bright: { intensity: 30, color: 0xffffff },
  warm: { intensity: 18, color: 0xffd9a8 },
  dim: { intensity: 4, color: 0xffb070 },
  party: { intensity: 60, color: 0xff8ad8 },
}
let privateLighting = 'warm'
const t6 = TABLES.find((t) => t.id === 't6') ?? { x: 0, y: 0 }
const lamp = new THREE.PointLight(0xffd9a8, 18, (PRIVATE_ROOM.x1 - PRIVATE_ROOM.x0) * 1.1, 2)
scene.add(place(lamp, t6.x, t6.y, 2.6))
// The lamp itself, a glowing paper lantern on a cord, so the scene shows at a glance.
const shade = new THREE.MeshBasicMaterial({ color: 0xffd9a8 })
const lantern = new THREE.Group()
lantern.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12).scale(1, 0.85, 1), shade))
lantern.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.6), new THREE.MeshBasicMaterial({ color: 0x2a1a12 })), 0, 0, 0.45))
scene.add(place(lantern, t6.x, t6.y, 2.3))

// Where each device's tag sits: over the robot that moves, or over the fixture it is.
const fixed = (x: number, y: number) => {
  const o = place(new THREE.Object3D(), x, y, 0)
  scene.add(o)
  return o
}
interface Anchor {
  object: THREE.Object3D
  /** Height of the tag over the object's origin, in metres. */
  h: number
  moving?: boolean
}
const ANCHORS: Record<string, Anchor> = {
  'host-01': { object: actors.host.object, h: 1.75, moving: true },
  'menu-01': { object: fixed(FIXTURES.menuBoard.x, FIXTURES.menuBoard.y), h: 2.0 },
  'floor-01': { object: fixed(FIXTURES.screens.x, FIXTURES.screens.y), h: 2.3 },
  'prep-01': { object: actors.prep.object, h: 2.0, moving: true },
  'wok-01': { object: fixed(FIXTURES.wok.x, FIXTURES.wok.y), h: 1.6 },
  'stove-01': { object: fixed(FIXTURES.stove.x, FIXTURES.stove.y), h: 1.6 },
  'arm-01': { object: actors.arm.object, h: 1.3 },
  'bar-01': { object: actors.bartender.object, h: 2.0 },
  'runner-01': { object: actors.runner.object, h: 1.55, moving: true },
  'supplies-01': { object: fixed(FIXTURES.supplies.x, FIXTURES.supplies.y), h: 1.5 },
  'cleaner-01': { object: actors.cleaner.object, h: 0.8, moving: true },
  'room-01': { object: fixed(BAR_X - 1.5, BACK_OF_HOUSE_Y - 0.3), h: 2.2 },
  'room-02': { object: fixed(PRIVATE_SPEAKER.x, PRIVATE_SPEAKER.y - 0.3), h: 2.2 },
  'pos-01': { object: fixed(FIXTURES.cashier.x, FIXTURES.cashier.y), h: 1.45 },
  'cam-01': { object: fixed(ROOM.w - 0.3, 0.3), h: 3.0 },
}

// Name tags over the devices.
const tags = document.getElementById('tags') as HTMLElement
const tagEls = DEVICES.map((d) => {
  const el = document.createElement('div')
  el.className = 'tag'
  el.innerHTML = `<b>${d.en}</b><span>${d.id}</span>`
  tags.appendChild(el)
  return { el, id: d.id, anchor: ANCHORS[d.id] as Anchor }
})
tags.hidden = params.get('tags') === '0'
// What the host robot says, in a bubble over it while it speaks.
const speech = document.createElement('div')
speech.className = 'speech'
speech.hidden = true
tags.appendChild(speech)
const v = new THREE.Vector3()
/** Screen position of a point `h` metres over `object`, or undefined off screen. */
const onScreen = (object: THREE.Object3D, h: number) => {
  object.getWorldPosition(v)
  v.y += h
  v.project(view.camera)
  if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) return undefined
  return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight }
}
function placeTags() {
  if (tags.hidden) return
  for (const { el, id, anchor } of tagEls) {
    const p = shot.devices && !shot.devices.includes(id) ? undefined : onScreen(anchor.object, anchor.h)
    el.style.display = p ? '' : 'none'
    if (p) el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`
  }
  const said = live?.world.speech
  const p = said && performance.now() < said.until ? onScreen(actors.host.object, 1.75) : undefined
  speech.hidden = !p
  if (p && said) {
    if (speech.textContent !== said.text) speech.textContent = said.text
    // The host's tag sits over it too; the bubble goes above the tag.
    speech.style.transform = `translate(${p.x}px, ${p.y - 46}px) translate(-50%, -100%)`
  }
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight)
  view.apply()
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
if (live) {
  live.world.light = (name) => {
    lighting = name
  }
  live.world.lightPrivate = (name) => {
    privateLighting = name
  }
}
// Scripts (an evaluation, a test) reach the world here.
if (live) Object.assign(window, { restaurant: { world: live.world, reset: live.reset, view } })

// What is drawn over the scene: the bar along the bottom, the activity list, banners, the guest's
// cards, the controls panel and the About card, in English or Chinese (?lang=zh, or the button;
// the page remembers).
const stored = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
// The DM's decisions, for the activity list: the DM itself works in Agnes's loop.
const dmWatch = hub ? new DmWatch(hub) : undefined
dmWatch?.start()
const overlay = buildOverlay({
  live,
  tags: tagEls.map(({ el, id }) => ({ el, id })),
  lang: (params.get('lang') ?? stored('restaurant-lang') ?? 'en') === 'zh' ? 'zh' : ('en' as Lang),
  // The About card opens by itself the first time the page is visited.
  showHelp: !params.has('shot') && params.get('about') !== '0' && !stored('restaurant-seen'),
  ...(dmWatch ? { dm: { decisions: () => dmWatch.decisions, version: () => dmWatch.version } } : {}),
})
try {
  localStorage.setItem('restaurant-seen', '1')
} catch {}

// The birthday song through the speakers, once the sound button is on.
// Either room playing it is enough; the louder of the two sets the volume.
buildSound(() => {
  const w = live?.world
  if (!w) return undefined
  const rooms = [w.ambience, w.privateRoom].filter((a) => a.music === 'birthday')
  return rooms.length
    ? { track: 'birthday', volume: Math.max(...rooms.map((a) => a.volume)) }
    : { track: w.ambience.music, volume: w.ambience.volume }
}, document.getElementById('sound') as HTMLButtonElement)

// The minimap in the top-right corner; M toggles it.
const minimap = buildMinimap(
  DEVICES.map((d) => {
    const a = ANCHORS[d.id] as Anchor
    return { id: d.id, object: a.object, moving: Boolean(a.moving) }
  }),
  actors.guest.object,
  () => live?.world.service,
  () => overlay.mapWords(),
)
minimap.hidden = params.get('minimap') === '0'
document.body.appendChild(minimap)

// The picture in picture, top left: the live view of the device at work, from its own camera when
// it has one, else from a camera that keeps beside it, at least a few seconds on each. The main
// view stays where it is. P turns it off and on.
const PIP = { left: 14, top: 76, w: 320, h: 180, every: 3, holdMs: 8000 }
const pipBox = document.getElementById('pip') as HTMLElement
const pipLabel = pipBox.querySelector('span') as HTMLElement
const pipCamera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100)
let pipOn = Boolean(live) && params.get('pip') !== '0'
let pipShown: THREE.PerspectiveCamera | undefined
/** The device the side camera keeps beside, while it shows one without a camera of its own. */
let pipNear: Anchor | undefined
let pipSince = 0
let pipText = () => ''
const eye = new THREE.Vector3()
/** Where the side camera keeps: south-east of the device and above it, as the main view looks. */
const besideOf = (a: Anchor) => {
  a.object.getWorldPosition(v)
  return eye.set(v.x + 2.2, v.y + 2.4, v.z + 2.2)
}
const pipTo = (camera: THREE.PerspectiveCamera, near: Anchor | undefined, text: () => string) => {
  const now = performance.now()
  if (pipShown && now - pipSince < PIP.holdMs) return
  // A side camera just switched to a device starts right beside it.
  if (near && near !== pipNear) camera.position.copy(besideOf(near))
  pipShown = camera
  pipNear = near
  pipSince = now
  pipText = text
}
function keepBeside(a: Anchor) {
  pipCamera.position.lerp(besideOf(a), 0.2)
  a.object.getWorldPosition(v)
  pipCamera.lookAt(v.x, v.y + Math.min(1, a.h * 0.5), v.z)
}
// The picture is drawn into a texture every few frames and laid over the corner every frame.
const pipMap = { value: null as THREE.Texture | null }
const pipMaterial = new THREE.ShaderMaterial({
  uniforms: { map: pipMap },
  vertexShader:
    'varying vec2 vUv; void main() { vUv = vec2(uv.x, 1.0 - uv.y); gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader:
    'uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); }',
  depthTest: false,
})
const pipScene = new THREE.Scene()
pipScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), pipMaterial))
const pipFlat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
function drawPip() {
  pipBox.hidden = !pipOn || !pipShown || !live
  if (pipBox.hidden || !live || !pipShown) return
  if (pipNear) keepBeside(pipNear)
  if (frames % PIP.every === 0 || !pipMap.value)
    pipMap.value = live.world.view(pipShown, PIP.w * 2, PIP.h * 2)
  const text = pipText()
  if (pipLabel.textContent !== text) pipLabel.textContent = text
  const y = innerHeight - PIP.top - PIP.h
  renderer.setScissorTest(true)
  renderer.setViewport(PIP.left, y, PIP.w, PIP.h)
  renderer.setScissor(PIP.left, y, PIP.w, PIP.h)
  renderer.render(pipScene, pipFlat)
  renderer.setScissorTest(false)
  renderer.setViewport(0, 0, innerWidth, innerHeight)
}
if (live) {
  // Until a device starts a call, the ceiling camera.
  const cam = deviceCameras.get('cam-01')
  if (cam) pipTo(cam, undefined, () => overlay.deviceName('cam-01'))
  watchers.activity.push((a) => {
    if (a.progress !== undefined || a.status) return
    const own = deviceCameras.get(a.device)
    const near = ANCHORS[a.device]
    const text = () => `${overlay.deviceName(a.device)} · ${overlay.toolName(a.tool)}`
    if (own) pipTo(own, undefined, text)
    else if (near) pipTo(pipCamera, near, text)
  })
}

// Keys: 1–9 views, L tags, M map, P picture in picture, C the menu card, E controls, ? About.
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const next = SHOTS[Number(e.key) - 1]
  if (next) {
    shot = next
    view.set(next)
  }
  if (e.key === 'l') tags.hidden = !tags.hidden
  if (e.key === 'm') minimap.hidden = !minimap.hidden
  if (e.key === 'p') pipOn = !pipOn
  if (e.key === 'c') overlay.toggleMenu()
  if (e.key === 'e') overlay.toggleControls()
  if (e.key === '?' || e.key === 'h') overlay.toggleHelp()
  if (e.key === 'r') void reset()
})

// Reset (the button, or R): every device back to how the page started it, without reloading, so
// the devices stay connected to the hub. A demo control of the page, not part of any device.
const resetButton = document.getElementById('reset') as HTMLButtonElement
resetButton.hidden = !live
let resetting = false
const reset = async () => {
  if (!live || resetting) return
  resetting = true
  resetButton.disabled = true
  await live.reset()
  resetButton.disabled = false
  resetting = false
}
resetButton.addEventListener('click', () => void reset())

// Frames are capped at 30 a second by default; ?fps=60 lifts the cap. ?stats adds the draw calls,
// triangles and JavaScript time of an average frame to the status line.
const FPS = Number(params.get('fps')) || 30
const STATS = params.has('stats')
let frames = 0
let last = 0
let fpsFrames = 0
let fpsSince = performance.now()
let cpu = 0
let draws = 0
let triangles = 0
renderer.info.autoReset = false
renderer.setAnimationLoop(() => {
  const start = performance.now()
  if (start - last < 1000 / FPS - 4) return
  last = start
  renderer.info.reset()
  actors.update(start / 1000)
  updateLights(start / 1000)
  if (frames % 10 === 0) renderer.shadowMap.needsUpdate = true
  renderer.render(scene, view.camera)
  draws += renderer.info.render.calls
  triangles += renderer.info.render.triangles
  drawPip()
  placeTags()
  cpu += performance.now() - start
  frames += 1
  fpsFrames += 1
  if (start - fpsSince > 1000) {
    const stats = STATS
      ? ` · ${Math.round(draws / fpsFrames)} draws · ${(triangles / fpsFrames / 1e6).toFixed(2)} M tris · ${(cpu / fpsFrames).toFixed(1)} ms js/frame`
      : ''
    const name = overlay.lang() === 'zh' ? shot.zh : shot.en
    overlay.stats(`${name} · ${Math.round((fpsFrames * 1000) / (start - fpsSince))} fps${stats}`)
    cpu = 0
    draws = 0
    triangles = 0
    fpsFrames = 0
    fpsSince = start
  }
  // Screenshots wait for this marker: a few frames after everything has loaded.
  if (frames === 30) document.body.dataset.ready = '1'
})
