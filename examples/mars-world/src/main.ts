import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { coveredTextures } from './assets.js'
import { buildBase, GROUND_CONTACTS, LAYOUT } from './base.js'
import { MarsClock, SOL_MINUTES, START_HOURS, type TimeOfDay } from './clock.js'
import { DETAIL_AREAS } from './details.js'
import { buildDevices, DEVICES, MONOLITH } from './devices.js'
import { DmWatch } from './dm/watch.js'
import { buildDust } from './dust.js'
import { buildEffects } from './effects.js'
import type { EventKind, Headline } from './live/events.js'
import { connectDevices } from './live/index.js'
import { watchers } from './live/world.js'
import { buildMinimap } from './minimap.js'
import { buildOverlay, type Lang } from './overlay.js'
import { applyShot, SHOTS } from './shots.js'
import { buildSky, type Light, lightAt, updateSky } from './sky.js'
import { buildRocks, buildTerrain, FROST, PAD_RADIUS } from './terrain.js'

const params = new URLSearchParams(location.search)
const app = document.getElementById('app') as HTMLElement

// ?quality=high renders at the full Retina resolution with ambient occlusion; balanced (the default)
// caps the pixel ratio and leaves ambient occlusion out, which costs a quarter of the GPU's frame
// for shading that is hard to see at these distances; low renders at one pixel per CSS pixel.
const QUALITY = params.get('quality') ?? 'balanced'
const PIXEL_RATIO =
  QUALITY === 'high'
    ? Math.min(devicePixelRatio, 2)
    : QUALITY === 'low'
      ? 1
      : Math.min(devicePixelRatio, 1.25)
// ?time= is morning, noon, sunset or night, or a local hour such as 19.5.
const asked = params.get('time') ?? 'morning'
const START =
  asked in START_HOURS
    ? START_HOURS[asked as TimeOfDay]
    : Number.isFinite(Number(asked))
      ? Number(asked) % 24
      : START_HOURS.morning
// The local time runs a sol in ?sol= minutes (40 by default) from the hour ?time= picks; screenshots
// hold it still, so a view looks the same every time.
const clock = new MarsClock(START, Number(params.get('sol') ?? (params.has('shot') ? 0 : SOL_MINUTES)))

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: params.has('shot'),
})
renderer.setPixelRatio(PIXEL_RATIO)
renderer.setSize(innerWidth, innerHeight)
renderer.toneMapping = THREE.AgXToneMapping
renderer.toneMappingExposure = 1.0
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
// Nothing large moves yet, so the sun's shadow map is redrawn three times a second, not every frame.
renderer.shadowMap.autoUpdate = false
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 4000)

// Sky, sunlight, and the dusty air that softens everything in the distance, all following the clock.
let light = lightAt(clock.hour())
const sky = buildSky(light)
scene.add(sky)
const skyScene = new THREE.Scene()
const envSky = buildSky(light)
skyScene.add(envSky)
const pmrem = new THREE.PMREMGenerator(renderer)
scene.fog = new THREE.FogExp2(0, 0)
const sun = new THREE.DirectionalLight()
sun.castShadow = true
sun.shadow.mapSize.setScalar(QUALITY === 'high' ? 4096 : 2048)
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 320 })
sun.shadow.bias = -0.0004
sun.shadow.normalBias = 0.04
scene.add(sun, sun.target)
const hemi = new THREE.HemisphereLight(0, new THREE.Color(0.22, 0.1, 0.06))
// Starlight and the moons at night: a faint blue light from above, so the base still reads.
const nightFill = new THREE.DirectionalLight(new THREE.Color(0.55, 0.65, 1), 0)
nightFill.position.set(-30, 100, 40)
scene.add(hemi, nightFill)
const dustColor = new THREE.Color()
const LOW_SUN = new THREE.Color(1, 0.62, 0.42)
const DUST_TINT = new THREE.Color(1.05, 0.78, 0.6)
const STORM_SKY = new THREE.Color(0.5, 0.3, 0.17)
let envHour = Number.NaN
let envStorm = 0
/**
 * Moves the sky and every light to `light`, thickened by a dust storm of strength `storm` (0–1): the
 * sky goes a flat dusty brown, the distance fades, the sun dims. The environment map, which takes a
 * few ms, follows every quarter hour and every tenth of a storm.
 */
