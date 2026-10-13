import * as THREE from 'three'
import type { Lang } from './labels.js'
import type { Moment } from './live/world.js'

/** How long a moment's words show, and its steam rises, in ms. */
const SHOW_MS = 3000
const STEAM_MS = 2600
/** At most this many lines at once, and dishes steaming, each with this many puffs. */
const LINES = 3
const DISHES = 3
const PUFFS = 5

/**
 * The payoffs of the devices' work, over the scene for a few seconds (World.moments): the words
 * float up over the place and fade, and steam rises from dishes just served, in the look of the
 * stove's steam. The words are drawn over the scene like the host's speech bubble; the steam is one
 * instanced mesh, drawn only while it rises.
 */
export function buildMoments(
  scene: THREE.Scene,
  layer: HTMLElement,
  moments: Moment[],
  /** Screen position of world point (x, y up, z), or undefined off screen. */
  project: (x: number, y: number, z: number) => { x: number; y: number } | undefined,
  lang: () => Lang,
): { update(now: number): void } {
  const lines = Array.from({ length: LINES }, () => {
    const el = document.createElement('div')
    el.className = 'cheer'
    el.hidden = true
    layer.appendChild(el)
    return el
  })
  const puff = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.45,
    roughness: 1,
    depthWrite: false,
  })
  const steam = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 10, 8), puff, DISHES * PUFFS)
  steam.frustumCulled = false
  steam.visible = false
  scene.add(steam)
  const dummy = new THREE.Object3D()
  const at = new THREE.Vector3()
  return {
    update(now) {
      while (moments.length && now - (moments[0] as Moment).started > SHOW_MS) moments.shift()
      // The newest lines; one over the same place as a newer one moves up out of its way.
      const first = Math.max(0, moments.length - LINES)
      for (let k = 0; k < LINES; k++) {
        const el = lines[k] as HTMLElement
        const m = moments[first + k]
        const p = m ? project(m.at.x, m.h, m.at.z) : undefined
        el.hidden = !m || !p
        if (!m || !p) continue
        const age = now - m.started
        let above = 0
        for (let j = first + k + 1; j < moments.length; j++) {
          const o = moments[j] as Moment
          if (o.at.x === m.at.x && o.at.z === m.at.z) above += 1
        }
        const text = m[lang()]
        if (el.textContent !== text) el.textContent = text
        // Pops in, floats up as it goes, and fades over its last 0.7 s.
        const pop = Math.min(1, age / 220)
        const rise = (age / SHOW_MS) * 34 + above * 34
        el.style.opacity = String(Math.min(pop, (SHOW_MS - age) / 700))
        el.style.transform = `translate(${p.x}px, ${p.y - rise}px) translate(-50%, -100%) scale(${0.85 + 0.15 * pop})`
      }
      // Steam from the dishes of the newest moment that has any, thinning out as it ends.
      let newest: Moment | undefined
      for (let k = moments.length - 1; k >= 0 && !newest; k--)
        if ((moments[k] as Moment).steam.length) newest = moments[k]
      const age = newest ? now - newest.started : STEAM_MS
      steam.visible = age < STEAM_MS
      if (!newest || !steam.visible) return
      puff.opacity = 0.45 * Math.min(1, age / 300, (STEAM_MS - age) / 900)
      let n = 0
      for (let d = 0; d < Math.min(DISHES, newest.steam.length); d++) {
        ;(newest.steam[d] as THREE.Object3D).getWorldPosition(at)
        for (let k = 0; k < PUFFS; k++) {
          const phase = ((age / 1000) * 0.7 + k / PUFFS) % 1
          dummy.position.set(
            at.x + ((k % 3) - 1) * 0.05,
            at.y + 0.08 + phase * 0.5,
            at.z + ((k % 2) - 0.5) * 0.06,
          )
          dummy.scale.setScalar(0.6 + phase)
          dummy.updateMatrix()
          steam.setMatrixAt(n++, dummy.matrix)
        }
      }
      steam.count = n
      steam.instanceMatrix.needsUpdate = true
    },
  }
}
