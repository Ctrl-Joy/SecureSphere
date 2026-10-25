import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * Procedural "signal field": red vertical traces, dot-matrix blocks, scan lines and
 * glyph streams. Pure canvas, no assets. Honors prefers-reduced-motion (renders one frame).
 */

type Trace = { x: number; y: number; len: number; speed: number; alpha: number; dashed: boolean; w: number }
type Block = { x: number; y: number; w: number; h: number; speed: number; alpha: number; density: number; seed: number; white: boolean }
type Scan = { y: number; x: number; w: number; life: number; max: number; thick: number }
type Glyphs = { x: number; y: number; text: string; vertical: boolean; speed: number; alpha: number }

const CHARS = '0123456789ABCDEF#%$@&*<>/'

const rand = (a: number, b: number) => a + Math.random() * (b - a)
/** Biased towards the right edge, like the reference composition. */
const rightBiased = (w: number) => w * (1 - Math.pow(Math.random(), 1.7) * 0.92)
const randomText = (n: number) => Array.from({ length: n }, () => CHARS[(Math.random() * CHARS.length) | 0]).join('')

function hash(n: number) {
  const x = Math.sin(n) * 43758.5453
  return x - Math.floor(x)
}

export function DataStream({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let w = 0
    let h = 0
    let traces: Trace[] = []
    let blocks: Block[] = []
    let scans: Scan[] = []
    let glyphs: Glyphs[] = []
    let raf = 0
    let last = performance.now()
    let tick = 0

    const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e3261c'
    const fg = () => getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#f5f5f4'
    let red = accent()
    let white = fg()

    const makeTrace = (y?: number): Trace => ({
      x: Math.round(rightBiased(w)),
      y: y ?? rand(-h, h),
      len: Math.random() < 0.15 ? rand(220, 520) : rand(12, 160),
      speed: rand(8, 46),
      alpha: rand(0.45, 1),
      dashed: Math.random() < 0.35,
      w: Math.random() < 0.18 ? 2 : 1,
    })
    const makeBlock = (y?: number): Block => ({
      x: Math.round(rightBiased(w) - 40),
      y: y ?? rand(-h * 0.3, h),
      w: Math.round(rand(16, 84) / 3) * 3,
      h: Math.round(rand(9, 70) / 3) * 3,
      speed: rand(4, 18),
      alpha: rand(0.45, 0.95),
      density: rand(0.25, 0.75),
      seed: Math.random() * 1000,
      white: Math.random() < 0.12,
    })
    const makeScan = (): Scan => {
      const x = rand(w * 0.05, w * 0.6)
      return { y: rand(0, h), x, w: rand(w * 0.2, w - x), life: 0, max: rand(1.2, 4), thick: Math.random() < 0.5 ? 2 : 1 }
    }
    const makeGlyphs = (y?: number): Glyphs => {
      const vertical = Math.random() < 0.8
      return {
        x: Math.round(vertical ? rand(w * 0.55, w - 8) : rand(w * 0.45, w * 0.8)),
        y: y ?? rand(0, h),
        text: randomText(vertical ? rand(6, 16) | 0 : rand(10, 22) | 0),
        vertical,
        speed: vertical ? rand(6, 22) : 0,
        alpha: rand(0.45, 0.9),
      }
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      w = rect.width
      h = rect.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const area = (w * h) / 10000
      traces = Array.from({ length: Math.round(area * 3) }, () => makeTrace())
      blocks = Array.from({ length: Math.round(area * 0.32) }, () => makeBlock())
      scans = Array.from({ length: 4 }, makeScan)
      glyphs = Array.from({ length: Math.round(area * 0.07) + 3 }, () => makeGlyphs())
      red = accent()
      white = fg()
    }

    const draw = (dt: number) => {
      tick += dt
      ctx.clearRect(0, 0, w, h)

      // Faint structural grid lines
      ctx.globalAlpha = 0.12
      ctx.fillStyle = red
      for (let i = 0; i < 7; i++) {
        const x = Math.round(w * (0.3 + hash(i * 3.1) * 0.7))
        ctx.fillRect(x, 0, 1, h)
      }

      for (const t of traces) {
        t.y += t.speed * dt
        if (t.y > h + 20) Object.assign(t, makeTrace(-t.len - rand(0, 200)))
        ctx.globalAlpha = t.alpha * (0.75 + 0.25 * Math.sin(tick * 3 + t.x))
        ctx.fillStyle = red
        if (t.dashed) {
          for (let yy = 0; yy < t.len; yy += 5) ctx.fillRect(t.x, t.y + yy, t.w, 3)
        } else {
          ctx.fillRect(t.x, t.y, t.w, t.len)
        }
      }

      const flicker = Math.floor(tick * 6)
      for (const b of blocks) {
        b.y += b.speed * dt
        if (b.y > h + 10) Object.assign(b, makeBlock(-b.h - rand(0, 120)))
        ctx.fillStyle = b.white ? white : red
        const cols = b.w / 3
        const rows = b.h / 3
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const v = hash(b.seed + r * 31.7 + c * 7.3 + (hash(r + b.seed) > 0.85 ? flicker : 0))
            if (v < b.density) {
              ctx.globalAlpha = b.alpha * (0.4 + v)
              ctx.fillRect(b.x + c * 3, b.y + r * 3, 2, 2)
            }
          }
        }
      }

      for (const s of scans) {
        s.life += dt
        if (s.life > s.max) Object.assign(s, makeScan())
        const p = s.life / s.max
        ctx.globalAlpha = Math.sin(p * Math.PI) * 0.95
        ctx.fillStyle = red
        ctx.fillRect(s.x, Math.round(s.y), s.w * Math.min(1, p * 3), s.thick)
      }

      ctx.font = '500 9px "JetBrains Mono", ui-monospace, monospace'
      ctx.textBaseline = 'top'
      for (const g of glyphs) {
        g.y += g.speed * dt
        if (g.y > h + 10) Object.assign(g, makeGlyphs(-160))
        if (Math.random() < 0.02) {
          const i = (Math.random() * g.text.length) | 0
          g.text = g.text.slice(0, i) + CHARS[(Math.random() * CHARS.length) | 0] + g.text.slice(i + 1)
        }
        ctx.globalAlpha = g.alpha
        ctx.fillStyle = white
        if (g.vertical) {
          for (let i = 0; i < g.text.length; i++) ctx.fillText(g.text[i], g.x, g.y + i * 11)
        } else {
          ctx.fillText(g.text.split('').join(' '), g.x, g.y)
        }
      }
      ctx.globalAlpha = 1
    }

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      draw(dt)
      raf = requestAnimationFrame(loop)
    }

    const ro = new ResizeObserver(() => {
      resize()
      if (reduced) draw(0)
    })
    ro.observe(canvas)
    resize()
    if (reduced) {
      draw(0)
    } else {
      raf = requestAnimationFrame(loop)
    }

    const themeObserver = new MutationObserver(() => {
      red = accent()
      white = fg()
      if (reduced) draw(0)
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    const onVisibility = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden && !reduced) {
        last = performance.now()
        raf = requestAnimationFrame(loop)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      themeObserver.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden className={cn('pointer-events-none block h-full w-full', className)} />
}