function applyLight(hour: number, light: Light, storm = 0) {
  if (storm > 0) {
    const brown = STORM_SKY.clone().multiplyScalar(0.25 + 0.75 * light.day)
    light.horizon.lerp(brown, storm * 0.85)
    light.zenith.lerp(brown.multiplyScalar(0.8), storm * 0.9)
  }
  updateSky(sky, light)
  const fog = scene.fog as THREE.FogExp2
  fog.color.copy(light.horizon).multiplyScalar(0.95)
  fog.density = 0.0032 - 0.0012 * light.day - 0.0008 * light.night + storm * 0.012
  const up = THREE.MathUtils.smoothstep(light.elevation, -3, 3)
  sun.color.setRGB(1, 0.9, 0.8).lerp(LOW_SUN, 1 - light.day)
  sun.intensity = (1.4 + 3.4 * light.day) * up * (1 - 0.75 * storm)
  sun.position.copy(light.sun).multiplyScalar(120)
  hemi.color.copy(light.horizon)
  hemi.intensity = (0.25 + 0.15 * light.day) * (1 + 0.4 * storm)
  nightFill.intensity = 0.35 * light.night
  scene.environmentIntensity = 0.35 + 0.25 * light.day - 0.2 * light.night
  renderer.toneMappingExposure = 1 + 0.5 * light.night
  dustColor.copy(light.horizon).multiply(DUST_TINT)
  // Frost settles on the ground in the small hours and is gone soon after sunrise.
  FROST.value =
    0.85 * THREE.MathUtils.smoothstep(hour, 1, 6) * (1 - THREE.MathUtils.smoothstep(hour, 6.5, 7.8))
  if (!(Math.abs(hour - envHour) < 0.25) || Math.abs(storm - envStorm) > 0.1) {
    envHour = hour
    envStorm = storm
    updateSky(envSky, light)
    const old = scene.environment
    scene.environment = pmrem.fromScene(skyScene, 0.02).texture
    old?.dispose()
  }
}
applyLight(clock.hour(), light)

const status = document.getElementById('status') as HTMLElement
scene.add(buildTerrain(GROUND_CONTACTS))
const base = buildBase()
scene.add(base.group)
const devices = await buildDevices(base)
scene.add(devices.group)
const keepClear = (x: number, z: number) =>
  Math.hypot(x, z) < 13 ||
  (Math.abs(x - 18.5) < 11 && Math.abs(z + 2) < 6) ||
  (x > -28 && x < -10 && z > -6 && z < 22) ||
  Math.hypot(x - LAYOUT.camBase[0], z - LAYOUT.camBase[1]) < 2 ||
  Math.hypot(x - LAYOUT.flag[0], z - LAYOUT.flag[1]) < 4 ||
  Math.hypot(x - LAYOUT.field[0], z - LAYOUT.field[1]) < 2.5 ||
  (x > 8 && x < 36 && z > 10 && z < 30) ||
  Math.hypot(x - 6, z - 42) < 13 ||
  Math.hypot(x, z) < PAD_RADIUS * 0.5 ||
  Math.hypot(x + 9, z + 13.5) < 8 ||
  DETAIL_AREAS.some((a) => Math.hypot(x - a.x, z - a.z) < a.r) ||
  // The west field stays clear for the rover's and the hopper's work there.
  (x > -54 && x < -12 && z > 14 && z < 54)
const rocks = await buildRocks(keepClear)
scene.add(rocks.group)
// Dust drifting in the air, ochre in the sunlight; ?dust=0 leaves it out.
const dust = buildDust(dustColor)
if (params.get('dust') !== '0') scene.add(dust.points)
// Meteorites and dust devils, drawn only while one happens.
const effects = buildEffects(scene, dustColor)
// Every render, the main view's and each device camera's, picks the rocks that camera needs.
scene.onBeforeRender = (_renderer, _scene, view) => rocks.pick(view)

