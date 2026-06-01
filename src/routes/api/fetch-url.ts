import { createFileRoute } from '@tanstack/react-router'
import { LIMITS } from '~/config'
import { indexUrl, IndexUrlError } from '~/lib/indexUrl'
import { checkRateLimit } from '~/lib/redis'

export const Route = createFileRoute('/api/fetch-url')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = request.headers.get('x-forwarded-for') || 'unknown'
        const rateLimit = await checkRateLimit(`fetch:${ip}`)
        if (!rateLimit.allowed) {
          return Response.json(
            { success: false, error: 'Terlalu banyak request. Coba lagi dalam 1 menit.' },
            { status: 429 },
          )
        }

        let url: string
        try {
          const body = await request.json()
          url = body.url
        } catch {
          return Response.json(
            { success: false, error: 'Request body tidak valid' },
            { status: 400 },
          )
        }

        const validationError = validateUrl(url)
        if (validationError) {
          return Response.json(
            { success: false, error: validationError },
            { status: 400 },
          )
        }

        try {
          const result = await indexUrl(url)
          return Response.json({
            success: true,
            title: result.title,
            source_name: result.url,
            chunks_count: result.chunksCount,
            cached: result.cached,
          })
        } catch (err) {
          if (err instanceof IndexUrlError) {
            return Response.json(
              { success: false, error: err.message },
              { status: err.status },
            )
          }
          console.error('fetch-url unexpected error:', err)
          return Response.json(
            { success: false, error: 'Gagal memproses URL' },
            { status: 502 },
          )
        }
      },
    },
  },
})

function validateUrl(url: unknown): string | null {
  if (!url || typeof url !== 'string') return 'URL harus diisi'
  if (url.length > LIMITS.URL_MAX_LENGTH) {
    return `URL terlalu panjang (max ${LIMITS.URL_MAX_LENGTH} chars)`
  }
  try {
    new URL(url)
  } catch {
    return 'URL tidak valid'
  }
  return null
}
