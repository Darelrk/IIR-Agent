import { createFileRoute } from '@tanstack/react-router'
import { LIMITS } from '~/config'
import { getSql } from '~/lib/db/client'

export const Route = createFileRoute('/api/sessions')({
  server: {
    handlers: {
      GET: async () => {
        const sql = getSql()
        const sessions = await sql`
          SELECT id, title, created_at, updated_at
          FROM chat_sessions
          ORDER BY updated_at DESC
        `
        return Response.json({ sessions })
      },

      POST: async ({ request }) => {
        const sql = getSql()
        let title = 'New Chat'
        try {
          const body = await request.json()
          if (body.title && typeof body.title === 'string') {
            title = body.title.slice(0, LIMITS.SESSION_TITLE_MAX)
          }
        } catch {
          // empty body is allowed — title defaults to 'New Chat'
        }

        const [session] = await sql`
          INSERT INTO chat_sessions (title)
          VALUES (${title})
          RETURNING id, title, created_at, updated_at
        `
        return Response.json(session)
      },
    },
  },
})
