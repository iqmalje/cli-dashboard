// OKLCH to sRGB hex, so every hue reads equally bright (from comet)
export const oklch = (L: number, C: number, h: number) => {
  const r = (h * Math.PI) / 180
  const a = C * Math.cos(r)
  const b = C * Math.sin(r)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const hex = (x: number) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
    return Math.round(255 * Math.min(1, Math.max(0, v))).toString(16).padStart(2, '0')
  }
  return `#${lin.map(hex).join('')}`
}

export const pastel = (h: number) => oklch(0.85, 0.07, h)

// Where cell k of n sits on the moving gradient at frame f: a triangle wave, 0..1..0.
export const flow = (k: number, n: number, f: number) => {
  const t = (((k / Math.max(1, n) - f * 0.025) % 1) + 1) % 1
  return 1 - Math.abs(2 * t - 1)
}
