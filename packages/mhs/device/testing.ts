/**
 * An in-process hub for testing a device in Node, without AgnesHub: the hub's own southbound side
 * (server/south.ts) on a free port, so every message is checked the way AgnesHub checks it.
 *
 *   const hub = await TestHub.start(dev)
 *   expect(await hub.call('tilt', { angle: 60 })).toMatchObject({ status: 'done' })
 *   await hub.set({ brightness: 30 })
 *   const reading = await hub.read('air')
 *   await hub.close()
 *
 * Node only; import it from '@agnes/mhs/device/testing'.
 */
import type { CallOptions, Latest, Outcome } from '../server/south.js'
import { South } from '../server/south.js'
import type { Device } from './device.js'

export class TestHub {
  private constructor(
    readonly south: South,
    readonly device: Device,
    private readonly running: Promise<void>,
    private readonly timeout: number,
  ) {}

  /** Starts a hub, runs the device against it, and waits until the device is available. */
  static async start(device: Device, timeout = 5000): Promise<TestHub> {
    const south = new South()
    const { port } = await south.listen(0)
    const running = device.run(`ws://127.0.0.1:${port}`)
    const hub = new TestHub(south, device, running, timeout)
    await hub.until(
      () => south.devices().some((d) => d.id === device.id && d.available),
      'the device to register',
    )
    return hub
  }

  /** The description the device registered. */
  get description() {
    return this.south.devices().find((d) => d.id === this.device.id)?.description
  }

  /** The device's state values as the hub knows them. */
  get state(): Record<string, unknown> {
    return this.south.state(this.device.id)?.values ?? {}
  }

  /** Calls a tool and waits for its one outcome; a rejected call is an outcome with status rejected. */
  call(name: string, args: Record<string, unknown> = {}, options?: CallOptions): Promise<Outcome> {
    return this.start(name, args, options).done
  }

  /** Starts a call: its id, the device's reply, and the outcome to wait for. */
  start(name: string, args: Record<string, unknown> = {}, options?: CallOptions) {
    return this.south.call(this.device.id, name, args, options)
  }

  set(values: Record<string, unknown>) {
    return this.south.set(this.device.id, values)
  }

  stop() {
    return this.south.stop(this.device.id)
  }

  cancel(call: string) {
    return this.south.cancel(this.device.id, call)
  }

  /** Waits for the next message of a source. */
  read(source: string): Promise<Latest> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.south.off('data', listen)
        reject(new Error(`no message from ${source} within ${this.timeout} ms`))
      }, this.timeout)
      const listen = (device: string, msg: Latest['msg'], binary?: Buffer) => {
        if (device !== this.device.id || msg.source !== source) return
        clearTimeout(timer)
        this.south.off('data', listen)
        resolve(binary ? { msg, binary } : { msg })
      }
      this.south.on('data', listen)
    })
  }

  /** Disconnects the device and stops the hub. */
  async close(): Promise<void> {
    this.device.close()
    await this.running
    await this.south.close()
  }

  private async until(check: () => boolean, what: string): Promise<void> {
    for (let waited = 0; !check(); waited += 10) {
      if (waited >= this.timeout) throw new Error(`timed out waiting for ${what}`)
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
}
