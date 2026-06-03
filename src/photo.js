// 取地点代表性照片：维基百科 pageimages（页面首图，通常是地标/天际线）
// JSON 请求带 origin=* 启用 CORS；图片来自 upload.wikimedia.org，允许跨域绘制到画布。

const cache = {}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

async function queryImage(lang, title) {
  const url = `https://${lang}.wikipedia.org/w/api.php`
    + `?action=query&format=json&origin=*&redirects=1`
    + `&prop=pageimages&piprop=original|thumbnail&pithumbsize=1600`
    + `&generator=search&gsrsearch=${encodeURIComponent(title)}&gsrlimit=1`
  const res = await fetch(url)
  const data = await res.json()
  const pages = data?.query?.pages
  if (!pages) return null
  for (const k in pages) {
    const p = pages[k]
    const src = p.original?.source || p.thumbnail?.source
    if (src) return src
  }
  return null
}

// 返回 HTMLImageElement 或 null（失败时降级为程序化天空）
export async function fetchPhoto(query, fallback) {
  const key = query
  if (cache[key] !== undefined) return cache[key]
  try {
    let src = await queryImage('zh', query)
    if (!src && fallback) src = await queryImage('en', fallback)
    const img = src ? await loadImage(src) : null
    cache[key] = img
    return img
  } catch (e) {
    cache[key] = null
    return null
  }
}
