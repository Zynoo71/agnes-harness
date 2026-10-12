// Writes assets/manifest.json: every third-party asset the world uses, with its license, authors,
// source page, and the exact files (URL, size, md5) that tools/fetch-assets.mjs downloads and
// checks. Run it only to change the asset list: node tools/lock-assets.mjs
import { writeFileSync } from 'node:fs'

// Poly Haven, CC0.
const MODELS = [
  // The waiting area, the walls and the dining room.
  'chinese_sofa',
  'chinese_tea_table',
  'chinese_stool',
  'chinese_screen_panels',
  'chinese_cabinet',
  'tea_set_01',
  'antique_ceramic_vase_01',
  'ceramic_vase_01',
  'standing_chalkboard_01',
  'potted_plant_02',
  'potted_plant_04',
  'planter_box_02',
  'hanging_picture_frame_01',
  'hanging_picture_frame_02',
  'wall_clock',
  // The kitchen.
  'steel_frame_shelves_01',
  'wooden_crate_01',
  'plastic_crate_01',
  'wicker_basket_01',
  'yellow_onion',
  'food_ginger_01',
  'sweet_potato',
  'food_pears_asian_01',
  'wooden_cutting_board',
  'pot_enamel_01',
  'brass_pot_01',
  // The bar, the street, the cleaner's sign.
  'wine_bottles_01',
  'wooden_lantern_01',
  'street_lamp_01',
  'WetFloorSign_01',
]
const TEXTURES = [
  'herringbone_parquet',
  'anti_skid_tiles',
  'plastered_wall_04',
  'dark_wooden_planks',
  'patterned_paving',
]
const MAPS = { Diffuse: 'diff', nor_gl: 'nor', Rough: 'rough' }

const api = async (path) => {
  const res = await fetch(`https://api.polyhaven.com/${path}`, {
    headers: { 'User-Agent': 'agnes-restaurant-world' },
  })
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.json()
}
const file = (path, f) => ({ path, url: f.url, size: f.size, md5: f.md5 })

const assets = []
async function add(id, kind, files) {
  const info = await api(`info/${id}`)
  assets.push({
    id,
    kind,
    name: info.name,
    authors: Object.keys(info.authors ?? {}),
    license: 'CC0-1.0',
    source: `https://polyhaven.com/a/${id}`,
    files,
  })
}

for (const id of MODELS) {
  const gltf = (await api(`files/${id}`)).gltf['1k'].gltf
  const files = [file(`models/${id}/${id}.gltf`, gltf)]
  for (const [rel, f] of Object.entries(gltf.include)) files.push(file(`models/${id}/${rel}`, f))
  await add(id, 'model', files)
}
for (const id of TEXTURES) {
  const all = await api(`files/${id}`)
  const files = Object.entries(MAPS).map(([key, short]) =>
    file(`textures/${id}/${short}.jpg`, all[key]['1k'].jpg),
  )
  await add(id, 'texture', files)
}

const bytes = assets.flatMap((a) => a.files).reduce((n, f) => n + f.size, 0)
writeFileSync(
  new URL('../assets/manifest.json', import.meta.url),
  `${JSON.stringify({ about: 'Third-party assets of @agnes/restaurant-world, fetched by tools/fetch-assets.mjs', bytes, assets }, null, 2)}\n`,
)
console.log(`${assets.length} assets, ${(bytes / 1e6).toFixed(1)} MB`)
