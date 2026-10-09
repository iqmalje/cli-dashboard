import type { Task, TaskStatus } from '../types'

// Ported from comet's hooks/lib.ts, with task timers added.
export type TaskCall = {
  readonly tool: string
  readonly agentId?: string
  readonly taskId?: string
  readonly status?: string
  readonly subject?: string
}

type CreateResult = { readonly task: { readonly id: string; readonly subject: string } }
type UpdateResult = { readonly success?: boolean }
type TodoResult = { readonly newTodos: readonly { readonly content: string; readonly status: TaskStatus }[] }

const STATUSES: readonly string[] = ['pending', 'in_progress', 'completed']
const isStatus = (s: string | undefined): s is TaskStatus => s !== undefined && STATUSES.includes(s)

const stamp = (t: Task, status: TaskStatus, now: number): Task => ({
  ...t,
  status,
  ...(status === 'in_progress' && t.startedAt === undefined ? { startedAt: now } : {}),
  ...(status === 'completed' ? { endedAt: now } : {}),
})

export const allDone = (tasks: readonly Task[]) => tasks.length > 0 && tasks.every(t => t.status === 'completed')

export const active = (tasks: readonly Task[]) =>
  tasks.find(t => t.status === 'in_progress') ?? tasks.find(t => t.status === 'pending')

export const applyToolCall = (tasks: readonly Task[], call: TaskCall, result: unknown, now: number): readonly Task[] => {
  if (call.agentId) return tasks
  switch (call.tool) {
    case 'TaskCreate': {
      const { task } = result as CreateResult
      return [...(allDone(tasks) ? [] : tasks), { id: task.id, subject: task.subject, status: 'pending' }]
    }
    case 'TaskUpdate': {
      if ((result as UpdateResult).success === false) return tasks
      if (call.status === 'deleted') return tasks.filter(t => t.id !== call.taskId)
      const status = call.status
      return tasks.map(t => {
        if (t.id !== call.taskId) return t
        const named = call.subject !== undefined ? { ...t, subject: call.subject } : t
        return isStatus(status) ? stamp(named, status, now) : named
      })
    }
    case 'TodoWrite':
      return (result as TodoResult).newTodos.map((t, i) => stamp({ id: String(i), subject: t.content, status: 'pending' }, t.status, now))
    default:
      return tasks
  }
}
