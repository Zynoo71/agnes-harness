import * as THREE from 'three'
import { MAP_AREA } from './live/map.js'

const params = new URLSearchParams(location.search)
const app = document.getElementById('app') as HTMLElement
const status = document.getElementById('status') as HTMLElement

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: params.has('shot'),
})
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25))
renderer.setSize(innerWidth, innerHeight)
renderer.toneMapping = THREE.AgXToneMapping
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x17110e)
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 200)

// The room: x east and z south in metres; the floor map's frame is x east, y north (y = −z).
const W = MAP_AREA.x1 - 1
const D = MAP_AREA.y1 - 1
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(W, D),
  new THREE.MeshStandardMaterial({ color: 0x8a6a52, roughness: 0.8 }),
)
floor.rotation.x = -Math.PI / 2
floor.position.set(W / 2, 0, -D / 2)
floor.receiveShadow = true
scene.add(floor)

scene.add(new THREE.HemisphereLight(0xfff1e0, 0x3a2a20, 1.2))
const lamp = new THREE.DirectionalLight(0xffe6c8, 2)
lamp.position.set(W / 2 - 6, 14, -D / 2 + 8)
lamp.target.position.set(W / 2, 0, -D / 2)
lamp.castShadow = true
scene.add(lamp, lamp.target)

// The overview: from above the entrance side, the whole room in frame.
camera.position.set(W / 2, 17, 9)
camera.lookAt(W / 2, 0, -D / 2 + 1)

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
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
  renderer.render(scene, camera)
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
