import { expect, test } from 'claude-code/testing'

import type { Task, TaskStatus } from '../types'
import { active, applyToolCall } from './tasks'

const list = (...s: TaskStatus[]): readonly Task[] => s.map((status, i) => ({ id: String(i + 1), subject: `T${i + 1}`, status }))

test('TaskCreate appends a pending task; a finished list starts over', () => {
  const r = { task: { id: '9', subject: 'New' } }
  expect(applyToolCall(list('pending'), { tool: 'TaskCreate' }, r, 0).map(t => t.id)).toEqual(['1', '9'])
  expect(applyToolCall(list('completed'), { tool: 'TaskCreate' }, r, 0).map(t => t.id)).toEqual(['9'])
})

// The active task's timer must start when work starts, not when the task was created.
test('TaskUpdate to in_progress stamps startedAt; to completed stamps endedAt', () => {
  const started = applyToolCall(list('pending'), { tool: 'TaskUpdate', taskId: '1', status: 'in_progress' }, { success: true }, 500)
  expect(started[0]?.startedAt).toBe(500)
  const done = applyToolCall(started, { tool: 'TaskUpdate', taskId: '1', status: 'completed' }, { success: true }, 900)
  expect(done[0]).toEqual({ id: '1', subject: 'T1', status: 'completed', startedAt: 500, endedAt: 900 })
})

test('a failed TaskUpdate and a subagent call change nothing', () => {
  const tasks = list('pending')
  expect(applyToolCall(tasks, { tool: 'TaskUpdate', taskId: '1', status: 'completed' }, { success: false }, 1)).toBe(tasks)
  expect(applyToolCall(tasks, { tool: 'TaskCreate', agentId: 'a1' }, { task: { id: '2', subject: 'x' } }, 1)).toBe(tasks)
})

test('deleted removes the task; TodoWrite replaces the list', () => {
  expect(applyToolCall(list('pending', 'pending'), { tool: 'TaskUpdate', taskId: '1', status: 'deleted' }, { success: true }, 0).map(t => t.id)).toEqual(['2'])
  const todo = { newTodos: [{ content: 'A', status: 'in_progress' }] }
  expect(applyToolCall(list('pending'), { tool: 'TodoWrite' }, todo, 7)).toEqual([{ id: '0', subject: 'A', status: 'in_progress', startedAt: 7 }])
})

test('active is the in-progress task, else the next pending one', () => {
  expect(active(list('completed', 'pending', 'in_progress'))?.id).toBe('3')
  expect(active(list('completed', 'pending'))?.id).toBe('2')
  expect(active(list('completed'))).toBe(undefined)
})
