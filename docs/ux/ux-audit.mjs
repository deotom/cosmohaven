// HUD audit: captures each UI state at three resolutions and reports text volume, panel boxes and overlaps.
// Needs a dev server on PORT and `puppeteer-core` + Chrome (not project dependencies).
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

const PORT = process.env.PORT ?? 5199
const OUT = process.env.OUT ?? './ux-out'
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const SIZES = [
  [1280, 720],
  [1920, 1080],
  [2560, 1440],
]
fs.mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  defaultViewport: { width: 1280, height: 720 },
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const text = () => page.evaluate(() => document.body.innerText)
const clickText = (needle) =>
  page.evaluate((n) => {
    const el = [...document.querySelectorAll('div,button,span')].find((e) => e.children.length === 0 && e.innerText?.trim().toUpperCase() === n)
    if (el) el.click()
    return !!el
  }, needle)
const waitFor = async (pred, tries = 90, ms = 1000) => {
  for (let i = 0; i < tries; i++) {
    if (await pred()) return true
    await sleep(ms)
  }
  return false
}

/** Boxes of the HUD's top-level overlays (absolute/fixed, with text, not the canvas or full-screen wrappers). */
const measure = () =>
  page.evaluate(() => {
    const vw = innerWidth
    const vh = innerHeight
    const candidates = [...document.querySelectorAll('body *')].filter((el) => {
      const cs = getComputedStyle(el)
      if (cs.position !== 'absolute' && cs.position !== 'fixed') return false
      if (cs.display === 'none' || cs.visibility === 'hidden') return false
      if (!el.innerText || el.innerText.trim().length === 0) return false
      const r = el.getBoundingClientRect()
      if (r.width < 40 || r.height < 16) return false
      if (r.width > vw * 0.9 && r.height > vh * 0.9) return false // full-screen wrappers
      return true
    })
    // keep the outermost candidates only
    const top = candidates.filter((el) => !candidates.some((other) => other !== el && other.contains(el)))
    const boxes = top.map((el) => {
      const r = el.getBoundingClientRect()
      return {
        name: (el.className && String(el.className).split(' ')[0]) || el.getAttribute('role') || el.tagName.toLowerCase(),
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
        lines: el.innerText.split('\n').filter((l) => l.trim()).length,
        clipped: r.bottom > vh + 1 || r.right > vw + 1 || r.left < -1 || r.top < -1,
      }
    })
    const overlaps = []
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
        const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        if (w > 4 && h > 4) overlaps.push(`${a.name} x ${b.name} (${w}x${h}px)`)
      }
    }
    const totalLines = document.body.innerText.split('\n').filter((l) => l.trim()).length
    return { viewport: `${vw}x${vh}`, totalLines, boxes, overlaps }
  })

const results = []
const capture = async (state) => {
  for (const [w, h] of SIZES) {
    await page.setViewport({ width: w, height: h })
    await sleep(1500)
    const m = await measure()
    const file = `${state}-${w}x${h}.png`
    await page.screenshot({ path: `${OUT}/${file}` })
    results.push({ state, ...m, file })
  }
}

await sleep(2500)
await clickText('NEW GAME')
await sleep(2000)
await clickText('REPORT TO THE DRYDOCK')
await sleep(4000)
await clickText('SKIP TUTORIAL')
await sleep(1000)

await capture('build')
await clickText('CONTRACTS')
await sleep(1500)
await capture('build+contracts')
await clickText('CLOSE')
await sleep(500)
await clickText('DRYDOCK TRADE')
await sleep(1500)
await capture('build+trade')
await clickText('CLOSE')
await sleep(500)

await page.setViewport({ width: 1920, height: 1080 })
await clickText('UNDOCK [E]')
await waitFor(async () => (await text()).includes('Undocked'))
await sleep(2000)
await capture('flight')
await clickText('TRADE RELAY')
await sleep(1500)
await capture('flight+trade')
await clickText('CLOSE')

fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2))
await browser.close()
for (const r of results) {
  console.log(`${r.state.padEnd(16)} ${r.viewport.padEnd(10)} lines=${String(r.totalLines).padStart(3)} panels=${r.boxes.length} overlaps=${r.overlaps.length}${r.boxes.some((b) => b.clipped) ? ' CLIPPED' : ''}`)
}
console.log('errors:', errors.slice(0, 3))
