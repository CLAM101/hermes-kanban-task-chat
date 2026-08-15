import { host, KANBAN_TASK_ACTIONS_AREA } from '@hermes/plugin-sdk'

const ID = 'hermes-kanban-task-chat'

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function missingSession(error) {
  const text = String(error instanceof Error ? error.message : error).toLowerCase()
  return text.includes('session not found') || text.includes('4007')
}

function mappingKey(profile, board, taskId) {
  return `discussion:${profile}:${board}:${taskId}`
}

async function loadContext(ctx, context) {
  const taskId = encodeURIComponent(context.task.id)
  const board = encodeURIComponent(context.board)
  const packet = await ctx.rest(`/tasks/${taskId}/context?board=${board}`)

  if (!isObject(packet) || !isObject(packet.context) || typeof packet.fingerprint !== 'string') {
    throw new Error('Task context backend returned an invalid packet')
  }

  return packet
}

async function createDiscussion(ctx, context, packet, profile, key) {
  const titleText = String(context.task.title || context.task.id).trim()
  const title = `Task: ${titleText.length > 72 ? `${titleText.slice(0, 69)}…` : titleText}`
  const created = await host.request('session.create', {
    cols: 96,
    profile,
    source: 'desktop',
    title
  })

  if (!isObject(created) || typeof created.session_id !== 'string' || typeof created.stored_session_id !== 'string') {
    throw new Error('Hermes did not return a durable discussion session')
  }

  try {
    await host.request('prompt.submit', {
      session_id: created.session_id,
      text: packet.message
    })
  } catch (error) {
    await host.request('session.close', { session_id: created.session_id }).catch(() => undefined)
    throw error
  }

  const mapping = {
    board: context.board,
    fingerprint: packet.fingerprint,
    profile,
    storedSessionId: created.stored_session_id,
    taskId: context.task.id
  }
  ctx.storage.set(key, mapping)
  await host.openSession(created.stored_session_id, { intent: 'stack', profile })
}

async function resumeDiscussion(ctx, context, packet, profile, key, mapping) {
  let resumed

  try {
    resumed = await host.request('session.resume', {
      cols: 96,
      omit_messages: true,
      profile,
      session_id: mapping.storedSessionId
    })
  } catch (error) {
    if (!missingSession(error)) {
      throw error
    }

    ctx.storage.remove(key)
    await createDiscussion(ctx, context, packet, profile, key)
    return
  }

  if (!isObject(resumed) || typeof resumed.session_id !== 'string') {
    throw new Error('Hermes did not return a live discussion session')
  }

  if (mapping.fingerprint !== packet.fingerprint) {
    await host.request('prompt.submit', {
      session_id: resumed.session_id,
      text: packet.refresh_message
    })
    ctx.storage.set(key, { ...mapping, fingerprint: packet.fingerprint })
  }

  await host.openSession(mapping.storedSessionId, { intent: 'stack', profile })
}

async function openTaskDiscussion(ctx, context, { fresh = false } = {}) {
  const profile = String(host.state.profile.get() || 'default').trim() || 'default'
  const packet = await loadContext(ctx, context)
  const key = mappingKey(profile, context.board, context.task.id)
  const stored = ctx.storage.get(key, null)

  if (fresh || !isObject(stored) || typeof stored.storedSessionId !== 'string') {
    await createDiscussion(ctx, context, packet, profile, key)
    return
  }

  await resumeDiscussion(ctx, context, packet, profile, key, stored)
}

const plugin = {
  id: ID,
  name: 'Kanban task chat',
  description: 'Open or resume a context-rich operator discussion from a Kanban card.',
  defaultEnabled: false,
  register(ctx) {
    ctx.register({
      area: KANBAN_TASK_ACTIONS_AREA,
      id: 'open-discussion',
      order: 100,
      data: {
        codicon: 'comment-discussion',
        label: 'Discuss task',
        locations: ['card', 'context-menu', 'drawer-menu'],
        run: context => openTaskDiscussion(ctx, context)
      }
    })

    ctx.register({
      area: KANBAN_TASK_ACTIONS_AREA,
      id: 'new-discussion',
      order: 110,
      data: {
        codicon: 'add',
        label: 'Start new task discussion',
        locations: ['context-menu', 'drawer-menu'],
        run: context => openTaskDiscussion(ctx, context, { fresh: true })
      }
    })
  }
}

export default plugin
