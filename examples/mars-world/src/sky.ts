import * as THREE from 'three'
import { sunAt } from './clock.js'

export interface Light {
  sun: THREE.Vector3
  /** Elevation of the sun above the horizon, in degrees. */
  elevation: number
  /** 0 at sunset, 1 in full day. */
  day: number
  /** 0 until the sun is down, 1 once it is 12° below the horizon. */
  night: number
  horizon: THREE.Color
  zenith: THREE.Color
}

const DUSK_HORIZON = new THREE.Color(0.36, 0.25, 0.19)
const DAY_HORIZON = new THREE.Color(0.86, 0.6, 0.4)
const NIGHT_HORIZON = new THREE.Color(0.035, 0.04, 0.06)
const DUSK_ZENITH = new THREE.Color(0.12, 0.09, 0.08)
const DAY_ZENITH = new THREE.Color(0.48, 0.3, 0.19)
const NIGHT_ZENITH = new THREE.Color(0.008, 0.01, 0.018)

/** The light at a local hour (see clock.ts). */
export function lightAt(hour: number): Light {
  const { elevation, azimuth } = sunAt(hour)
  const el = THREE.MathUtils.degToRad(elevation)
  const az = THREE.MathUtils.degToRad(azimuth)
  // Azimuth from north (-z), clockwise towards east (+x).
  const sun = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
  const day = THREE.MathUtils.smoothstep(elevation, 0, 25)
  const night = THREE.MathUtils.smoothstep(-elevation, 0, 12)
  const horizon = DUSK_HORIZON.clone().lerp(DAY_HORIZON, day).lerp(NIGHT_HORIZON, night)
  const zenith = DUSK_ZENITH.clone().lerp(DAY_ZENITH, day).lerp(NIGHT_ZENITH, night)
  return { sun, elevation, day, night, horizon, zenith }
}

/**
 * The Mars sky: butterscotch by day, darker towards the zenith, with the blue glow Mars shows
 * around the sun, strongest at sunset; dark with stars at night. `updateSky` moves it with the clock.
 */
export function buildSky(light: Light): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      sunDir: { value: light.sun.clone() },
      day: { value: light.day },
      night: { value: light.night },
      horizon: { value: light.horizon.clone() },
      zenith: { value: light.zenith.clone() },
    },
    vertexShader: `varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform vec3 sunDir; uniform float day; uniform float night; uniform vec3 horizon; uniform vec3 zenith;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(horizon, zenith, pow(h, 0.5));
        float mu = max(dot(d, sunDir), 0.0);
        vec3 blue = vec3(0.32, 0.5, 0.78);
        col = mix(col, blue * (0.7 + 0.9 * (1.0 - day)), pow(mu, 10.0) * mix(0.85, 0.35, day) * (1.0 - night));
        col += vec3(1.0, 0.92, 0.82) * (pow(mu, 600.0) * 3.0 + smoothstep(0.99955, 0.9998, mu) * 30.0) * step(0.0, sunDir.y);
        // Stars, once the sky is dark: a few cells of a fine grid on the sphere, each its own brightness.
        vec3 cell = floor(d * 420.0);
        float star = step(0.9975, hash(cell)) * hash(cell + 7.0);
        col += vec3(0.9, 0.92, 1.0) * star * night * smoothstep(0.02, 0.2, d.y) * 1.6;
        col = d.y < 0.0 ? horizon * 0.75 : col;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  return new THREE.Mesh(new THREE.SphereGeometry(1600, 48, 24), material)
}

export function updateSky(sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>, light: Light): void {
  const u = sky.material.uniforms as {
    sunDir: { value: THREE.Vector3 }
    day: { value: number }
    night: { value: number }
    horizon: { value: THREE.Color }
    zenith: { value: THREE.Color }
  }
  u.sunDir.value.copy(light.sun)
  u.day.value = light.day
  u.night.value = light.night
  u.horizon.value.copy(light.horizon)
  u.zenith.value.copy(light.zenith)
}
