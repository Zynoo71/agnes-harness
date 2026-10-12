import type * as THREE from 'three'
import type { Actors } from '../actors.js'
import { FOOTPRINTS } from '../layout.js'
import { ambience, privateAmbience } from './ambience.js'
import { cam } from './cam.js'
import { floor } from './floor.js'
import { host } from './host.js'
import { arm, bar, stove, wok } from './kitchen.js'
import { menu } from './menu.js'
import { pos } from './pos.js'
import { prepBot } from './prep.js'
import { cleaner, runner } from './robots.js'
import { supplies } from './supplies.js'
import { World, type WorldDevice } from './world.js'

/**
 * The devices of Agnes Restaurant, each speaking MHS from the page and driving its part of the
 * scene, and a reset that puts the restaurant back as the page started it while the devices stay
 * connected.
 */
export function connectDevices(
  hub: string,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  actors: Actors,
  log: (line: string) => void,
  only: string[] | undefined,
): { devices: WorldDevice[]; world: World; reset: () => Promise<void> } {
  const world = new World(renderer, scene, FOOTPRINTS, actors)
  const all = [
    host(world, log),
    floor(world, log),
    menu(world, log),
    prepBot(world, log),
    wok(world, log),
    stove(world, log),
    bar(world, log),
    arm(world, log),
    runner(world, log),
    supplies(world, log),
    cleaner(world, log),
    ambience(world, log),
    privateAmbience(world, log),
    pos(world, log),
    cam(world, log),
  ]
  // ?devices=host-01,menu-01 connects only these, for example to check one device on its own.
  const devices = only ? all.filter((d) => only.includes(d.id)) : all
  for (const dev of devices) void dev.run(hub)
  addEventListener('pagehide', () => {
    for (const dev of devices) dev.close()
  })
  // Reset ends every running call (reported as interrupted, as mhs/stop does), gives the tools a
  // moment to reach their next checkpoint, then restores the scene and every device's state.
  const reset = async () => {
    await Promise.all(all.map((dev) => dev.stopAll()))
    await new Promise((resolve) => setTimeout(resolve, 300))
    world.reset()
  }
  return { devices, world, reset }
}
