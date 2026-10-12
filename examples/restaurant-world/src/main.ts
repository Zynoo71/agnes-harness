import * as THREE from 'three'
import { ROOM } from './layout.js'
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
view.listen(renderer.domElement)

const room = await buildRoom()
scene.add(room.group)

// Warm light from the ceiling: a soft fill, and one key light high above for the shadows.
scene.add(new THREE.HemisphereLight(0xfff3e2, 0x4a3426, 1.9))
const key = new THREE.DirectionalLight(0xffe7cc, 2.2)
key.position.set(ROOM.w / 2 + 4, 18, -ROOM.d / 2 + 5)
key.target.position.set(ROOM.w / 2, 0, -ROOM.d / 2)
key.castShadow = true
key.shadow.mapSize.setScalar(4096)
Object.assign(key.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 50 })
key.shadow.bias = -0.0005
key.shadow.normalBias = 0.02
scene.add(key, key.target)
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
