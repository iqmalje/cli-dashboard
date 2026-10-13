import type { AgentRow, Task } from '../types'

export const MIN = 60_000

// Sample Activity Sections, relative to `now`: the setup preview and the README renders share them.
export const sampleAgents = (now: number): AgentRow[] => [
  { id: 'a1', name: 'general-purpose', model: 'claude-opus-5-5', effort: 'medium', description: 'Final review: webhook retry plan', startedAt: now - 4.6 * MIN, tokens: 3_900_000 },
  { id: 'a2', name: 'Explore', model: 'claude-sonnet-5-5', effort: 'low', description: 'Find every caller of signPayload', startedAt: now - 1.2 * MIN, tokens: 410_000 },
  { id: 'a3', name: 'general-purpose', model: 'claude-opus-5-5', effort: 'medium', description: 'Review Task A6', startedAt: now - 6 * MIN, endedAt: now - 3.8 * MIN, tokens: 1_600_000 },
]

export const sampleTasks = (now: number): Task[] => [
  { id: '1', subject: 'Add retry backoff to the webhook sender', status: 'completed', startedAt: now - 40 * MIN, endedAt: now - 25 * MIN },
  { id: '2', subject: 'Cover the backoff with tests', status: 'completed', startedAt: now - 25 * MIN, endedAt: now - 12 * MIN },
  { id: '3', subject: 'Final whole-branch review', status: 'in_progress', startedAt: now - 5 * MIN },
  { id: '4', subject: 'Open the pull request', status: 'pending' },
]
