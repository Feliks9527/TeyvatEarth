import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { WAYPOINTS, KIND_META } from './data/waypoints.js'
import { buildEarthTexture, buildBorderTexture, STYLES, STYLE_ORDER } from './earthTexture.js'
import { createMarker, latLonToVec3 } from './markers.js'
import { getRegionProfile } from './region.js'
import { startLocale, stopLocale } from './locale360.js'
import { fetchPhoto } from './photo.js'
import {
  earthVertex, earthFragment,
  atmosphereVertex, atmosphereFragment,
} from './shaders/earth.js'

const RADIUS = 2

// ---------- 基础场景 ----------
const canvas = document.getElementById('scene')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace

const scene = new THREE.Scene()
scene.background = new THREE.Color('#070b14')

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100)
camera.position.set(0, 1.5, 6)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.rotateSpeed = 0.5
controls.minDistance = RADIUS * 1.35
controls.maxDistance = RADIUS * 5
controls.enablePan = false

// ---------- 星空背景 ----------
function makeStars() {
  const n = 1800
  const pos = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const r = 40 + Math.random() * 30
    const t = Math.random() * Math.PI * 2
    const p = Math.acos(2 * Math.random() - 1)
    pos[i * 3]     = r * Math.sin(p) * Math.cos(t)
    pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t)
    pos[i * 3 + 2] = r * Math.cos(p)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({ color: 0xfff0d0, size: 0.12, transparent: true, opacity: 0.8 })
  return new THREE.Points(geo, mat)
}
scene.add(makeStars())

// ---------- 灯光（仅用于精灵/立柱可见度，地表用自定义 shader） ----------
scene.add(new THREE.AmbientLight(0xffffff, 1))

// ---------- 地球材质 ----------
const earthGeo = new THREE.SphereGeometry(RADIUS, 96, 96)
const earthUniforms = {
  mapTex:    { value: null },
  borderTex: { value: null },
  borderMix: { value: 1.0 },
  lightDir:  { value: new THREE.Vector3(1, 0.4, 0.8).normalize() },
  rimColor:  { value: new THREE.Color('#9fe3ff') },
  time:      { value: 0 },
}
const earthMat = new THREE.ShaderMaterial({
  vertexShader: earthVertex,
  fragmentShader: earthFragment,
  uniforms: earthUniforms,
})
const earth = new THREE.Mesh(earthGeo, earthMat)
scene.add(earth)

// ---------- 大气：仅保留贴地的极淡暖色薄雾（去掉外层蓝色光圈） ----------
const hazeMat = new THREE.ShaderMaterial({
  vertexShader: atmosphereVertex,
  fragmentShader: atmosphereFragment,
  uniforms: {
    glowColor: { value: new THREE.Color('#ffe7b3') },
    intensity: { value: 0.35 },
    power:     { value: 5.0 },
  },
  side: THREE.FrontSide,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})
scene.add(new THREE.Mesh(new THREE.SphereGeometry(RADIUS * 1.008, 64, 64), hazeMat))

// ---------- 锚点 ----------
const markerGroup = new THREE.Group()
earth.add(markerGroup)               // 挂到地球上，跟随自转
const markers = []
const markerSprites = []
WAYPOINTS.forEach(wp => {
  const m = createMarker(wp, RADIUS)
  markerGroup.add(m)
  markers.push(m)
  markerSprites.push(m.userData.sprite)
})

// 传送激活光环（点击时在锚点处展开）
let activeRing = null
function spawnRing(group) {
  if (activeRing) earth.remove(activeRing)
  const geo = new THREE.RingGeometry(0.01, 0.02, 48)
  const meta = KIND_META[group.userData.wp.kind]
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(meta.ring), transparent: true, opacity: 1,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
  })
  const ring = new THREE.Mesh(geo, mat)
  ring.position.copy(group.userData.worldPos)
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), group.userData.normal)
  ring.userData.born = performance.now()
  earth.add(ring)
  activeRing = ring
}

