import * as THREE from 'three'
import type { Parts } from './devices.js'
import { heightAt } from './terrain.js'

/**
 * Wheel tracks: segments kept (a ring, the oldest overwritten), metres between samples, seconds to
 * fade, the wheels' offset and half width (m), and how dark they start, fresher than the old ones.
 */
const TRACKS = { segments: 600, step: 0.4, fade: 90, gauge: 1.1, half: 0.22, opacity: 0.5 }
/** Dust kicked up: particles kept (a ring), and how many a second the rover and the hopper raise. */
const DUST = { count: 256, rover: 14, hopper: 70 }
/** The hopper raises dust while its engine burns this close to the ground, in metres. */
const BLAST_HEIGHT = 5
/** How high the hopper stands over the ground on its pad, in metres. */
const HOPPER_FEET = 0.12

/**
 * The rover's wheel tracks: one ribbon of darker, flattened regolith (like the static tracks), two
 * strips a segment, each vertex stamped with when it was laid so the shader fades it out. Segments
 * are written in place into a ring of buffers, and only the new one goes to the GPU.
 */
function wheelTracks(time: { value: number }) {
  const n = TRACKS.segments
  const position = new THREE.BufferAttribute(new Float32Array(n * 8 * 3), 3)
  const born = new THREE.BufferAttribute(new Float32Array(n * 8).fill(-1e6), 1)
  const normal = new THREE.BufferAttribute(new Float32Array(n * 8 * 3), 3)
  for (let i = 0; i < n * 8; i++) normal.setXYZ(i, 0, 1, 0)
  const index: number[] = []
  for (let i = 0; i < n * 2; i++) index.push(4 * i, 4 * i + 2, 4 * i + 1, 4 * i + 1, 4 * i + 2, 4 * i + 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', position)
  geometry.setAttribute('normal', normal)
  geometry.setAttribute('born', born)
  geometry.setIndex(index)
  geometry.setDrawRange(0, 0)
  const material = new THREE.MeshStandardMaterial({
    color: 0x3a1e12,
    roughness: 1,
    transparent: true,
    opacity: TRACKS.opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide,
  })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.now = time
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float born;\nuniform float now;\nvarying float vFade;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvFade = 1.0 - smoothstep(0.0, ${TRACKS.fade.toFixed(1)}, now - born);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;')
  }
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'wheel-tracks'
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  mesh.visible = false
  // The last edge laid: each wheel's inner and outer corner, (x, y, z) each.
  const edge = new Float32Array(12)
  const last = new THREE.Vector3()
  let next = 0
  let laid = 0
  let started = false
  let heading = 0
  let lastLaid = 0
  const corners = (p: THREE.Vector3, heading: number, out: Float32Array) => {
    const rx = Math.cos(heading)
    const rz = -Math.sin(heading)
    let k = 0
    for (let side = -1; side <= 1; side += 2)
      for (let rim = -1; rim <= 1; rim += 2) {
        const across = side * TRACKS.gauge + rim * TRACKS.half
        const x = p.x + rx * across
        const z = p.z + rz * across
        out[k++] = x
        out[k++] = heightAt(x, z) + 0.025
        out[k++] = z
      }
  }
  const fresh = new Float32Array(12)
  return {
    mesh,
    /** Lays a segment once the rover has gone a step since the last; a jump (a reset) starts anew. */
    follow(rover: THREE.Object3D, now: number) {
      const p = rover.position
      const d = Math.hypot(p.x - last.x, p.z - last.z)
      const turned = Math.abs(Math.sin((rover.rotation.y - heading) / 2)) > 0.17
      if (started && d < TRACKS.step && !turned) {
        // Drawn only until the last of them has faded.
        if (mesh.visible && now - lastLaid > TRACKS.fade) mesh.visible = false
        return
      }
      // A turn on the spot or a jump (a reset) starts the tracks anew, rather than twisting them.
      if (!started || d > 3 || (turned && d < TRACKS.step)) {
        corners(p, rover.rotation.y, edge)
        last.copy(p)
        heading = rover.rotation.y
        started = true
        return
      }
      corners(p, rover.rotation.y, fresh)
      // Two quads, one a wheel: last edge to this one.
      const base = next * 8
      for (let w = 0; w < 2; w++)
        for (let k = 0; k < 2; k++) {
          const o = w * 6 + k * 3
          position.setXYZ(base + w * 4 + k, edge[o] as number, edge[o + 1] as number, edge[o + 2] as number)
          position.setXYZ(
            base + w * 4 + 2 + k,
            fresh[o] as number,
            fresh[o + 1] as number,
            fresh[o + 2] as number,
          )
        }
      for (let i = 0; i < 8; i++) born.setX(base + i, now)
      position.addUpdateRange(base * 3, 24)
      born.addUpdateRange(base, 8)
      position.needsUpdate = true
      born.needsUpdate = true
      edge.set(fresh)
      last.copy(p)
      heading = rover.rotation.y
      next = (next + 1) % TRACKS.segments
      laid = Math.min(TRACKS.segments, laid + 1)
      geometry.setDrawRange(0, laid * 12)
      lastLaid = now
      mesh.visible = true
    },
  }
}

/**
 * Dust thrown up off the ground: soft puffs that drift out, rise a little and fade. Each particle
 * is written once where and when it starts, with its speed; the shader moves it from then on.
 */
