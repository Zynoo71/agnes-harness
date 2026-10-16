import * as THREE from 'three'
import type { Effects } from './live/events.js'
import type { Point } from './live/route.js'
import { heightAt } from './terrain.js'

/** Furrows written in the sand: segments kept, their width and how far over the ground (m). */
const FURROW = { segments: 4000, half: 0.24, lift: 0.03 }

/**
 * The furrows Monolith writes into the sand: one mesh of quads, each segment written in place as it is
 * laid and stretched by its half width at both ends so the joints close. One draw, and only the new
 * segment goes to the GPU.
 */
function furrows(scene: THREE.Scene) {
  const n = FURROW.segments
  const position = new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3)
  const normal = new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3)
  for (let i = 0; i < n * 4; i++) normal.setXYZ(i, 0, 1, 0)
  const index: number[] = []
  for (let i = 0; i < n; i++) index.push(4 * i, 4 * i + 2, 4 * i + 1, 4 * i + 1, 4 * i + 2, 4 * i + 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', position)
  geometry.setAttribute('normal', normal)
  geometry.setIndex(index)
  geometry.setDrawRange(0, 0)
  const material = new THREE.MeshStandardMaterial({
    color: 0x4a2617,
    roughness: 1,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.receiveShadow = true
  mesh.visible = false
  scene.add(mesh)
  let count = 0
  return {
    mark(a: Point, b: Point) {
      if (count >= n) return
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      if (len < 1e-3) return
      const dx = (b.x - a.x) / len
      const dz = (b.z - a.z) / len
      const h = FURROW.half
      const corners = [
        [a.x - dx * h - dz * h, a.z - dz * h + dx * h],
        [a.x - dx * h + dz * h, a.z - dz * h - dx * h],
        [b.x + dx * h - dz * h, b.z + dz * h + dx * h],
        [b.x + dx * h + dz * h, b.z + dz * h - dx * h],
      ] as const
      corners.forEach(([x, z], k) => {
        position.setXYZ(4 * count + k, x, heightAt(x, z) + FURROW.lift, z)
      })
      position.addUpdateRange(4 * count * 3, 12)
      position.needsUpdate = true
      count += 1
      geometry.setDrawRange(0, count * 6)
      mesh.visible = true
    },
    unmark() {
      count = 0
      geometry.setDrawRange(0, 0)
      mesh.visible = false
    },
  }
}

/** A soft round spot, white in the middle: for flashes and puffs of dust. */
function spot(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const g = canvas.getContext('2d') as CanvasRenderingContext2D
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(canvas)
}

interface Running {
  /** Seconds since it started, and how long it lasts; returns false once it is over. */
  step(age: number): boolean
  start: number
  dispose(): void
}

/**
 * What the scene draws for the world's events and for what devices do: a meteorite's streak, flash
 * and dust, a dust devil crossing the ground, dust knocked off a rock, a boulder bursting into
 * rubble. Nothing is drawn, and nothing costs a frame, until one happens; rubble, once it has
 * landed, is one still draw for each broken boulder.
 */
export function buildEffects(
  scene: THREE.Scene,
  dustColor: THREE.Color,
): Effects & { update(t: number): void } {
  const texture = spot()
  const sand = furrows(scene)
  const running: Running[] = []
  let now = 0
  const add = (r: Omit<Running, 'start'>) => running.push({ ...r, start: now })

  const meteor = (at: Point) => {
    const ground = new THREE.Vector3(at.x, heightAt(at.x, at.z), at.z)
    // The streak comes in steeply from the east.
    const from = ground.clone().add(new THREE.Vector3(160, 260, -60))
    const streak = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 1.2, 1, 6, 1, true),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.6, 1.3, 1.0),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    )
    streak.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(ground).normalize())
    const flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        color: new THREE.Color(3, 2.4, 1.6),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    )
    flash.position.copy(ground).y += 2
    // The dust it throws up: motes flying out and up, then settling, one draw for all of them.
    const N = 90
    const speeds = Array.from({ length: N }, () => {
      const a = Math.random() * Math.PI * 2
      const v = 2 + Math.random() * 6
      return new THREE.Vector3(Math.cos(a) * v, 2 + Math.random() * 7, Math.sin(a) * v)
    })
    const cloud = new THREE.BufferGeometry()
    cloud.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    const puff = new THREE.Points(
      cloud,
      new THREE.PointsMaterial({
        map: texture,
        color: dustColor.clone().multiplyScalar(1.1),
        size: 2.2,
        transparent: true,
        depthWrite: false,
      }),
    )
    puff.frustumCulled = false
    flash.visible = puff.visible = false
    scene.add(streak, flash, puff)
    const fall = 0.9
    add({
      step(age) {
        if (age < fall) {
          // The head races down, a tail of light behind it.
          const head = from.clone().lerp(ground, age / fall)
          const tail = from.clone().lerp(ground, Math.max(0, age / fall - 0.25))
          streak.position.copy(head).add(tail).multiplyScalar(0.5)
          streak.scale.set(1, head.distanceTo(tail), 1)
          return true
        }
        streak.visible = false
        const k = age - fall
        flash.visible = k < 0.35
        flash.scale.setScalar(4 + k * 20)
        flash.material.opacity = Math.max(0, 1 - k / 0.35)
        puff.visible = true
        const p = cloud.attributes.position as THREE.BufferAttribute
        // Thrown out fast, slowed by the thin air, pulled down by Mars's gravity.
        const drag = (1 - Math.exp(-1.2 * k)) / 1.2
        for (const [i, v] of speeds.entries())
          p.setXYZ(
            i,
            ground.x + v.x * drag,
            Math.max(ground.y + 0.2, ground.y + v.y * drag - 1.86 * k * k * 0.5),
            ground.z + v.z * drag,
          )
        p.needsUpdate = true
        puff.material.size = 2.2 + k * 0.8
        puff.material.opacity = 0.8 * Math.max(0, 1 - k / 7)
        return k < 7
      },
      dispose() {
        scene.remove(streak, flash, puff)
        streak.geometry.dispose()
        streak.material.dispose()
        flash.material.dispose()
        cloud.dispose()
        puff.material.dispose()
      },
    })
  }

  const devil = (from: Point, to: Point, seconds: number) => {
    const height = 22
    const uniforms = { time: { value: 0 }, fade: { value: 0 }, color: { value: dustColor } }
    const column = new THREE.Mesh(
      // Narrow at the ground, opening out above.
      new THREE.CylinderGeometry(3.2, 0.7, height, 28, 6, true).translate(0, height / 2, 0),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms,
        vertexShader: `varying vec2 vUv; varying float vY;
          void main() { vUv = uv; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float time; uniform float fade; uniform vec3 color; varying vec2 vUv; varying float vY;
          void main() {
            // Ragged bands of dust spiralling up, thick at the foot, thinning and fraying towards the top.
            float a = vUv.x * 6.2832 * 4.0 + vY * 0.5 - time * 6.0;
            float b = vUv.x * 6.2832 * 9.0 - vY * 0.9 - time * 9.0;
            float band = smoothstep(0.1, 0.9, 0.5 + 0.35 * sin(a) + 0.25 * sin(b + sin(vY * 0.7 + time)));
            float foot = 1.0 - smoothstep(0.0, 0.25, vUv.y);
            float alpha = (band * 0.55 + foot * 0.35) * (1.0 - smoothstep(0.3, 0.95, vUv.y)) * smoothstep(0.0, 0.03, vUv.y) * fade;
            gl_FragColor = vec4(color * mix(0.8, 1.1, band), alpha);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    )
    scene.add(column)
    add({
      step(age) {
        const k = age / seconds
        const x = from.x + (to.x - from.x) * k + Math.sin(age * 0.6) * 2.5
        const z = from.z + (to.z - from.z) * k + Math.cos(age * 0.45) * 2.5
        column.position.set(x, heightAt(x, z) - 0.2, z)
        column.rotation.set(Math.sin(age * 0.8) * 0.06, -age * 2.5, Math.cos(age * 0.6) * 0.06)
        uniforms.time.value = age
        uniforms.fade.value =
          THREE.MathUtils.smoothstep(age, 0, 3) * (1 - THREE.MathUtils.smoothstep(age, seconds - 3, seconds))
        return age < seconds
      },
      dispose() {
        scene.remove(column)
        column.geometry.dispose()
        column.material.dispose()
      },
    })
  }

  /**
   * A cloud of `n` motes thrown out from `from` at up to `spread` m/s across and `rise` m/s up,
   * slowed by the thin air, settling and fading over `seconds`: one draw for all of them.
   */
  const cloud = (
    from: THREE.Vector3,
    n: number,
    spread: number,
    rise: number,
    size: number,
    seconds: number,
  ) => {
    const floor = heightAt(from.x, from.z) + 0.1
    const speeds = Array.from({ length: n }, () => {
      const a = Math.random() * Math.PI * 2
      const v = spread * (0.3 + 0.7 * Math.random())
      return new THREE.Vector3(Math.cos(a) * v, rise * (0.3 + 0.7 * Math.random()), Math.sin(a) * v)
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        map: texture,
        color: dustColor.clone().multiplyScalar(1.1),
        size,
        transparent: true,
        depthWrite: false,
      }),
    )
    points.frustumCulled = false
    scene.add(points)
    add({
      step(age) {
        const p = geometry.attributes.position as THREE.BufferAttribute
        const drag = (1 - Math.exp(-1.5 * age)) / 1.5
        for (const [i, v] of speeds.entries())
          p.setXYZ(
            i,
            from.x + v.x * drag,
            Math.max(floor, from.y + v.y * drag - 0.93 * age * age),
            from.z + v.z * drag,
          )
        p.needsUpdate = true
        points.material.size = size * (1 + age * 0.3)
        points.material.opacity = 0.75 * Math.max(0, 1 - age / seconds)
        return age < seconds
      },
      dispose() {
        scene.remove(points)
        geometry.dispose()
        points.material.dispose()
      },
    })
  }

  const puff = (at: Point, up: number, size: number) =>
    cloud(
      new THREE.Vector3(at.x, heightAt(at.x, at.z) + up, at.z),
      24,
      size * 1.2,
      size,
      0.4 + size * 0.6,
      2.5,
    )

  // Rubble of broken boulders: one draw for each boulder's chunks, all sharing a shape and a material.
  const chunk = new THREE.DodecahedronGeometry(1, 0)
  const stone = new THREE.MeshStandardMaterial({ color: 0x8e5a44, roughness: 0.95, flatShading: true })
  const rubble: THREE.InstancedMesh[] = []
  const shatter = (at: Point, r: number, clear: number[]) => {
    const ground = heightAt(at.x, at.z)
    const high = Math.min(1.5, r * 0.4)
    cloud(new THREE.Vector3(at.x, ground + high, at.z), 90, 2 + r, 3, 1.2 + r * 0.25, 5)
    const open = (a: number) =>
      clear.every((c) => Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c))) > 0.9)
    // 8 to 12 chunks, bigger from a bigger boulder, each flying from inside it to a few metres out.
    const flights = Array.from({ length: 8 + Math.min(4, Math.round(r)) }, () => {
      let a = Math.random() * Math.PI * 2
      for (let i = 0; i < 12 && !open(a); i++) a = Math.random() * Math.PI * 2
      const dx = Math.sin(a)
      const dz = Math.cos(a)
      const size = Math.min(0.4, 0.12 + 0.06 * r) * (0.6 + 0.4 * Math.random())
      const inside = Math.random() * r * 0.5
      const out = r * 0.6 + 1 + Math.random() * 3
      const x = at.x + dx * out
      const z = at.z + dz * out
      return {
        from: new THREE.Vector3(at.x + dx * inside, ground + 0.3 + Math.random() * high, at.z + dz * inside),
        // Half sunk where it lands.
        to: new THREE.Vector3(x, heightAt(x, z) + size * 0.3, z),
        size,
        arc: 1 + Math.random() * 2,
        seconds: 0.8 + Math.random() * 0.7,
        axis: new THREE.Vector3().randomDirection(),
        turn: Math.random() * 6,
        spin: 4 + Math.random() * 6,
      }
    })
    const mesh = new THREE.InstancedMesh(chunk, stone, flights.length)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    const at3 = new THREE.Vector3()
    const turn = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    const matrix = new THREE.Matrix4()
    const place = (age: number) => {
      for (const [i, f] of flights.entries()) {
        const k = Math.min(1, age / f.seconds)
        at3.lerpVectors(f.from, f.to, k)
        at3.y += 4 * f.arc * k * (1 - k)
        turn.setFromAxisAngle(f.axis, f.turn + f.spin * Math.min(age, f.seconds))
        scale.set(f.size, f.size * 0.7, f.size)
        mesh.setMatrixAt(i, matrix.compose(at3, turn, scale))
      }
      mesh.instanceMatrix.needsUpdate = true
    }
    place(0)
    scene.add(mesh)
    rubble.push(mesh)
    add({
      step(age) {
        place(age)
        return age < 1.5
      },
      // Landed, the chunks lie still as rubble until the page resets.
      dispose() {
        mesh.computeBoundingSphere()
        mesh.frustumCulled = true
      },
    })
  }

  return {
    meteor,
    devil,
    puff,
    shatter,
    mark: sand.mark,
    unmark: sand.unmark,
    clear() {
      sand.unmark()
      for (const r of running) r.dispose()
      running.length = 0
      for (const mesh of rubble) {
        scene.remove(mesh)
        mesh.dispose()
      }
      rubble.length = 0
    },
    update(t) {
      now = t
      for (const r of [...running])
        if (!r.step(t - r.start)) {
          r.dispose()
          running.splice(running.indexOf(r), 1)
        }
    },
  }
}
