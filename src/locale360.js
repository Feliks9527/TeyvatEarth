// 进入当地：360° 全景查看器
// 用真实代表性照片（来自维基百科）拼成等距柱状全景，包裹在以元素属性着色的提瓦特天空中。
// 鼠标拖拽环视一周，滚轮缩放视野；照片缺失时退化为纯程序化天空，依旧可 360° 环视。

import * as THREE from 'three'

let renderer = null
let raf = null
let cleanup = null

// hex -> 'rgb(r,g,b)'，f 为明度系数
function tint(hex, f) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f))
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f))
  const b = Math.min(255, Math.round((n & 255) * f))
  return `rgb(${r},${g},${b})`
}

// 把一张普通照片以 cover 方式画进 tw×th 的离屏画布
function coverCanvas(img, tw, th) {
  const c = document.createElement('canvas')
  c.width = tw; c.height = th
  const x = c.getContext('2d')
  const s = Math.max(tw / img.width, th / img.height)
  const dw = img.width * s, dh = img.height * s
  x.drawImage(img, (tw - dw) / 2, (th - dh) / 2, dw, dh)
  return c
}

// 构建 2048×1024 等距柱状全景画布：天空渐变 + 地平线照片带（左右镜像无缝环绕）
function buildPanoCanvas(el, img) {
  const W = 2048, H = 1024
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')

  // 天空 + 地面竖向渐变
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0.00, el.sky[0])
  g.addColorStop(0.30, el.sky[1])
  g.addColorStop(0.48, el.sky[2])
  g.addColorStop(0.62, tint(el.sky[2], 0.6))
  g.addColorStop(1.00, tint(el.sky[2], 0.32))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  const bandTop = H * 0.34
  const bandH = H * 0.62

  if (img) {
    // 一块 1024×bandH 的 tile，正反镜像各画一次 -> 两道接缝都连续
    const tileW = W / 2
    const tile = coverCanvas(img, tileW, bandH)
    ctx.drawImage(tile, 0, bandTop)
    ctx.save()
    ctx.scale(-1, 1)
    ctx.drawImage(tile, -W, bandTop, tileW, bandH)
    ctx.restore()

    // 顶部羽化：照片顶端融入天空（rgb 无 alpha，改用 rgba 渐变覆盖）
    const fh = H * 0.16
    const top = el.sky[2]
    const tn = parseInt(top.slice(1), 16)
    const tr = (tn >> 16) & 255, tg = (tn >> 8) & 255, tb = tn & 255
    const fg = ctx.createLinearGradient(0, bandTop, 0, bandTop + fh)
    fg.addColorStop(0, `rgba(${tr},${tg},${tb},0.95)`)
    fg.addColorStop(1, `rgba(${tr},${tg},${tb},0)`)
    ctx.fillStyle = fg
    ctx.fillRect(0, bandTop, W, fh)

    // 底部加深，做出贴地阴影
    const bn = ctx.createLinearGradient(0, H * 0.86, 0, H)
    bn.addColorStop(0, 'rgba(0,0,0,0)')
    bn.addColorStop(1, 'rgba(0,0,0,0.5)')
    ctx.fillStyle = bn
    ctx.fillRect(0, H * 0.86, W, H * 0.14)
  }

  // 元素色统一调和
  ctx.globalCompositeOperation = 'soft-light'
  ctx.globalAlpha = 0.35
  ctx.fillStyle = el.color
  ctx.fillRect(0, 0, W, H)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'

  // 地平线微光
  const hy = bandTop
  const hl = ctx.createLinearGradient(0, hy - 14, 0, hy + 14)
  hl.addColorStop(0, 'rgba(255,255,255,0)')
  hl.addColorStop(0.5, el.particle + 'cc')
  hl.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = hl
  ctx.fillRect(0, hy - 14, W, 28)

  return c
}

export function startLocale(canvas, profile, _wp, img) {
  stopLocale(canvas)
  const el = profile.element

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  let W = canvas.clientWidth, H = canvas.clientHeight
  renderer.setSize(W, H, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(72, W / H, 1, 1100)

  // 全景球（内表面）
  const panoCanvas = buildPanoCanvas(el, img)
  const tex = new THREE.CanvasTexture(panoCanvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const geo = new THREE.SphereGeometry(500, 64, 40)
  geo.scale(-1, 1, 1)              // 翻到内表面
  const mat = new THREE.MeshBasicMaterial({ map: tex })
  const sphere = new THREE.Mesh(geo, mat)
  scene.add(sphere)

  // 漂浮元素粒子
  const N = 240
  const pos = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    const r = 120 + Math.random() * 260
    const t = Math.random() * Math.PI * 2
    const p = Math.acos(2 * Math.random() - 1)
    pos[i * 3]     = r * Math.sin(p) * Math.cos(t)
    pos[i * 3 + 1] = (Math.random() - 0.3) * 300
    pos[i * 3 + 2] = r * Math.sin(p) * Math.sin(t)
  }
  const pg = new THREE.BufferGeometry()
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const pm = new THREE.PointsMaterial({
    color: new THREE.Color(el.particle), size: 4, transparent: true,
    opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
  })
  const points = new THREE.Points(pg, pm)
  scene.add(points)

  // ---- 拖拽环视控制 ----
  let lon = 0, lat = 6, fov = 72
  let dragging = false, dx = 0, dy = 0, dLon = 0, dLat = 0
  let idle = true

  const onDown = (e) => { dragging = true; idle = false; dx = e.clientX; dy = e.clientY; dLon = lon; dLat = lat }
  const onMove = (e) => {
    if (!dragging) return
    lon = (dx - e.clientX) * 0.12 + dLon
    lat = (e.clientY - dy) * 0.12 + dLat
  }
  const onUp = () => { dragging = false; setTimeout(() => { idle = true }, 2500) }
  const onWheel = (e) => {
    e.preventDefault()
    fov = Math.max(40, Math.min(92, fov + e.deltaY * 0.05))
    camera.fov = fov; camera.updateProjectionMatrix()
    idle = false; setTimeout(() => { idle = true }, 2500)
  }

  canvas.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })

  const target = new THREE.Vector3()
  function frame() {
    if (idle && !dragging) lon += 0.02      // 闲置缓慢自转
    lat = Math.max(-80, Math.min(80, lat))
    const phi = THREE.MathUtils.degToRad(90 - lat)
    const theta = THREE.MathUtils.degToRad(lon)
    target.setFromSphericalCoords(1, phi, theta)
    camera.lookAt(target)
    points.rotation.y += 0.0006
    renderer.render(scene, camera)
    raf = requestAnimationFrame(frame)
  }
  frame()

  const onResize = () => {
    W = canvas.clientWidth; H = canvas.clientHeight
    camera.aspect = W / H; camera.updateProjectionMatrix()
    renderer.setSize(W, H, false)
  }
  window.addEventListener('resize', onResize)

  cleanup = () => {
    canvas.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('wheel', onWheel)
    window.removeEventListener('resize', onResize)
    geo.dispose(); mat.dispose(); tex.dispose()
    pg.dispose(); pm.dispose()
    renderer.dispose()
    renderer = null
  }
}

export function stopLocale() {
  if (raf) cancelAnimationFrame(raf)
  raf = null
  if (cleanup) { cleanup(); cleanup = null }
}
