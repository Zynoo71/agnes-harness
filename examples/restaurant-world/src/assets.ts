import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { bake } from './bake.js'

/** Where tools/fetch-assets.mjs puts the files listed in assets/manifest.json. */
const CACHE = 'assets/cache'

const gltfLoader = new GLTFLoader()
const textureLoader = new THREE.TextureLoader()
const scenes = new Map<string, Promise<THREE.Group>>()

/** Models authored at the wrong scale, and the factor that brings them to metres. */
const RESCALE: Record<string, number> = { steel_frame_shelves_01: 0.1 }

/**
 * A Poly Haven model by id, at its real size in metres, its lowest point on its origin, shadows on
 * and its parts merged per look; every call returns a fresh copy, in a group of its own so it can
 * be placed, turned and scaled freely.
 */
export async function model(id: string): Promise<THREE.Group> {
  let loading = scenes.get(id)
  if (!loading) {
    loading = gltfLoader.loadAsync(`${CACHE}/models/${id}/${id}.gltf`).then((gltf) => {
      const root = gltf.scene
      root.scale.setScalar(RESCALE[id] ?? 1)
      root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true
          o.receiveShadow = true
        }
      })
      bake(root)
      root.updateMatrixWorld(true)
      root.position.y = -new THREE.Box3().setFromObject(root).min.y
      return root
    })
    scenes.set(id, loading)
  }
  const holder = new THREE.Group()
  holder.add((await loading).clone())
  return holder
}

/** A Poly Haven PBR texture set (color, normal, roughness), tiled `repeat` times. */
export function pbrMaps(id: string, repeat: [number, number]) {
  const load = (map: string, color: boolean) => {
    const t = textureLoader.load(`${CACHE}/textures/${id}/${map}.jpg`)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(...repeat)
    t.anisotropy = 8
    if (color) t.colorSpace = THREE.SRGBColorSpace
    return t
  }
  return { map: load('diff', true), normalMap: load('nor', false), roughnessMap: load('rough', false) }
}

/** A material from a Poly Haven PBR texture set. */
export function pbr(
  id: string,
  repeat: [number, number],
  options: THREE.MeshStandardMaterialParameters = {},
) {
  return new THREE.MeshStandardMaterial({ ...pbrMaps(id, repeat), ...options })
}