// ---------- 贴图加载 / 风格切换 ----------
let topo = null
let styleIdx = 0
let borderOn = true

async function loadTopo() {
  const res = await fetch(import.meta.env.BASE_URL + 'data/countries-110m.json')
  topo = await res.json()
}

function applyStyle(key) {
  const { canvas: mapCanvas, countries } = buildEarthTexture(topo, key)
  const mapTex = new THREE.CanvasTexture(mapCanvas)
  mapTex.colorSpace = THREE.SRGBColorSpace
  mapTex.anisotropy = renderer.capabilities.getMaxAnisotropy()
  earthUniforms.mapTex.value?.dispose?.()
  earthUniforms.mapTex.value = mapTex

  const borderCanvas = buildBorderTexture(countries, key)
  const borderTex = new THREE.CanvasTexture(borderCanvas)
  borderTex.colorSpace = THREE.SRGBColorSpace
  borderTex.anisotropy = renderer.capabilities.getMaxAnisotropy()
  earthUniforms.borderTex.value?.dispose?.()
  earthUniforms.borderTex.value = borderTex

  // 边缘薄雾与描边颜色随风格变（外层蓝色光圈已移除）
  const moods = {
    teyvat: ['#6fd3ff', '#ffe7b3'],
    dawn:   ['#ffc98a', '#fff0d0'],
    abyss:  ['#a06eff', '#c79bff'],
  }
  const [glow, haze] = moods[key]
  hazeMat.uniforms.glowColor.value.set(haze)
  earthUniforms.rimColor.value.set(glow)
}

// ---------- 交互：射线拾取 ----------
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let hovered = null
const _markerWorld = new THREE.Vector3()

const tooltip = document.getElementById('tooltip')

function updatePointer(e) {
  pointer.x = (e.clientX / innerWidth) * 2 - 1
  pointer.y = -(e.clientY / innerHeight) * 2 + 1
}

canvas.addEventListener('pointermove', (e) => {
  updatePointer(e)
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(markerSprites, false)
  if (hits.length) {
    const sp = hits[0].object
    hovered = sp
    const wp = sp.userData.wp
    tooltip.textContent = `${KIND_META[wp.kind].emblem} ${wp.name}`
    tooltip.style.left = e.clientX + 'px'
    tooltip.style.top = e.clientY + 'px'
    tooltip.classList.add('show')
    document.body.style.cursor = 'pointer'
  } else {
    hovered = null
    tooltip.classList.remove('show')
    document.body.style.cursor = ''
  }
})

// 点击：打开详情卡片
let downPos = null
canvas.addEventListener('pointerdown', (e) => { downPos = { x: e.clientX, y: e.clientY } })
canvas.addEventListener('pointerup', (e) => {
  if (!downPos) return
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y)
  downPos = null
  if (moved > 6) return            // 拖拽则不算点击
  updatePointer(e)
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(markerSprites, false)
  if (hits.length) {
    const group = hits[0].object.parent
    openCard(group)
  }
})

// ---------- 详情卡片 + 传送 ----------
const card = document.getElementById('card')
const cardEmblem = document.getElementById('card-emblem')
const cardKind = document.getElementById('card-kind')
const cardTitle = document.getElementById('card-title')
const cardSub = document.getElementById('card-sub')
const cardCoords = document.getElementById('card-coords')
let cardTarget = null

function openCard(group) {
  cardTarget = group
  const wp = group.userData.wp
  const meta = KIND_META[wp.kind]
  cardEmblem.textContent = meta.emblem
  cardEmblem.style.color = meta.color
  cardKind.textContent = meta.label
  cardTitle.textContent = wp.name
  cardSub.textContent = wp.sub
  const ns = wp.lat >= 0 ? 'N' : 'S'
  const ew = wp.lon >= 0 ? 'E' : 'W'
  cardCoords.textContent = `${Math.abs(wp.lat).toFixed(2)}°${ns}  ·  ${Math.abs(wp.lon).toFixed(2)}°${ew}`
  card.classList.add('show')
  spawnRing(group)
}
function closeCard() { card.classList.remove('show'); cardTarget = null }

