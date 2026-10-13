export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type Task = {
  readonly id: string
  readonly subject: string
  readonly status: TaskStatus
  readonly startedAt?: number
  readonly endedAt?: number
}

export type AgentRow = {
  readonly id: string
  readonly name: string
  readonly model: string
  readonly effort?: string
  readonly description: string
  readonly startedAt: number
  readonly endedAt?: number
  readonly tokens?: number
  readonly runId?: string
}

export type Limit = { readonly percent: number; readonly resetsAt?: number }

export type Usage = {
  readonly contextTokens: number
  readonly window: number
  readonly fiveHour?: Limit
  readonly sevenDay?: Limit
}

// the setup wizard's draft and the saved picks (see hooks/look.ts CHOICES; the contract stays self-contained)
export type Picks = {
  readonly theme: 'pastel' | 'rainbow' | 'mono' | 'light' | 'high-contrast'
  readonly icons: 'nerd' | 'plain'
  readonly animation: 'full' | 'calm' | 'off'
  readonly speed: '1x' | '0.5x' | '2x'
}

export type Setup = { readonly step: number; readonly picks: Picks }

export type Git = { readonly branch: string; readonly dirty: number }

declare module 'claude-code' {
  interface PluginState {
    'cli-dashboard': {
      frame: number
      home: string
      configDir: string
      cwd: string
      usage: Usage | null
      model: string
      effort: string | null
      git: Git | null
      sessionName: string | null
      sessionTokens: number
      lastResponseAt: number | null
      tasks: readonly Task[]
      tasksOpen: boolean
      agents: readonly AgentRow[]
      agentScroll: number
      agentDir: string
      sessionId: string
      runs: Readonly<Record<string, string>>
      skills: readonly string[]
      plugins: readonly string[]
      showSkills: boolean
      setup: Setup | null
      chosen: Picks | null
      setupSeen: boolean
    }
  }
}
