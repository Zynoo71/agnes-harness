import * as THREE from 'three'
import { seeded } from './assets.js'

/** Motes in the box around whichever camera renders, in metres: across, and up from the ground. */
const BOX = 70
const HEIGHT = 7
const COUNT = 2500
/** The wind carries them from the north-east, as it drew the dust streaks on the ground (m/s). */
const WIND = new THREE.Vector3(-0.8, 0, 0.6).multiplyScalar(2.5)

/**
 * Dust in the air: faint motes drifting on the wind near the ground, lit by the sun. One draw of
 * points moved entirely on the GPU; each camera, the main view's or a device's, sees them in a box
 * around itself, so they wrap round as it moves and never run out.
 */
export function buildDust(color: THREE.Color): { points: THREE.Points; update(t: number): void } {
  const random = seeded(23)
  const seeds = new Float32Array(COUNT * 4)
  for (let i = 0; i < seeds.length; i++) seeds[i] = random()
  const geometry = new THREE.BufferGeometry()
  // Placeholder positions; the shader places each mote from its seed.
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3))
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4))
  const uniforms = { time: { value: 0 }, wind: { value: WIND }, color: { value: color }, scale: { value: 1 } }
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms,
    vertexShader: `uniform float time; uniform vec3 wind; uniform float scale;
      attribute vec4 seed;
      varying float vAlpha;
      void main() {
        const float box = ${BOX.toFixed(1)};
        const float height = ${HEIGHT.toFixed(1)};
        // Drift with the wind, some faster than others, and sway a little.
        vec3 p = vec3(seed.x * box, seed.y * height, seed.z * box);
        p += wind * time * (0.7 + 0.6 * seed.w);
        p += 0.6 * vec3(sin(time * 0.7 + seed.w * 40.0), 0.5 * sin(time * 0.9 + seed.x * 30.0), cos(time * 0.6 + seed.z * 50.0));
        // Wrap into the box around the camera, across; up from the ground, which is level at the base.
        vec3 origin = vec3(cameraPosition.x - box * 0.5, 0.0, cameraPosition.z - box * 0.5);
        p.xz = mod(p.xz - origin.xz, box) + origin.xz;
        p.y = mod(p.y, height);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        // Faint near the box's edges, so none pops in, and right in front of the lens.
        vec2 edge = abs(p.xz - cameraPosition.xz) / (box * 0.5);
        vAlpha = (1.0 - smoothstep(0.6, 1.0, max(edge.x, edge.y))) * smoothstep(0.5, 2.0, d)
          * (1.0 - smoothstep(height * 0.6, height, p.y));
        gl_PointSize = clamp(scale * (0.03 + 0.05 * seed.w) / d, 1.5, 7.0);
      }`,
    fragmentShader: `uniform vec3 color;
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = vAlpha * 0.45 * (1.0 - smoothstep(0.2, 1.0, r));
        if (a < 0.005) discard;
        gl_FragColor = vec4(color, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const points = new THREE.Points(geometry, material)
  // Placed by the shader around each camera, so never outside a view.
  points.frustumCulled = false
  // Point sizes in pixels follow the target's height, so they look the same in every camera.
  points.onBeforeRender = (renderer) => {
    const target = renderer.getRenderTarget()
    uniforms.scale.value = (target ? target.height : renderer.domElement.height) * 0.9
  }
  return {
    points,
    update(t) {
      uniforms.time.value = t
    },
  }
}
