import { createFileRoute } from '@tanstack/react-router'
import { LIMITS } from '~/config'
import { getSql } from '~/lib/db/client'

const VALID_ROLES = ['user', 'assistant', 'system'] as const

export const Route = createFileRoute('/api/sessions/$id/messages')({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const sql = getSql()
        const { id } = params

        const [session] = await sql`SELECT id FROM chat_sessions WHERE id = ${id}`
        if (!session) {
          return Response.json({ error: 'Session tidak ditemukan' }, { status: 404 })
        }

        const body = await request.json()

        if (!body.role || !body.content) {
          return Response.json({ error: 'role dan content harus diisi' }, { status: 400 })
        }

        if (!VALID_ROLES.includes(body.role)) {
          return Response.json(
            { error: `role harus salah satu dari: ${VALID_ROLES.join(', ')}` },
            { status: 400 },
          )
        }

        if (typeof body.content !== 'string' || body.content.length > LIMITS.CONTENT_MAX_LENGTH) {
          return Response.json(
            { error: `content terlalu panjang (max ${LIMITS.CONTENT_MAX_LENGTH / 1000}KB)` },
            { status: 400 },
          )
        }

        const [message] = await sql`
          INSERT INTO chat_messages (session_id, role, content, sources)
          VALUES (
            ${id},
            ${body.role},
            ${body.content},
            ${JSON.stringify(body.sources || [])}::jsonb
          )
          RETURNING id, role, content, sources, created_at
        `

        await sql`UPDATE chat_sessions SET updated_at = now() WHERE id = ${id}`

        return Response.json(message)
      },
    },
  },
})
