import qrcode from 'qrcode-generator'

/**
 * The bill's QR code as a gift. With a gift.json next to the page, kept out of git
 * (`{ "url": "https://…/#", "codes": ["…"] }`), each bill's QR code opens the url with a code no
 * bill in this browser has shown yet and the total, `#CODE-TOTAL`; once every code has been
 * shown they go round again. Without the file the bill keeps a pattern that only looks like one.
 */
interface Gift {
  url: string
  codes: string[]
}

const GIVEN = 'restaurant-gift-given'
let gift: Gift | undefined
fetch('gift.json')
  .then((r) => (r.ok ? r.json() : undefined))
  .then((g: Gift | undefined) => (gift = g))
  .catch(() => {})

/** A QR code that scans, for a bill of `total`: nothing without gift.json. */
export function giftQr(total: number): HTMLElement | undefined {
  if (!gift?.codes.length) return undefined
  let given: string[] = []
  try {
    given = JSON.parse(localStorage.getItem(GIVEN) ?? '[]')
  } catch {}
  let left = gift.codes.filter((c) => !given.includes(c))
  if (!left.length) {
    given = []
    left = gift.codes
  }
  const code = left[Math.floor(Math.random() * left.length)] as string
  try {
    localStorage.setItem(GIVEN, JSON.stringify([...given, code]))
  } catch {}
  const qr = qrcode(0, 'M')
  qr.addData(`${gift.url}${code}-${total}`)
  qr.make()
  const img = document.createElement('img')
  img.className = 'qr gift'
  img.alt = 'QR'
  img.src = `data:image/svg+xml,${encodeURIComponent(qr.createSvgTag({ margin: 2, scalable: true }))}`
  return img
}
