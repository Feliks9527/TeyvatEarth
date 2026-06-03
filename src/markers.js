import * as THREE from 'three'
import { KIND_META } from './data/waypoints.js'

// 经纬度 -> 球面坐标
export function latLonToVec3(lat, lon, radius) {
  const phi = (90 - lat) * Math.PI / 180
  const theta = (lon + 180) * Math.PI / 180
  const x = -radius * Math.sin(phi) * Math.cos(theta)
  const z = radius * Math.sin(phi) * Math.sin(theta)
  const y = radius * Math.cos(phi)
  return new THREE.Vector3(x, y, z)
}

// ---- 绘制原神风格锚点图标到 canvas ----
function drawStatue(ctx, s, color, ring) {
  // 七天神像：菱形宝座 + 翼状装饰
  ctx.save()
  ctx.translate(s / 2, s / 2)
  // 光晕底
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.48)
  g.addColorStop(0, color); g.addColorStop(0.35, color + 'aa'); g.addColorStop(1, 'transparent')
  ctx.globalAlpha = 0.5; ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(0, 0, s * 0.48, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1

  const r = s * 0.26
  // 外环
  ctx.lineWidth = s * 0.035; ctx.strokeStyle = ring
  ctx.beginPath(); ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2); ctx.stroke()
  // 翼
  ctx.fillStyle = ring
  for (const dir of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(dir * r * 1.2, -r * 0.2)
    ctx.quadraticCurveTo(dir * r * 2.3, -r * 0.9, dir * r * 1.9, r * 0.1)
    ctx.quadraticCurveTo(dir * r * 1.6, -r * 0.1, dir * r * 1.2, r * 0.2)
    ctx.closePath(); ctx.fill()
  }
  // 中心菱形宝座
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.7, 0)
  ctx.closePath(); ctx.fill()
  ctx.lineWidth = s * 0.03; ctx.strokeStyle = '#fff8e6'; ctx.stroke()
  // 神之眼宝珠
  ctx.fillStyle = '#fff8e6'
  ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 0.28, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

function drawWaypoint(ctx, s, color, ring) {
  // 传送锚点：上尖下圆的水滴菱形 + 内部四芒星
  ctx.save()
  ctx.translate(s / 2, s / 2)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.46)
  g.addColorStop(0, color); g.addColorStop(0.4, color + '99'); g.addColorStop(1, 'transparent')
  ctx.globalAlpha = 0.45; ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(0, 0, s * 0.46, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1

  const r = s * 0.28
  // 水滴菱形外形
  ctx.fillStyle = color
  ctx.strokeStyle = ring; ctx.lineWidth = s * 0.04
  ctx.beginPath()
  ctx.moveTo(0, -r * 1.4)
  ctx.quadraticCurveTo(r, -r * 0.2, r * 0.75, r * 0.5)
  ctx.quadraticCurveTo(0, r * 1.2, -r * 0.75, r * 0.5)
  ctx.quadraticCurveTo(-r, -r * 0.2, 0, -r * 1.4)
  ctx.closePath(); ctx.fill(); ctx.stroke()
  // 内部四芒星
  ctx.fillStyle = '#eafcff'
  ctx.beginPath()
  const sp = r * 0.6
  ctx.moveTo(0, -sp); ctx.lineTo(sp * 0.28, -sp * 0.28)
  ctx.lineTo(sp, 0); ctx.lineTo(sp * 0.28, sp * 0.28)
  ctx.lineTo(0, sp); ctx.lineTo(-sp * 0.28, sp * 0.28)
  ctx.lineTo(-sp, 0); ctx.lineTo(-sp * 0.28, -sp * 0.28)
  ctx.closePath(); ctx.fill()
  ctx.restore()
}

function drawDomain(ctx, s, color, ring) {
  // 秘境：六边形传送门 + 漩涡
  ctx.save()
  ctx.translate(s / 2, s / 2)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.46)
  g.addColorStop(0, color); g.addColorStop(0.4, color + '88'); g.addColorStop(1, 'transparent')
  ctx.globalAlpha = 0.5; ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(0, 0, s * 0.46, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1

  const r = s * 0.3
  // 六边形门框
  ctx.strokeStyle = ring; ctx.lineWidth = s * 0.05
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + i * Math.PI / 3
    const x = Math.cos(a) * r, y = Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.closePath(); ctx.stroke()
  // 内层填充
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + i * Math.PI / 3
    const x = Math.cos(a) * r * 0.72, y = Math.sin(a) * r * 0.72
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.closePath(); ctx.fill()
  // 漩涡中心
  ctx.strokeStyle = '#f3eaff'; ctx.lineWidth = s * 0.025
  ctx.beginPath()
  for (let t = 0; t < Math.PI * 3; t += 0.2) {
    const rr = r * 0.5 * (t / (Math.PI * 3))
    const x = Math.cos(t) * rr, y = Math.sin(t) * rr
    if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
}

const DRAWERS = { statue: drawStatue, waypoint: drawWaypoint, domain: drawDomain }

// 为每种 kind 生成一张精灵纹理
const texCache = {}
function getMarkerTexture(kind) {
  if (texCache[kind]) return texCache[kind]
  const s = 256
  const canvas = document.createElement('canvas')
  canvas.width = s; canvas.height = s
  const ctx = canvas.getContext('2d')
  const meta = KIND_META[kind]
  DRAWERS[kind](ctx, s, meta.color, meta.ring)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  texCache[kind] = tex
  return tex
}

// 创建一个锚点（精灵 + 引脚立柱 + 数据），返回 Group
export function createMarker(wp, radius) {
  const pos = latLonToVec3(wp.lat, wp.lon, radius)
  const normal = pos.clone().normalize()

  const group = new THREE.Group()
  group.position.copy(pos)

  // 立柱：从地表向外的小光柱
  const stemLen = radius * 0.06
  const stemGeo = new THREE.CylinderGeometry(radius * 0.002, radius * 0.004, stemLen, 6)
  const stemMat = new THREE.MeshBasicMaterial({
    color: KIND_META[wp.kind].color, transparent: true, opacity: 0.55,
  })
  const stem = new THREE.Mesh(stemGeo, stemMat)
  stem.position.copy(normal.clone().multiplyScalar(stemLen / 2))
  stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal)
  group.add(stem)

  // 精灵图标
  const tex = getMarkerTexture(wp.kind)
  const spriteMat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: true, depthWrite: false,
  })
  const sprite = new THREE.Sprite(spriteMat)
  const scale = radius * (wp.kind === 'statue' ? 0.13 : 0.1)
  sprite.scale.set(scale, scale, 1)
  sprite.position.copy(normal.clone().multiplyScalar(stemLen))
  sprite.userData = { wp, isMarker: true, baseScale: scale }
  group.add(sprite)

  group.userData = { wp, sprite, normal: normal.clone(), worldPos: pos.clone() }
  return group
}