document.getElementById('card-close').onclick = closeCard
document.getElementById('card-warp').onclick = () => {
  if (cardTarget) flyTo(cardTarget)
  closeCard()
}

// ---------- 进入当地：本地场景 ----------
const locale = document.getElementById('locale')
const localeCanvas = document.getElementById('locale-canvas')
const localeKind = document.getElementById('locale-kind')
const localeTitle = document.getElementById('locale-title')
const localeTags = document.getElementById('locale-tags')
const localeFlavor = document.getElementById('locale-flavor')
const localeCoords = document.getElementById('locale-coords')
const localeHint = document.getElementById('locale-hint')
let localeOpen = false

// 现实地点 -> 英文回退检索词（中文维基查不到时用）
function enQuery(wp) {
  const m = {
    '北京': 'Beijing', '上海': 'Shanghai', '东京': 'Tokyo', '京都': 'Kyoto', '大阪': 'Osaka',
    '伦敦': 'London', '巴黎': 'Paris', '纽约': 'New York City', '罗马': 'Rome', '威尼斯': 'Venice',
    '珠穆朗玛峰': 'Mount Everest', '撒哈拉之眼': 'Richat Structure', '富士山': 'Mount Fuji',
    '大峡谷': 'Grand Canyon', '大堡礁': 'Great Barrier Reef', '维多利亚瀑布': 'Victoria Falls',
    '北极点': 'Arctic', '南极点': 'Antarctica', '亚马逊': 'Amazon rainforest', '冰岛火山': 'Iceland volcano',
  }
  return m[wp.name] || wp.name
}

function enterLocale(group) {
  const wp = group.userData.wp
  const meta = KIND_META[wp.kind]
  const profile = getRegionProfile(wp)
  const el = profile.element

  localeKind.textContent = `${meta.label} · ${el.nation}`
  localeTitle.textContent = wp.name
  localeFlavor.textContent = profile.flavor
  const ns = wp.lat >= 0 ? 'N' : 'S', ew = wp.lon >= 0 ? 'E' : 'W'
  localeCoords.textContent = `${Math.abs(wp.lat).toFixed(2)}°${ns}  ·  ${Math.abs(wp.lon).toFixed(2)}°${ew}  ·  ${wp.sub}`

  localeTags.innerHTML = `
    <span class="locale-tag"><span class="tag-el" style="color:${el.color}">◈ ${el.cn}</span></span>
    <span class="locale-tag">☁ ${profile.weather}</span>
    <span class="locale-tag">⛰ ${profile.biome}</span>`

  // 过场闪光 + 拉起全景容器
  warpFx.classList.remove('active'); void warpFx.offsetWidth; warpFx.classList.add('active')
  localeOpen = true
  if (localeHint) localeHint.textContent = '正在接入当地影像…'

  setTimeout(async () => {
    if (!localeOpen) return
    locale.classList.add('show')
    // 先用程序化天空即时进入，照片到位后再重建全景
    startLocale(localeCanvas, profile, wp, null)
    const img = await fetchPhoto(wp.name, enQuery(wp))
    if (!localeOpen) return
    if (img) {
      startLocale(localeCanvas, profile, wp, img)
      if (localeHint) localeHint.textContent = '拖拽环视 · 滚轮缩放'
    } else {
      if (localeHint) localeHint.textContent = '未找到当地影像 · 程序化天景'
    }
  }, 350)
}

function exitLocale() {
  localeOpen = false
  locale.classList.remove('show')
  setTimeout(() => stopLocale(localeCanvas), 600)
}

document.getElementById('card-enter').onclick = () => {
  if (cardTarget) { const g = cardTarget; flyTo(g); closeCard(); setTimeout(() => enterLocale(g), 700) }
}
document.getElementById('locale-back').onclick = exitLocale

