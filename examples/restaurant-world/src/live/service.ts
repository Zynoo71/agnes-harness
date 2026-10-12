import type * as THREE from 'three'
import { type Seat, TABLES } from '../layout.js'
import type { Dish } from '../menu.js'

/**
 * The restaurant's service, shared by the devices and the page: where the guest is, what they
 * ordered and how far each dish has got, what is on their table, the bill, and spills. Devices
 * change it as they work and call `changed()`, which the page and every device's state follow.
 */

/** How far an order line has got. */
export type Stage =
  | 'queued'
  | 'cooking'
  | 'ready'
  | 'at_pass'
  | 'on_the_way'
  | 'served'
  | 'cleared'
  | 'cancelled'

export interface Line {
  /** o1, o2, … */
  id: string
  dish: Dish
  note: string
  rush: boolean
  stage: Stage
  /** The dish in the scene, from the moment cooking starts. */
  object?: THREE.Object3D | undefined
  /** The table slot it was set on. */
  slot?: number | undefined
}

export const SUPPLY_ITEMS = [
  'napkins',
  'chopsticks',
  'bowl',
  'spoon',
  'cup',
  'takeaway_box',
  'baby_chair',
] as const
export type SupplyItem = (typeof SUPPLY_ITEMS)[number]

export interface Supply {
  /** s1, s2, … */
  id: string
  item: SupplyItem
  stage: 'ready' | 'on_the_way' | 'served' | 'cleared'
  object: THREE.Object3D
  slot?: number | undefined
}

export type GuestState = 'outside' | 'at_door' | 'following' | 'seated' | 'leaving' | 'left'
export type TableStatus = 'free' | 'reserved' | 'occupied' | 'needs_clearing'
export type BillState = 'none' | 'billed' | 'paid'

export class Service {
  guest: GuestState = 'outside'
  /** The guest's table and seat, once seated. */
  table: string | undefined
  seat: Seat | undefined
  lines: Line[] = []
  supplies: Supply[] = []
  bill: BillState = 'none'
  /** Percent off the bill. */
  discount = 0
  discountReason = ''
  paidWith = ''
  /** Places (table ids or other landmarks) with a spill on the floor. */
  readonly spills = new Set<string>()
  /** Tables booked by others, and tables left with dishes or crumbs on them. */
  readonly reserved = new Set<string>(['t2'])
  readonly dirty = new Set<string>()
  /** What the page shows the guest: the menu card, the bill card. */
  menuOpen = false
  billOpen = false
  /** When the guest sat down, for the service clock (ms, performance.now). */
  seatedAt: number | undefined
  /** Dishes sold out, by id. */
  readonly soldOut = new Set<string>()
  private count = { line: 0, supply: 0 }
  readonly listeners: (() => void)[] = []

  changed(): void {
    for (const f of this.listeners) f()
  }

  nextLine(): string {
    this.count.line += 1
    return `o${this.count.line}`
  }

  nextSupply(): string {
    this.count.supply += 1
    return `s${this.count.supply}`
  }

  line(id: string): Line | undefined {
    return this.lines.find((l) => l.id === id)
  }

  supply(id: string): Supply | undefined {
    return this.supplies.find((s) => s.id === id)
  }

  status(table: string): TableStatus {
    if (this.table === table && this.guest !== 'left' && this.guest !== 'outside') return 'occupied'
    if (this.dirty.has(table)) return 'needs_clearing'
    if (this.reserved.has(table)) return 'reserved'
    return 'free'
  }

  /** Lines on the bill: everything ordered that was not cancelled. */
  billed(): Line[] {
    return this.lines.filter((l) => l.stage !== 'cancelled')
  }

  subtotal(): number {
    return this.billed().reduce((sum, l) => sum + l.dish.price, 0)
  }

  total(): number {
    return Math.round(this.subtotal() * (1 - this.discount / 100))
  }

  /** What is on a table now: served dishes and supplies, with the slots they take. */
  onTable(): (Line | Supply)[] {
    return [
      ...this.lines.filter((l) => l.stage === 'served'),
      ...this.supplies.filter((s) => s.stage === 'served'),
    ]
  }

  /** The lowest table slot nothing stands on. */
  freeSlot(): number {
    const used = new Set(this.onTable().map((o) => o.slot))
    let k = 0
    while (used.has(k)) k += 1
    return k
  }

  reset(): void {
    for (const l of this.lines) l.object?.removeFromParent()
    for (const s of this.supplies) s.object.removeFromParent()
    this.guest = 'outside'
    this.table = undefined
    this.seat = undefined
    this.lines = []
    this.supplies = []
    this.bill = 'none'
    this.discount = 0
    this.discountReason = ''
    this.paidWith = ''
    this.spills.clear()
    this.reserved.clear()
    this.reserved.add('t2')
    this.dirty.clear()
    this.menuOpen = false
    this.billOpen = false
    this.seatedAt = undefined
    this.soldOut.clear()
    this.count = { line: 0, supply: 0 }
    this.changed()
  }
}

export const TABLE_IDS = TABLES.map((t) => t.id)
