import * as THREE from 'three'

/** Small helpers for building things in code, in plan coordinates (x east, y north; the scene's z is −y). */

export const mat = (color: number, options: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...options })

export function box(w: number, h: number, d: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

export function cylinder(
  rTop: number,
  rBottom: number,
  h: number,
  material: THREE.Material,
  segments = 20,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Turns map yaw (degrees, counter-clockwise from east) into rotation.y for a model facing +z. */
export const rotY = (yaw: number) => ((yaw + 90) * Math.PI) / 180

/** Puts `object` at plan point (x, y), its base `h` metres above the floor, facing map `yaw`. */
export function place<T extends THREE.Object3D>(object: T, x: number, y: number, h = 0, yaw?: number): T {
  object.position.set(x, h, -y)
  if (yaw !== undefined) object.rotation.y = rotY(yaw)
  return object
}

/** A texture drawn on a canvas `w` × `h` pixels. */
export function drawn(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  draw(canvas.getContext('2d') as CanvasRenderingContext2D)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}