// 传送：相机飞向锚点 + 过场特效
const warpFx = document.getElementById('warp-fx')
let flight = null
function flyTo(group) {
  warpFx.classList.remove('active')
  void warpFx.offsetWidth
  warpFx.classList.add('active')

  autoSpin = false
  refreshSpinBtn()

  // 计算目标相机位置（锚点世界方向 * 距离）
  const worldDir = group.getWorldPosition(new THREE.Vector3()).normalize()
  const dist = RADIUS * 2.1
  flight = {
    from: camera.position.clone(),
    to: worldDir.multiplyScalar(dist),
    start: performance.now(),
    dur: 1100,
  }
}

// ---------- 控制按钮 ----------
let autoSpin = true
const btnSpin = document.getElementById('btn-spin')
const btnBorders = document.getElementById('btn-borders')
const btnStyle = document.getElementById('btn-style')

function refreshSpinBtn() {
  btnSpin.querySelector('.ctrl-label').textContent = `自转：${autoSpin ? '开' : '关'}`
  btnSpin.classList.toggle('off', !autoSpin)
}
btnSpin.onclick = () => { autoSpin = !autoSpin; refreshSpinBtn() }

btnBorders.onclick = () => {
  borderOn = !borderOn
  earthUniforms.borderMix.value = borderOn ? 1.0 : 0.0
  btnBorders.querySelector('.ctrl-label').textContent = `国界：${borderOn ? '开' : '关'}`
  btnBorders.classList.toggle('off', !borderOn)
}

btnStyle.onclick = () => {
  styleIdx = (styleIdx + 1) % STYLE_ORDER.length
  const key = STYLE_ORDER[styleIdx]
  applyStyle(key)
  btnStyle.querySelector('.ctrl-label').textContent = `风格：${STYLES[key].name}`
}

// ---------- 动画循环 ----------
const clock = new THREE.Clock()
function animate() {
  requestAnimationFrame(animate)
  if (localeOpen) return            // 进入当地全景时暂停地球渲染，省一份 WebGL 开销
  const dt = clock.getDelta()
  const t = clock.elapsedTime

  if (autoSpin && !flight) earth.rotation.y += dt * 0.05
  earthUniforms.time.value = t

  // 锚点：恒定屏幕尺寸（按相机距离补偿）+ 呼吸 + 悬停放大
  const REF_DIST = RADIUS * 2.6
  markers.forEach(m => {
    const sp = m.userData.sprite
    const base = sp.userData.baseScale
    const dist = sp.getWorldPosition(_markerWorld).distanceTo(camera.position)
    const pulse = 1 + Math.sin(t * 2.5 + m.position.x) * 0.06
    const hl = (hovered === sp) ? 1.35 : 1
    const s = base * (dist / REF_DIST) * pulse * hl
    sp.scale.set(s, s, 1)
  })

  // 激活光环扩散
  if (activeRing) {
    const age = (performance.now() - activeRing.userData.born) / 1000
    const r = 0.02 + age * 0.5
    activeRing.scale.set(r * 30, r * 30, 1)
    activeRing.material.opacity = Math.max(0, 1 - age / 1.4)
    if (age > 1.4) { earth.remove(activeRing); activeRing = null }
  }

  // 相机飞行插值
  if (flight) {
    const p = Math.min(1, (performance.now() - flight.start) / flight.dur)
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2  // easeInOutQuad
    camera.position.lerpVectors(flight.from, flight.to, e)
    camera.lookAt(0, 0, 0)
    if (p >= 1) flight = null
  }

  controls.update()
  renderer.render(scene, camera)
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

// ---------- 启动 ----------
;(async function init() {
  await loadTopo()
  applyStyle(STYLE_ORDER[styleIdx])
  document.getElementById('loader').classList.add('hidden')
  animate()
})().catch(err => {
  console.error(err)
  document.querySelector('.loader-text').textContent = '加载失败：' + err.message
})
