import { createFileRoute } from '@tanstack/react-router'
import { LIMITS } from '~/config'
import { getSql } from '~/lib/db/client'

export const Route = createFileRoute('/api/sessions/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const sql = getSql()
        const { id } = params

        const [session] = await sql`
          SELECT id, title, created_at, updated_at
          FROM chat_sessions WHERE id = ${id}
        `
        if (!session) {
          return Response.json({ error: 'Session tidak ditemukan' }, { status: 404 })
        }

        const messages = await sql`
          SELECT id, role, content, sources, created_at
          FROM chat_messages WHERE session_id = ${id}
          ORDER BY created_at ASC
        `

        // postgres.js returns JSONB columns as already-parsed objects in recent
        // versions, but some drivers still return strings — normalize defensively.
        const parsed = messages.map((m: any) => ({
          ...m,
          sources: typeof m.sources === 'string' ? JSON.parse(m.sources) : (m.sources || []),
        }))

        return Response.json({ session, messages: parsed })
      },

      PATCH: async ({ params, request }) => {
        const sql = getSql()
        const { id } = params

        const [existing] = await sql`SELECT id FROM chat_sessions WHERE id = ${id}`
        if (!existing) {
          return Response.json({ error: 'Session tidak ditemukan' }, { status: 404 })
        }

        const body = await request.json()
        if (body.title && typeof body.title === 'string') {
          await sql`
            UPDATE chat_sessions
            SET title = ${body.title.slice(0, LIMITS.SESSION_TITLE_MAX)}, updated_at = now()
            WHERE id = ${id}
          `
        }
        return Response.json({ success: true })
      },

      DELETE: async ({ params }) => {
        const sql = getSql()
        const { id } = params

        const [existing] = await sql`SELECT id FROM chat_sessions WHERE id = ${id}`
        if (!existing) {
          return Response.json({ error: 'Session tidak ditemukan' }, { status: 404 })
        }

        await sql`DELETE FROM chat_sessions WHERE id = ${id}`
        return Response.json({ success: true })
      },
    },
  },
})
