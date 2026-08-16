import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'

const pluginPath = new URL('../desktop/plugin.js', import.meta.url)
let source = await fs.readFile(pluginPath, 'utf8')
source = source
  .replace(
    "import { host, KANBAN_TASK_ACTIONS_AREA } from '@hermes/plugin-sdk'",
    'const { host, KANBAN_TASK_ACTIONS_AREA } = globalThis.__sdk'
  )
  .replace('export default plugin', 'globalThis.__plugin = plugin')

const calls = []
let sequence = 0
let failNextResume = false
let packet = {
  context: { board: 'default', task: { id: 't_123', title: 'Test task' } },
  fingerprint: 'fp-1',
  message: 'opening context',
  refresh_message: 'refreshed context'
}

const host = {
  state: { profile: { get: () => 'exacticlam' } },
  async request(method, params) {
    calls.push({ method, params })
    if (method === 'session.create') {
      sequence += 1
      return { session_id: `runtime-${sequence}`, stored_session_id: `stored-${sequence}` }
    }
    if (method === 'session.resume') {
      if (failNextResume) {
        failNextResume = false
        throw new Error('4007 session not found')
      }
      return { session_id: `resumed-${sequence}` }
    }
    return { status: 'ok' }
  },
  async openSession(sessionId, options) {
    calls.push({ method: 'host.openSession', params: { sessionId, options } })
  }
}

const storage = new Map()
const contributions = []
const ctx = {
  register(contribution) {
    contributions.push(contribution)
  },
  async rest() {
    return packet
  },
  storage: {
    get(key, fallback) {
      return storage.has(key) ? storage.get(key) : fallback
    },
    remove(key) {
      storage.delete(key)
    },
    set(key, value) {
      storage.set(key, value)
    }
  }
}

const sandbox = {
  __sdk: { host, KANBAN_TASK_ACTIONS_AREA: 'kanban.task.actions' },
  console,
  encodeURIComponent,
  Error,
  globalThis: null
}
sandbox.globalThis = sandbox
vm.runInNewContext(source, sandbox, { filename: pluginPath.pathname })
sandbox.__plugin.register(ctx)

assert.equal(contributions.length, 2)
const open = contributions.find(item => item.id === 'open-discussion').data
const fresh = contributions.find(item => item.id === 'new-discussion').data
const context = {
  board: 'default',
  location: 'card',
  task: { id: 't_123', title: 'Test task', status: 'triage' }
}

await open.run(context)
assert.equal(calls.filter(call => call.method === 'session.create').length, 1)
assert.equal(calls.filter(call => call.method === 'prompt.submit').length, 1)
assert.equal(storage.size, 1)

await open.run(context)
assert.equal(calls.filter(call => call.method === 'session.resume').length, 1)
assert.equal(calls.filter(call => call.method === 'prompt.submit').length, 1)

packet = { ...packet, fingerprint: 'fp-2' }
await open.run(context)
assert.equal(calls.filter(call => call.method === 'prompt.submit').length, 2)
assert.equal(calls.findLast(call => call.method === 'prompt.submit').params.text, 'refreshed context')

failNextResume = true
await open.run(context)
assert.equal(calls.filter(call => call.method === 'session.create').length, 2)
assert.equal(calls.filter(call => call.method === 'prompt.submit').length, 3)

await fresh.run({ ...context, location: 'context-menu' })
assert.equal(calls.filter(call => call.method === 'session.create').length, 3)
assert.equal(calls.filter(call => call.method === 'prompt.submit').length, 4)
assert.deepEqual(Array.from(open.locations), ['card', 'context-menu', 'drawer-menu'])
assert.deepEqual(Array.from(fresh.locations), ['context-menu', 'drawer-menu'])

console.log(
  JSON.stringify({
    status: 'PASS',
    create: 3,
    resume: 3,
    refresh: 1,
    deleted_session_replaced: true,
    fresh_discussion: true
  })
)