// Post-processing: ambient occlusion, bloom on lamps and beacons, a soft vignette, then tone mapping.
const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
// ?ao=1 or ?ao=0 overrides what the quality level picks.
if (params.get('ao') === '1' || (QUALITY === 'high' && params.get('ao') !== '0')) {
  const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight)
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1.0 })
  composer.addPass(gtao)
}
// Only lamps and beacons are bright enough to bloom; at a lower threshold the habitat's lit windows
// spread into a white haze over the whole module.
if (params.get('bloom') !== '0')
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.45, 1.2))
composer.addPass(
  new ShaderPass({
    uniforms: { tDiffuse: { value: null }, strength: { value: 0.28 } },
    vertexShader:
      'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
      void main() { vec4 c = texture2D(tDiffuse, vUv); float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - strength * smoothstep(0.4, 0.9, d); gl_FragColor = c; }`,
  }),
)
composer.addPass(new OutputPass())

// Fixed viewpoints: keys 1–9 and 0, or ?shot=<name>.
let shot = applyShot(camera, params.get('shot') ?? 'overview')
/** A view the auto camera set up for an event in one place (a meteorite), not one of SHOTS. */
let eventView: Headline = { en: '', zh: '' }
const shotLabel = () =>
  shot === 'event'
    ? overlay.view(shot, eventView[overlay.lang()], auto)
    : overlay.view(shot, SHOTS.find((s) => s.name === shot)?.label ?? '', auto)
/** Whether the view follows what happens (A); a view picked by hand holds it off for a while. */
let auto = false
let autoHeldUntil = 0

// Name tags over the devices.
const tags = document.getElementById('tags') as HTMLElement
const tagEls = DEVICES.map((d) => {
  const el = document.createElement('div')
  el.className = 'tag'
  el.innerHTML = `<b>${d.name}</b><span>${d.id}</span>`
  tags.appendChild(el)
  return { el, anchor: devices.anchors.get(d.id) as THREE.Object3D, top: new THREE.Vector3() }
})
tags.hidden = params.get('tags') === '0'
// What Monolith says over the radio, in a bubble over it while it speaks.
const speech = document.createElement('div')
speech.className = 'speech'
speech.hidden = true
tags.appendChild(speech)
const mouth = new THREE.Vector3()
// The minimap in the top-right corner; M toggles it.
const minimap = buildMinimap(devices.anchors, camera, () => overlay.mapWords())
minimap.hidden = params.get('minimap') === '0'
document.body.appendChild(minimap)
addEventListener('keydown', (e) => {
  if (e.key === 'l') tags.hidden = !tags.hidden
  const n = e.key === '0' ? 10 : Number(e.key)
  const next = SHOTS[n - 1]
  if (n >= 1 && next) {
    shot = applyShot(camera, next.name)
    autoHeldUntil = performance.now() + 30_000
  }
})
const v = new THREE.Vector3()
const box = new THREE.Box3()
// The follow view keeps behind and above the device it follows, easing after it as it turns.
const eye = new THREE.Vector3()
const aim = new THREE.Vector3()
const ahead = new THREE.Vector3()
let following: THREE.Object3D | undefined
function follow(dt: number) {
  const name = SHOTS.find((s) => s.name === shot)?.follow
  const target = name ? devices.anchors.get(name) : undefined
  if (!target) {
    following = undefined
    return
  }
  const h = target.rotation.y
  const p = target.position
  const [back, up, round = 0] = SHOTS.find((s) => s.name === shot)?.behind ?? [10, 5]
  eye.set(p.x - Math.sin(h + round) * back, p.y + up, p.z - Math.cos(h + round) * back)
  const lead = round ? 1 : 4
  aim.set(p.x + Math.sin(h) * lead, p.y + 0.5, p.z + Math.cos(h) * lead)
  // A view just switched to jumps there; after that it eases.
  const k = following === target ? Math.min(1, dt * 2.5) : 1
  following = target
  camera.position.lerp(eye, k)
  ahead.copy(camera.position).add(camera.getWorldDirection(v).multiplyScalar(10))
  camera.lookAt(ahead.lerp(aim, k))
}
function placeSpeech() {
  const { monolith } = devices.parts
  const { text, until } = monolith.speech
  speech.hidden = tags.hidden || performance.now() > until
  if (speech.hidden) return
  if (speech.textContent !== text) speech.textContent = text
  mouth.copy(monolith.group.position)
  mouth.y += 2.1
  mouth.project(camera)
  speech.hidden = mouth.z > 1
  speech.style.transform = `translate(${((mouth.x + 1) / 2) * innerWidth}px, ${((1 - mouth.y) / 2) * innerHeight}px) translate(-50%, -100%)`
}
function placeTags() {
  if (tags.hidden) return
  const shown = SHOTS.find((s) => s.name === shot)?.devices
  for (const [i, { el, anchor, top }] of tagEls.entries()) {
    if (shown && !shown.includes((DEVICES[i] as { id: string }).id)) {
      el.style.display = 'none'
      continue
    }
    // Measuring a model walks all its parts, so where a tag sits is refreshed twice a second.
    if (frames % 15 === 0) {
      // An anchor without meshes (a point on a building) marks the spot itself.
      if (box.setFromObject(anchor).isEmpty()) anchor.getWorldPosition(top)
      else {
        box.getCenter(top)
        top.y = box.max.y + 0.15
      }
    }
    v.copy(top).project(camera)
    const visible = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05
    el.style.display = visible ? '' : 'none'
    el.style.transform = `translate(${((v.x + 1) / 2) * innerWidth}px, ${((1 - v.y) / 2) * innerHeight}px) translate(-50%, -100%)`
  }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
  composer.setSize(innerWidth, innerHeight)
})

// Nothing here moves fast, so frames are capped at 30 a second by default; ?fps=60 lifts the cap.
const FPS = Number(params.get('fps')) || 30
const frameClock = new THREE.Clock()
let frames = 0
let last = 0
let lastT = 0
let fpsFrames = 0
let fpsSince = performance.now()
const hint = () => shotLabel()
// ?stats adds the draw calls, triangles and JavaScript time of an average frame to the status line
// (averaged, since every tenth frame also redraws the shadow map).
const STATS = params.has('stats')
let cpu = 0
let draws = 0
let triangles = 0
renderer.info.autoReset = false
renderer.setAnimationLoop(() => {
  const start = performance.now()
  if (start - last < 1000 / FPS - 4) return
  last = start
  renderer.info.reset()
  const t = frameClock.getElapsedTime()
  const dt = t - lastT
  lastT = t
  if (frames % 10 === 0) renderer.shadowMap.needsUpdate = true
  const hour = clock.hour()
  const storm = live?.world.events?.storm ?? 0
  light = lightAt(hour)
  applyLight(hour, light, storm)
  base.update(t)
  devices.update(t)
  dust.update(t, storm)
  effects.update(t)
  follow(dt)
  sky.position.copy(camera.position)
  composer.render()
  placeTags()
  placeSpeech()
  cpu += performance.now() - start
  draws += renderer.info.render.calls
  triangles += renderer.info.render.triangles
  frames += 1
  fpsFrames += 1
  const now = performance.now()
  if (now - fpsSince > 1000) {
    const stats = STATS
      ? ` · ${Math.round(draws / fpsFrames)} draws · ${(triangles / fpsFrames / 1e6).toFixed(1)} M tris · ${(cpu / fpsFrames).toFixed(1)} ms js/frame`
      : ''
    status.textContent = `${hint()} · ${Math.round((fpsFrames * 1000) / (now - fpsSince))} fps (${overlay.quality(QUALITY)})${stats}`
    cpu = 0
    draws = 0
    triangles = 0
    fpsFrames = 0
    fpsSince = now
  }
  // Screenshots wait for this marker: a few frames after everything has loaded.
  if (frames === 30) {
    document.body.dataset.ready = '1'
    document.body.dataset.covered = coveredTextures.join(',')
  }
})
const hub = params.get('hub')
const live = hub
  ? connectDevices(
      hub,
      renderer,
      scene,
      devices.parts,
      sky,
      clock,
      (line) => console.log(line),
      params.get('devices')?.split(','),
      {
        // ?events=auto starts an event every few minutes, picked from the seed; otherwise events
        // start only from the controls panel.
        auto: params.get('events') === 'auto',
        seed: Number(params.get('seed') ?? Math.floor(Math.random() * 1e9)),
      },
    )
  : undefined
if (live) {
  live.world.effects = effects
  // Scripts (an evaluation, a test) reach the events and the director here: mars.director.next().
  Object.assign(window, { mars: { events: live.world.events, director: live.director, world: live.world } })
}
// What is drawn over the scene: the bar along the bottom, the activity list, banners, the controls
// panel and the About card, in English or Chinese (?lang=zh, or the button; the page remembers).
const stored = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
// The DM's decisions, for the DM panel: the DM itself works in Agnes's loop, switched per
// conversation in Agnes.
const dmWatch = hub ? new DmWatch(hub) : undefined
dmWatch?.start()
const eventsMode = (params.get('events') ?? 'manual') as 'auto' | 'manual' | 'off'
const overlay = buildOverlay({
  clock,
  live,
  tags: tagEls.map(({ el }, i) => ({ el, ...(DEVICES[i] as { id: string; name: string }) })),
  eventsMode,
  lang: (params.get('lang') ?? stored('mars-lang') ?? 'en') === 'zh' ? 'zh' : ('en' as Lang),
  // The About card opens by itself the first time the page is visited.
  showHelp: !params.has('shot') && !stored('mars-seen'),
  ...(dmWatch ? { dm: { decisions: () => dmWatch.decisions, version: () => dmWatch.version } } : {}),
})
try {
  localStorage.setItem('mars-seen', '1')
} catch {}
addEventListener('keydown', (e) => {
  if (e.key === 'e') overlay.toggleEvents()
  if (e.key === '?' || e.key === 'h') overlay.toggleHelp()
})
// The auto camera (A, on by default with a hub): it goes where a call starts or an event happens,
// and stays at least a few seconds on each view; an event goes before a call.
const VIEW_OF: Record<string, string> = {
  'hopper-01': 'hopper',
  'rover-01': 'rover',
  'suit-01': 'suit',
  [MONOLITH.id]: 'monolith',
  'airlock-01': 'airlock',
  'habitat-01': 'airlock',
  'lab-01': 'dock',
  'power-01': 'power',
  'weather-01': 'comms',
  'comms-01': 'comms',
  'cam-base': 'overview',
}
const EVENT_VIEW: Record<EventKind, string> = {
  dust_storm: 'overview',
  suit_leak: 'suit',
  dust_devil: 'power',
  meteorite: 'event',
}
auto = Boolean(live) && !params.has('shot') && params.get('auto') !== '0'
let autoSince = 0
const autoTo = (name: string, urgent = false) => {
  const now = performance.now()
  if (!auto || now < autoHeldUntil || name === shot || (!urgent && now - autoSince < 8000)) return
  shot = applyShot(camera, name)
  autoSince = now
}
if (live) {
  watchers.activity.push((a) => {
    const view = VIEW_OF[a.device]
    if (view && a.progress === undefined && !a.status) autoTo(view)
  })
  live.world.events?.listeners.push((h, phase) => {
    if (phase !== 'start') return
    if (h.kind === 'meteorite' && h.place) {
      // From the base side of the fall, a little above it, so the streak, the flash and the dust show.
      const { x, z } = h.place
      const now = performance.now()
      if (!auto || now < autoHeldUntil) return
      camera.position.set(x + 16, 7, z + 12)
      camera.lookAt(x, 2, z)
      camera.fov = 50
      camera.updateProjectionMatrix()
      shot = 'event'
      eventView = h.headline
      autoSince = now
      return
    }
    autoTo(EVENT_VIEW[h.kind], true)
  })
}
addEventListener('keydown', (e) => {
  if (e.key !== 'a' || !live) return
  auto = !auto
  autoHeldUntil = 0
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
  clock.reset()
  resetButton.disabled = false
  resetting = false
}
resetButton.addEventListener('click', () => void reset())
addEventListener('keydown', (e) => {
  if (e.key === 'r') void reset()
})
