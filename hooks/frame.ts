import { flow, oklch, pastel } from './color'
import { width } from './format'

export type Part = {
  text: string
  color?: string
  dim?: boolean
  bold?: boolean
  // share of the cell's slack; the part is drawn as `text` repeated to that length
  grow?: number
  // a gradient across a grow part, flowing with the frame
  hues?: readonly [number, number]
}
export type Cell = { parts: readonly Part[] }
export type Section = { rows: readonly (readonly Cell[])[]; flex: number; press?: string }
export type Seg = { text: string; color?: string; dim?: boolean; bold?: boolean }
export type Line = { segs: readonly Seg[]; press?: string }
export type Drop = 'dirShort' | 'sevenDay' | 'sessionName' | 'dirty' | 'cache'

export const DROP_ORDER: readonly Drop[] = ['dirShort', 'sevenDay', 'sessionName', 'dirty', 'cache']
export const BORDER = oklch(0.6, 0.05, 280)
const MIN_CELL = 4

export const cellWidth = (c: Cell) => c.parts.reduce((n, p) => n + (p.grow === undefined ? width(p.text) : 0), 0) + 2

export const rowWidth = (cells: readonly Cell[]) => cells.reduce((n, c) => n + cellWidth(c), 0) + cells.length + 1

export const planDrops = (need: (drops: ReadonlySet<Drop>) => number, avail: number) => {
  const drops = new Set<Drop>()
  for (const d of DROP_ORDER) {
    if (need(drops) <= avail) break
    drops.add(d)
  }
  // a later drop may free more room than an earlier one needed: take back what still fits
  for (const d of [...drops].reverse()) {
    drops.delete(d)
    if (need(drops) > avail) drops.add(d)
  }
  return new Set(DROP_ORDER.filter(d => drops.has(d)))
}

// Column widths for a section: the widest row per column; the slack goes to the flex column.
const fit = (s: Section, W: number) => {
  const n = s.rows[0]?.length ?? 0
  const w = Array.from({ length: n }, (_, c) => Math.max(...s.rows.map(r => (r[c] ? cellWidth(r[c]) : 2))))
  const slack = W - 2 - (n - 1) - w.reduce((a, b) => a + b, 0)
  const fw = w[s.flex]
  if (slack > 0 && fw !== undefined) w[s.flex] = fw + slack
  // too wide: take one cell at a time from the widest column; cellSegs cuts its text with …
  for (let over = -slack; over > 0; over--) {
    const max = Math.max(...w)
    if (max <= MIN_CELL) break
    w[w.indexOf(max)] = max - 1
  }
  return w
}

const joints = (w: readonly number[]) => {
  const set = new Set<number>()
  let x = 0
  for (const cw of w.slice(0, -1)) {
    x += cw
    set.add(x)
    x += 1
  }
  return set
}

const rule = (l: string, r: string, up: ReadonlySet<number>, down: ReadonlySet<number>, W: number) => {
  let s = l
  for (let x = 0; x < W - 2; x++) s += up.has(x) && down.has(x) ? '┼' : up.has(x) ? '┴' : down.has(x) ? '┬' : '─'
  return s + r
}

// Cut the widest text parts with … until the cell fits its column.
const squeeze = (c: Cell, w: number): Cell => {
  const parts = [...c.parts]
  for (let over = cellWidth(c) - w; over > 0; ) {
    const sized = parts.map((p, i) => ({ i, n: p.grow === undefined ? width(p.text) : 0 }))
    const top = sized.reduce((a, b) => (b.n > a.n ? b : a))
    const p = parts[top.i]
    if (!p || top.n <= 1) break
    const keep = Math.max(0, top.n - over - 1)
    parts[top.i] = { ...p, text: `${[...p.text].slice(0, keep).join('')}…` }
    over -= top.n - keep - 1
  }
  return { parts }
}

const cellSegs = (cell: Cell, w: number, f: number): Seg[] => {
  const c = squeeze(cell, w)
  const slack = Math.max(0, w - cellWidth(c))
  const weight = c.parts.reduce((n, p) => n + (p.grow ?? 0), 0)
  const growers = c.parts.filter(p => p.grow !== undefined)
  let left = slack
  const segs: Seg[] = [{ text: ' ' }]
  for (const p of c.parts) {
    if (p.grow === undefined) {
      segs.push({ text: p.text, color: p.color, dim: p.dim, bold: p.bold })
      continue
    }
    const n = weight === 0 ? 0 : p === growers[growers.length - 1] ? left : Math.round((slack * p.grow) / weight)
    left -= n
    if (!p.hues) {
      segs.push({ text: p.text.repeat(n), color: p.color, dim: p.dim })
      continue
    }
    const [a, b] = p.hues
    for (let k = 0; k < n; k++) segs.push({ text: p.text, color: pastel(a + (b - a) * flow(k, n, f)) })
  }
  segs.push({ text: ' '.repeat(weight === 0 ? slack + 1 : 1) })
  return segs
}

export const draw = (sections: readonly Section[], W: number, f: number, caption?: { text: string; press: string }) => {
  const lines: Line[] = []
  const none = new Set<number>()
  let up: ReadonlySet<number> = none
  sections.forEach((s, i) => {
    const w = fit(s, W)
    const down = joints(w)
    lines.push({ segs: [{ text: rule(i === 0 ? '╭' : '├', i === 0 ? '╮' : '┤', up, down, W), color: BORDER }] })
    for (const row of s.rows) {
      const segs: Seg[] = [{ text: '│', color: BORDER }]
      row.forEach((c, k) => segs.push(...cellSegs(c, w[k] ?? cellWidth(c), f), { text: '│', color: BORDER }))
      lines.push({ segs, press: s.press })
    }
    up = down
  })
  const bottom = rule('╰', '╯', up, none, W)
  if (!caption) {
    lines.push({ segs: [{ text: bottom, color: BORDER }] })
    return lines
  }
  const chars = [...bottom]
  const cap = [...caption.text]
  const at = Math.max(1, W - 2 - cap.length)
  lines.push({
    press: caption.press,
    segs: [
      { text: chars.slice(0, at).join(''), color: BORDER },
      { text: caption.text, dim: true },
      { text: chars.slice(at + cap.length).join(''), color: BORDER },
    ],
  })
  return lines
}
