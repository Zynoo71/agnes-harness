/**
 * A device's appearance (MHS 5.3): the clip its pose state field names, its frames played at the
 * clip's rate. SVG frames are parsed once, stripped of anything that runs or loads (REG-6), and
 * drawn inline; `currentColor` in them takes the panel's ink. PNG frames are decoded to bitmaps and
 * drawn on a canvas. A running `say` shows its sentence in a bubble above.
 */
import { useEffect, useRef, useState } from 'react'
import type { Look } from '../core/describe.js'
import type { Appearance, Device } from '../core/types.js'
import { ImageView, VideoView } from './image.js'

const svgCache = new Map<string, SVGSVGElement | null>()
const pngCache = new Map<string, Promise<ImageBitmap>>()

/** The frame as a clean SVG element, or null when it is not SVG. */
function cleanSvg(text: string): SVGSVGElement | null {
  const known = svgCache.get(text)
  if (known !== undefined) return known
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const root = doc.documentElement
  let svg: SVGSVGElement | null = null
  if (root instanceof SVGSVGElement && !doc.querySelector('parsererror')) {
    for (const el of root.querySelectorAll('script, foreignObject')) el.remove()
    for (const el of [root, ...root.querySelectorAll('*')])
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase()
        const value = attr.value.trim()
        if (
          name.startsWith('on') ||
          name === 'style' ||
          (name.endsWith('href') && !value.startsWith('#')) ||
          /url\(\s*['"]?(?!#)/i.test(value)
        )
          el.removeAttribute(attr.name)
      }
    root.removeAttribute('width')
    root.removeAttribute('height')
    svg = root
  }
  svgCache.set(text, svg)
  return svg
}

function pngBitmap(b64: string): Promise<ImageBitmap> {
  let p = pngCache.get(b64)
  if (!p) {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    p = createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    pngCache.set(b64, p)
  }
  return p
}

/** The clip to show: the one the pose field names, else the default, else the first. */
function clipOf(
  a: Appearance,
  device: Device,
): { name: string; frames: string[]; fps: number; loop: boolean } {
  const pose = a.state ? device.state.values[a.state] : undefined
  const names = Object.keys(a.clips)
  const name =
    typeof pose === 'string' && pose in a.clips
      ? pose
      : a.default !== undefined && a.default in a.clips
        ? a.default
        : (names[0] as string)
  const clip = a.clips[name] ?? { frames: [] }
  return { name, frames: clip.frames, fps: clip.fps ?? 1, loop: clip.loop ?? true }
}

/** The sentence a running say call is speaking, if any. */
function saying(device: Device): string | undefined {
  const job = (device.jobs ?? []).find((j) => j.tool === 'say' && j.state === 'running')
  const text = (job?.arguments as { text?: unknown } | undefined)?.text
  return typeof text === 'string' ? text : undefined
}

export function AvatarView(props: { device: Device; appearance: Appearance; compact?: boolean }) {
  const a = props.appearance
  const clip = clipOf(a, props.device)
  const [index, setIndex] = useState(0)
  const box = useRef<HTMLDivElement | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const key = `${clip.name}:${clip.frames.length}:${clip.fps}:${clip.loop}`

  // A new pose starts its clip from the first frame; a clip that does not loop stays on its last.
  // biome-ignore lint/correctness/useExhaustiveDependencies: key names the clip
  useEffect(() => {
    setIndex(0)
    if (clip.frames.length < 2) return
    const timer = setInterval(
      () =>
        setIndex((i) => {
          if (i + 1 < clip.frames.length) return i + 1
          return clip.loop ? 0 : i
        }),
      1000 / clip.fps,
    )
    return () => clearInterval(timer)
  }, [key])

  const frame = clip.frames[Math.min(index, clip.frames.length - 1)] ?? ''
  useEffect(() => {
    if (a.format === 'svg') {
      const svg = cleanSvg(frame)
      box.current?.replaceChildren(...(svg ? [svg.cloneNode(true)] : []))
      return
    }
    let live = true
    pngBitmap(frame)
      .then((bitmap) => {
        const c = canvas.current
        if (!live || !c) return
        c.width = bitmap.width
        c.height = bitmap.height
        c.getContext('2d')?.drawImage(bitmap, 0, 0)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [a.format, frame])

  const bubble = saying(props.device)
  return (
    <div className="mhs-avatar" data-compact={props.compact || undefined} data-pose={clip.name}>
      {a.format === 'svg' ? (
        <div ref={box} className="mhs-avatar-frame" />
      ) : (
        <canvas ref={canvas} className="mhs-avatar-frame" />
      )}
      {bubble && (
        <div className="mhs-avatar-bubble" title={bubble}>
          {bubble}
        </div>
      )}
    </div>
  )
}

/** A card's picture: the camera, at the card's rates, or the appearance. */
export function LookView(props: { device: Device; look: Look; hz: number; videoHz: number }) {
  const { device, look } = props
  if ('appearance' in look) return <AvatarView device={device} appearance={look.appearance} compact />
  return look.camera.kind === 'video' ? (
    <VideoView device={device} source={look.camera} hz={props.videoHz} compact />
  ) : (
    <ImageView device={device} source={look.camera} hz={props.hz} compact />
  )
}
