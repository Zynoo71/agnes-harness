import * as THREE from 'three'
import { ROOM } from './layout.js'

/**
 * The view of a management game: an orthographic camera looking down at the room from the
 * south-east, so the north and west walls stand at the back and the cut near walls let the room
 * show. The wheel zooms and a drag pans; the view stays this way round.
 */

/** Degrees above the floor the view looks down from. */
const ELEVATION = 38
/** The view comes from the south-east: 45° round from due south. */
const AZIMUTH = 45

export interface Framing {
  /** Plan point (x east, y north) at the centre of the view. */
  x: number
  y: number
  /** Metres of floor from the top of the view to the bottom. */
  span: number
}

/** The whole room. */
export const OVERVIEW: Framing = { x: ROOM.w / 2 + 0.6, y: ROOM.d / 2 + 0.3, span: 27.5 }

export class IsoView {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200)
  framing: Framing = { ...OVERVIEW }
  private readonly direction = new THREE.Vector3()

  constructor() {
    const e = THREE.MathUtils.degToRad(ELEVATION)
    const a = THREE.MathUtils.degToRad(AZIMUTH)
    // From the target towards the camera: up, and to the south-east (+x east, +z south).
    this.direction.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e))
    this.apply()
  }

  set(framing: Framing): void {
    this.framing = { ...framing }
    this.apply()
  }

  apply(): void {
    const { x, y, span } = this.framing
    const aspect = innerWidth / innerHeight
    // `span` is measured on the floor; on screen the floor is foreshortened by the elevation.
    const half = (span * Math.sin(THREE.MathUtils.degToRad(ELEVATION))) / 2
    Object.assign(this.camera, { left: -half * aspect, right: half * aspect, top: half, bottom: -half })
    this.camera.updateProjectionMatrix()
    const target = new THREE.Vector3(x, 0, -y)
    this.camera.position.copy(target).addScaledVector(this.direction, 60)
    this.camera.lookAt(target)
  }

  /** Wheel zooms about the centre of the view; dragging moves the floor with the pointer. */
  listen(element: HTMLElement): void {
    element.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        this.framing.span = THREE.MathUtils.clamp(this.framing.span * Math.exp(e.deltaY * 0.0015), 3, 34)
        this.apply()
      },
      { passive: false },
    )
    let drag: { x: number; y: number } | undefined
    element.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY }
      element.setPointerCapture(e.pointerId)
    })
    element.addEventListener('pointerup', () => {
      drag = undefined
    })
    element.addEventListener('pointermove', (e) => {
      if (!drag) return
      const perPixel = (this.camera.top - this.camera.bottom) / innerHeight
      const dx = (e.clientX - drag.x) * perPixel
      // Up the screen is away from the view along the floor, foreshortened by the elevation.
      const dy = (e.clientY - drag.y) * (perPixel / Math.sin(THREE.MathUtils.degToRad(ELEVATION)))
      drag = { x: e.clientX, y: e.clientY }
      // Screen right is north-east on the plan; screen up is north-west.
      const a = THREE.MathUtils.degToRad(AZIMUTH)
      const right = { x: Math.cos(a), y: Math.sin(a) }
      const up = { x: -Math.sin(a), y: Math.cos(a) }
      this.framing.x -= right.x * dx - up.x * dy
      this.framing.y -= right.y * dx - up.y * dy
      this.apply()
    })
  }
}
