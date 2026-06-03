// 地区档案：根据锚点经纬度，映射到提瓦特七国元素属性，并派生天气/地貌/风味文案
// 元素：anemo风 geo岩 electro雷 dendro草 hydro水 pyro火 cryo冰

export const ELEMENTS = {
  anemo:   { cn: '风元素', nation: '蒙德', color: '#74c2a8', sky: ['#bfe9d6', '#7fc6c9', '#4a8fb0'], particle: '#a8f0d0' },
  geo:     { cn: '岩元素', nation: '璃月', color: '#f8b73e', sky: ['#ffe3a8', '#e8b15c', '#b9763a'], particle: '#ffd98a' },
  electro: { cn: '雷元素', nation: '稻妻', color: '#b58cff', sky: ['#d9c4ff', '#9a7bd6', '#5b3f8c'], particle: '#d8b8ff' },
  dendro:  { cn: '草元素', nation: '须弥', color: '#9cd83e', sky: ['#dff0b0', '#9ec85a', '#5a8a3a'], particle: '#cdf08a' },
  hydro:   { cn: '水元素', nation: '枫丹', color: '#4fc3e8', sky: ['#cfeefc', '#6fc3e8', '#2f7bb0'], particle: '#aef0ff' },
  pyro:    { cn: '火元素', nation: '纳塔', color: '#ff7a4a', sky: ['#ffd0a0', '#ff8a5c', '#c2452f'], particle: '#ffb38a' },
  cryo:    { cn: '冰元素', nation: '至冬', color: '#a8e0ff', sky: ['#eaf6ff', '#bcdcf0', '#7fa8c8'], particle: '#dff2ff' },
}

const WEATHERS = {
  clear:   '晴朗',
  cloud:   '多云',
  rain:    '细雨',
  storm:   '雷雨',
  snow:    '飘雪',
  sand:    '沙尘',
  mist:    '薄雾',
  aurora:  '极光',
}

// 经纬度 -> 元素属性（对应现实地理 → 提瓦特国度的趣味映射）
function deriveElement(wp) {
  const { lat, lon } = wp
  const a = Math.abs(lat)
  // 稻妻：日本列岛
  if (lon > 127 && lon < 147 && lat > 30 && lat < 46) return 'electro'
  // 璃月：东亚大陆
  if (lon > 100 && lon < 127 && lat > 18 && lat < 45) return 'geo'
  // 枫丹：西欧
  if (lon > -6 && lon < 12 && lat > 42 && lat < 52) return 'hydro'
  // 须弥：南亚 / 中东沙漠带
  if (lon > 25 && lon < 92 && lat > 8 && lat < 35) return 'dendro'
  // 至冬：高纬寒带
  if (a > 55) return 'cryo'
  // 纳塔：热带 / 火山
  if (a < 18) return 'pyro'
  // 蒙德：温带其余地区（默认风）
  return 'anemo'
}

// 纬度 + 元素 -> 地貌
function deriveBiome(wp) {
  const a = Math.abs(wp.lat)
  if (a > 66) return '极地冰原'
  if (a > 55) return '针叶林雪原'
  if (a > 45) return '温带山地'
  if (a > 30 && a < 35 && Math.abs(wp.lon) < 60) return '副热带沙漠'
  if (a < 16) return '热带雨林'
  if (a < 28) return '亚热带季风'
  return '温带平原'
}

// 元素 + 地貌 -> 天气倾向（带一点随机种子但稳定）
function deriveWeather(wp, el) {
  const a = Math.abs(wp.lat)
  const seed = Math.floor((wp.lat * 7 + wp.lon * 13)) % 5
  if (el === 'cryo' || a > 60) return WEATHERS.snow
  if (el === 'electro') return seed % 2 ? WEATHERS.storm : WEATHERS.rain
  if (el === 'hydro') return seed % 2 ? WEATHERS.rain : WEATHERS.mist
  if (el === 'dendro' && a < 30) return WEATHERS.rain
  if (el === 'pyro') return WEATHERS.clear
  if (wp.lat > 60) return WEATHERS.aurora
  const arr = [WEATHERS.clear, WEATHERS.cloud, WEATHERS.mist, WEATHERS.clear, WEATHERS.cloud]
  return arr[Math.abs(seed)]
}

// 风味文案
function deriveFlavor(wp, el, biome) {
  const e = ELEMENTS[el]
  const lines = {
    anemo: `风自${biome}的尽头吹来，旅行者，这里的风也想带你去远方。`,
    geo: `磐岩镇压的土地，繁华与契约在此交汇，岩之力守护着此地的安宁。`,
    electro: `永恒的雷光照亮${biome}，神樱摇曳，雷鸣中藏着不灭的执念。`,
    dendro: `草木的智慧在${biome}生长，知识如雨林般繁茂而深邃。`,
    hydro: `水流淌过${biome}，正义与艺术在这片水乡交织成歌。`,
    pyro: `战意如火，${biome}的炽热点燃了此地子民的灵魂。`,
    cryo: `冰封的${biome}下，深埋着古老的回忆与不曾熄灭的火种。`,
  }
  return lines[el] || `这是一片被${e.cn}眷顾的土地。`
}

// 主入口：返回锚点的完整地区档案
export function getRegionProfile(wp) {
  const el = deriveElement(wp)
  const biome = deriveBiome(wp)
  const weather = deriveWeather(wp, el)
  const element = ELEMENTS[el]
  return {
    elementKey: el,
    element,
    biome,
    weather,
    flavor: deriveFlavor(wp, el, biome),
  }
}
