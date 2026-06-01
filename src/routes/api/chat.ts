import { createFileRoute } from '@tanstack/react-router'
import { LIMITS } from '~/config'
import { ragQuery } from '~/lib/chain'
import { checkRateLimit } from '~/lib/redis'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = request.headers.get('x-forwarded-for') || 'unknown'
        const rateLimit = await checkRateLimit(`chat:${ip}`)
        if (!rateLimit.allowed) {
          return Response.json(
            { success: false, error: 'Terlalu banyak request. Coba lagi dalam 1 menit.' },
            { status: 429 },
          )
        }

        let message: string
        try {
          const body = await request.json()
          message = body.message
        } catch {
          return Response.json(
            { success: false, error: 'Request body tidak valid' },
            { status: 400 },
          )
        }

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
          return Response.json(
            { success: false, error: 'Pesan harus diisi' },
            { status: 400 },
          )
        }

        if (message.length > LIMITS.MESSAGE_MAX_LENGTH) {
          return Response.json(
            { success: false, error: `Pesan terlalu panjang (max ${LIMITS.MESSAGE_MAX_LENGTH / 1000}KB)` },
            { status: 400 },
          )
        }

        const encoder = new TextEncoder()
        let aborted = false

        const stream = new ReadableStream({
          async start(controller) {
            try {
              const { stream: chatStream, sources } = await ragQuery(message.trim())

              for await (const chunk of chatStream) {
                // Stop streaming if client disconnected
                if (aborted || request.signal?.aborted) break

                const delta = chunk.choices[0]?.delta?.content
                if (delta) {
                  controller.enqueue(
                    encoder.encode(`event: token\ndata: ${JSON.stringify({ content: delta })}\n\n`),
                  )
                }
              }

              if (!aborted) {
                const sourcesData = sources.map((s) => ({
                  source_name: s.sourceName,
                  title: s.title,
                  similarity: s.similarity,
                }))
                controller.enqueue(
                  encoder.encode(`event: sources\ndata: ${JSON.stringify({ sources: sourcesData })}\n\n`),
                )
                controller.enqueue(
                  encoder.encode(`event: done\ndata: ${JSON.stringify({ success: true })}\n\n`),
                )
              }
            } catch (err: any) {
              if (!aborted) {
                controller.enqueue(
                  encoder.encode(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`),
                )
              }
            } finally {
              controller.close()
            }
          },

          // Client disconnected: stop pulling tokens from upstream
          cancel() {
            aborted = true
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        })
      },
    },
  },
})