function dustPuffs(time: { value: number }, color: THREE.Color) {
  const n = DUST.count
  const start = new THREE.BufferAttribute(new Float32Array(n * 3), 3)
  const speed = new THREE.BufferAttribute(new Float32Array(n * 3), 3)
  // When it started, how long it lasts, and how big it grows (m).
  const life = new THREE.BufferAttribute(new Float32Array(n * 3).fill(-1e6), 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', start)
  geometry.setAttribute('speed', speed)
  geometry.setAttribute('life', life)
  const uniforms = { time, color: { value: color }, scale: { value: 1 } }
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms,
    vertexShader: `uniform float time; uniform float scale;
      attribute vec3 speed; attribute vec3 life;
      varying float vAlpha;
      void main() {
        float age = time - life.x;
        if (age < 0.0 || age > life.y) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlpha = 0.0; return; }
        // Thrown out, slowed by the thin air, and lifted a little as it spreads.
        vec3 p = position + speed * (1.0 - exp(-1.6 * age)) / 1.6 + vec3(0.0, 0.18 * age, 0.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float k = age / life.y;
        vAlpha = smoothstep(0.0, 0.08, k) * (1.0 - k) * (1.0 - k);
        gl_PointSize = clamp(scale * life.z * (0.45 + k) / -mv.z, 0.0, 96.0);
      }`,
    fragmentShader: `uniform vec3 color;
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = 0.5 * vAlpha * (1.0 - smoothstep(0.1, 1.0, r));
        if (a < 0.004) discard;
        gl_FragColor = vec4(color, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const points = new THREE.Points(geometry, material)
  points.name = 'dust-puffs'
  points.frustumCulled = false
  points.visible = false
  // Point sizes in pixels follow the target's height, so they look the same in every camera.
  points.onBeforeRender = (renderer) => {
    const target = renderer.getRenderTarget()
    uniforms.scale.value = (target ? target.height : renderer.domElement.height) * 0.9
  }
  let next = 0
  let until = 0
  return {
    points,
    /** Starts one puff at (x, y, z) moving at (vx, vy, vz), lasting `seconds`, growing to about `size` m. */
    puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, seconds: number, size: number) {
      start.setXYZ(next, x, y, z)
      speed.setXYZ(next, vx, vy, vz)
      life.setXYZ(next, time.value, seconds, size)
      next = (next + 1) % n
      until = Math.max(until, time.value + seconds)
      start.needsUpdate = speed.needsUpdate = life.needsUpdate = true
      points.visible = true
    },
    /** Drawn only while a puff is in the air. */
    settle() {
      if (time.value > until) points.visible = false
    },
  }
}

/**
 * What the rover and the hopper leave on the ground as they work: the rover's wheel tracks, fading
 * over a minute and a half, and a little dust behind its wheels as it drives; a ring of dust blown
 * out from under the hopper as it takes off and lands. One draw each, and none while nothing moves.
 */
export function buildTrails(
  scene: THREE.Scene,
  parts: Parts,
  dustColor: THREE.Color,
): { update(t: number, dt: number): void } {
  const time = { value: 0 }
  const tracks = wheelTracks(time)
  const dust = dustPuffs(time, dustColor)
  scene.add(tracks.mesh, dust.points)
  const roverWas = new THREE.Vector3().copy(parts.rover.position)
  let roverDue = 0
  let hopperDue = 0
  return {
    update(t, dt) {
      time.value = t
      const { rover, hopper, thrust } = parts
      tracks.follow(rover, t)
      // Behind the rover's rear wheels while it drives, a puff now and then.
      const moved = Math.hypot(rover.position.x - roverWas.x, rover.position.z - roverWas.z)
      roverWas.copy(rover.position)
      const speed = dt > 0 ? moved / dt : 0
      if (speed > 0.3 && speed < 10) {
        roverDue += dt * DUST.rover * Math.min(1, speed / 1.5)
        const h = rover.rotation.y
        const fx = Math.sin(h)
        const fz = Math.cos(h)
        for (; roverDue >= 1; roverDue--) {
          const side = Math.random() < 0.5 ? -1 : 1
          const x = rover.position.x - fx * 1.1 + fz * side * TRACKS.gauge
          const z = rover.position.z - fz * 1.1 - fx * side * TRACKS.gauge
          const spread = (Math.random() - 0.5) * 0.6
          dust.puff(
            x,
            heightAt(x, z) + 0.15,
            z,
            -fx * 0.5 + fz * spread,
            0.35 + Math.random() * 0.3,
            -fz * 0.5 - fx * spread,
            1.6 + Math.random() * 0.8,
            0.9 + Math.random() * 0.5,
          )
        }
      }
      // Under the hopper's engine near the ground, dust blown out all round.
      const ground = heightAt(hopper.position.x, hopper.position.z)
      const altitude = hopper.position.y - ground - HOPPER_FEET
      if (thrust.level > 0.1 && altitude < BLAST_HEIGHT) {
        hopperDue += dt * DUST.hopper * thrust.level * (1 - altitude / BLAST_HEIGHT)
        for (; hopperDue >= 1; hopperDue--) {
          const a = Math.random() * Math.PI * 2
          const c = Math.cos(a)
          const s = Math.sin(a)
          const v = 4 + Math.random() * 3
          dust.puff(
            hopper.position.x + c * 0.9,
            ground + 0.2,
            hopper.position.z + s * 0.9,
            c * v,
            0.3 + Math.random() * 0.4,
            s * v,
            1.6 + Math.random() * 0.8,
            1.4 + Math.random() * 0.8,
          )
        }
      }
      dust.settle()
    },
  }
}
