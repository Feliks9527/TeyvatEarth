import { feature } from 'topojson-client'

// 经纬度 -> 等距圆柱投影画布坐标
function project(lon, lat, w, h) {
  const x = (lon + 180) / 360 * w
  const y = (90 - lat) / 180 * h
  return [x, y]
}

// ---------- 2D 梯度噪声 + fbm（用于生物群系/地形起伏） ----------
function makeNoise(seed = 1337) {
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  let s = seed >>> 0
  const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = p[i]; p[i] = p[j]; p[j] = t
  }
  const perm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10)
  const lerp = (a, b, t) => a + (b - a) * t
  const grad = (h, x, y) => {
    switch (h & 3) {
      case 0: return x + y
      case 1: return -x + y
      case 2: return x - y
      default: return -x - y
    }
  }
  const noise2 = (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255
    const xf = x - Math.floor(x), yf = y - Math.floor(y)
    const u = fade(xf), v = fade(yf)
    const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1]
    const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1]
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u)
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u)
    return (lerp(x1, x2, v) + 1) * 0.5 // [0,1]
  }
  const fbm = (x, y, oct = 4, lac = 2, gain = 0.5) => {
    let amp = 0.5, freq = 1, sum = 0, norm = 0
    for (let i = 0; i < oct; i++) {
      sum += amp * noise2(x * freq, y * freq)
      norm += amp; amp *= gain; freq *= lac
    }
    return sum / norm
  }
  return { noise2, fbm }
}

// ---------- 生物群系基础调色板（提瓦特插画风：略饱和、偏暖） ----------
const BIOME = {
  ice:      [231, 240, 248],
  snow:     [241, 245, 249],
  tundra:   [175, 186, 162],
  taiga:    [72, 104, 76],
  forest:   [88, 124, 68],
  grass:    [140, 176, 94],
  steppe:   [188, 184, 120],
  desert:   [218, 196, 132],
  savanna:  [195, 182, 106],
  tropical: [60, 116, 62],
  rock:     [152, 140, 116],
}

// 根据 纬度/湿度/高程 选生物群系
function pickBiome(lat, m, e) {
  const a = Math.abs(lat)
  if (e > 0.80) return BIOME.snow          // 高山雪顶
  if (a > 68) return BIOME.ice             // 极地冰原
  if (a > 58) return e > 0.62 ? BIOME.snow : BIOME.tundra
  if (a > 48) return e > 0.66 ? BIOME.rock : BIOME.taiga
  if (a > 18 && a < 34 && m < 0.44) return BIOME.desert   // 副热带沙漠带
  if (a < 16) return m > 0.5 ? BIOME.tropical : BIOME.savanna
  if (m < 0.34) return BIOME.steppe
  return e > 0.58 ? BIOME.forest : BIOME.grass
}

// 贴图风格预设：海洋 + 海岸 + 国界 + 生物群系色彩变换
export const STYLES = {
  teyvat: {
    name: '提瓦特',
    ocean: ['#2a6f86', '#0f3a4e'],
    oceanDeep: '#0a2a3a',
    coast: '#fff4d6',
    coastGlow: 'rgba(255,231,179,0.6)',
    border: 'rgba(90,68,42,0.7)',
    grid: 'rgba(255,231,179,0.08)',
    paper: true,
    sat: 1.0, mul: [1.03, 1.0, 0.93], add: [0, 0, 0], oceanTint: [1, 1, 1],
  },
  dawn: {
    name: '黎明',
    ocean: ['#3a86a6', '#16526e'],
    oceanDeep: '#103f55',
    coast: '#ffe7c2',
    coastGlow: 'rgba(255,214,150,0.6)',
    border: 'rgba(120,86,50,0.65)',
    grid: 'rgba(255,235,200,0.10)',
    paper: true,
    sat: 1.05, mul: [1.08, 1.04, 0.95], add: [18, 14, 6], oceanTint: [1.08, 1.05, 0.95],
  },
  abyss: {
    name: '深渊',
    ocean: ['#241a4a', '#0c0a24'],
    oceanDeep: '#07061a',
    coast: '#c7a4ff',
    coastGlow: 'rgba(170,120,255,0.6)',
    border: 'rgba(150,110,220,0.5)',
    grid: 'rgba(180,140,255,0.08)',
    paper: false,
    sat: 0.38, mul: [0.74, 0.6, 1.06], add: [26, 12, 44], oceanTint: [0.8, 0.7, 1.15],
  },
}

export const STYLE_ORDER = ['teyvat', 'dawn', 'abyss']

// 对生物群系基础色应用风格变换（饱和度 / 乘法 / 加法）
function colorize(rgb, style, shade) {
  let [r, g, b] = rgb
  // 饱和度
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  r = lum + (r - lum) * style.sat
  g = lum + (g - lum) * style.sat
  b = lum + (b - lum) * style.sat
  // 明暗（地形起伏/光照）
  r *= shade; g *= shade; b *= shade
  // 风格染色
  r = r * style.mul[0] + style.add[0]
  g = g * style.mul[1] + style.add[1]
  b = b * style.mul[2] + style.add[2]
  return [
    r < 0 ? 0 : r > 255 ? 255 : r,
    g < 0 ? 0 : g > 255 ? 255 : g,
    b < 0 ? 0 : b > 255 ? 255 : b,
  ]
}

function addPaperNoise(ctx, w, h, alpha = 0.04) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * alpha
    d[i] += n; d[i + 1] += n; d[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
}

