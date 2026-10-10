import * as THREE from 'three'
import type { Effects } from './live/events.js'
import type { Point } from './live/route.js'
import { heightAt } from './terrain.js'

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
 * What the scene draws for the world's events: a meteorite's streak, flash and dust, and a dust devil
 * crossing the ground. Nothing is drawn, and nothing costs a frame, until an event happens.
 */
export function buildEffects(
  scene: THREE.Scene,
  dustColor: THREE.Color,
): Effects & { update(t: number): void } {
  const texture = spot()
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

  return {
    meteor,
    devil,
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
