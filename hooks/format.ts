import type { Git } from '../types'

// Display width in cells: code points, so a Nerd Font glyph outside the BMP counts once.
export const width = (s: string) => [...s].length

export const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)

export const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  if (h >= 24) return `${Math.floor(h / 24)}d`
  if (h >= 1) return `${h}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const fmtModel = (id: string) =>
  id
    .replace(/^claude-/, '')
    .replace(/\[.*\]$/, '')
    .replace(/-(\d+)-(\d+)(-.*)?$/, ' $1.$2')
    .replace(/-(\d+)$/, ' $1')

export const shortenHome = (path: string, home: string) =>
  path === home ? '~' : home !== '' && path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path

export const basename = (path: string) => path.split('/').filter(Boolean).pop() ?? path

// `git status --porcelain=v1 --branch`: the first line names the branch, each other line is one changed file.
export const parseGit = (exitCode: number, stdout: string): Git | null => {
  if (exitCode !== 0) return null
  const [head = '', ...files] = stdout.split('\n').filter(l => l !== '')
  const name = head.replace(/^## /, '').replace(/^No commits yet on /, '')
  const branch = name.startsWith('HEAD (') ? 'HEAD' : (name.split('...')[0] ?? name)
  return { branch, dirty: files.length }
}

// The main loop writes 1-hour cache (checked in this user's transcripts on 2026-10-09). Subagents write 5-minute cache, but this tracks the main loop only.
export const CACHE_TTL_MS = 60 * 60 * 1000

export const cacheLeft = (lastResponseAt: number | null, now: number) =>
  lastResponseAt === null ? null : Math.max(0, lastResponseAt + CACHE_TTL_MS - now)