const eachPolygon = (geom, cb) => {
  if (geom.type === 'Polygon') cb(geom.coordinates)
  else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(cb)
}

// 主函数：生成风格化 + 生物群系地形贴图
export function buildEarthTexture(topo, styleKey = 'teyvat', size = 2048) {
  const style = STYLES[styleKey]
  const w = size, h = size / 2
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')

  const land = feature(topo, topo.objects.land)
  const countries = feature(topo, topo.objects.countries)

  const tracePolygon = (rings) => {
    ctx.beginPath()
    for (const ring of rings) {
      ring.forEach(([lon, lat], i) => {
        const [x, y] = project(lon, lat, w, h)
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      })
      ctx.closePath()
    }
  }

  // --- 1. 海洋渐变底 ---
  const og = ctx.createLinearGradient(0, 0, 0, h)
  og.addColorStop(0, style.ocean[0])
  og.addColorStop(0.5, style.oceanDeep)
  og.addColorStop(1, style.ocean[1])
  ctx.fillStyle = og
  ctx.fillRect(0, 0, w, h)

  // --- 2. 陆地掩膜（离屏，红通道判定是否为陆地） ---
  const mask = document.createElement('canvas')
  mask.width = w; mask.height = h
  const mctx = mask.getContext('2d')
  mctx.fillStyle = '#000'; mctx.fillRect(0, 0, w, h)
  mctx.fillStyle = '#fff'
  land.features.forEach(f => eachPolygon(f.geometry, rings => {
    mctx.beginPath()
    for (const ring of rings) {
      ring.forEach(([lon, lat], i) => {
        const [x, y] = project(lon, lat, w, h)
        if (i === 0) mctx.moveTo(x, y); else mctx.lineTo(x, y)
      })
      mctx.closePath()
    }
    mctx.fill()
  }))
  const maskData = mctx.getImageData(0, 0, w, h).data

  // --- 3. 逐像素生物群系着色 ---
  const { fbm } = makeNoise(20240603)
  const { fbm: fbm2 } = makeNoise(77777)
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const fScale = 5.5   // 噪声基础频率（控制群系尺度）

  for (let y = 0; y < h; y++) {
    const lat = 90 - (y / h) * 180
    const ny = y / h
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      const isLand = maskData[idx] > 127
      const nx = x / w
      if (isLand) {
        // 湿度（中频）与高程（低频，形成大块山地）
        const m = fbm(nx * fScale * 2.2, ny * fScale * 2.2, 4)
        const e = fbm2(nx * fScale, ny * fScale, 4)
        const detail = fbm(nx * fScale * 9, ny * fScale * 9, 2)
        const [br, bg, bb] = pickBiome(lat, m, e)
        // 地形明暗：高程提亮 + 细节起伏
        const shade = 0.80 + e * 0.34 + (detail - 0.5) * 0.16
        const [r, g, b] = colorize([br, bg, bb], style, shade)
        d[idx] = r; d[idx + 1] = g; d[idx + 2] = b
      } else {
        // 海洋：低频噪声制造水面层次
        const o = fbm2(nx * 4, ny * 4, 2)
        const t = 0.88 + o * 0.24
        d[idx] = Math.min(255, d[idx] * t * style.oceanTint[0])
        d[idx + 1] = Math.min(255, d[idx + 1] * t * style.oceanTint[1])
        d[idx + 2] = Math.min(255, d[idx + 2] * t * style.oceanTint[2])
      }
    }
  }
  ctx.putImageData(img, 0, 0)

  // --- 4. 经纬网格（淡） ---
  ctx.strokeStyle = style.grid
  ctx.lineWidth = 1
  for (let lon = -180; lon <= 180; lon += 30) {
    const [px] = project(lon, 0, w, h)
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke()
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const [, py] = project(0, lat, w, h)
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke()
  }

  // --- 5. 海岸线发光描边（只描边，保留内部地形色） ---
  ctx.save()
  ctx.shadowColor = style.coastGlow
  ctx.shadowBlur = 14
  ctx.strokeStyle = style.coast
  ctx.lineWidth = 2.2
  ctx.lineJoin = 'round'
  land.features.forEach(f => eachPolygon(f.geometry, rings => { tracePolygon(rings); ctx.stroke() }))
  ctx.restore()
  // 再描一道清晰细线
  ctx.strokeStyle = style.coast
  ctx.lineWidth = 0.9
  ctx.lineJoin = 'round'
  land.features.forEach(f => eachPolygon(f.geometry, rings => { tracePolygon(rings); ctx.stroke() }))

  // --- 6. 纸纹 ---
  if (style.paper) addPaperNoise(ctx, w, h, 0.035)

  return { canvas, countries }
}

// 单独生成国界线贴图（透明底，叠加用）
export function buildBorderTexture(countries, styleKey = 'teyvat', size = 2048) {
  const style = STYLES[styleKey]
  const w = size, h = size / 2
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')

  ctx.strokeStyle = style.border
  ctx.lineWidth = 1.2
  ctx.lineJoin = 'round'
  countries.features.forEach(f => {
    eachPolygon(f.geometry, rings => {
      ctx.beginPath()
      for (const ring of rings) {
        ring.forEach(([lon, lat], i) => {
          const x = (lon + 180) / 360 * w
          const y = (90 - lat) / 180 * h
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        })
        ctx.closePath()
      }
      ctx.stroke()
    })
  })
  return canvas
}
