import { createFileRoute } from '@tanstack/react-router'
import { WEB_SEARCH } from '~/config'
import { indexUrl, IndexUrlError } from '~/lib/indexUrl'
import { checkRateLimit } from '~/lib/redis'
import { searchWeb } from '~/lib/tavily'

export const Route = createFileRoute('/api/web-search')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = request.headers.get('x-forwarded-for') || 'unknown'
        const rateLimit = await checkRateLimit(`search:${ip}`)
        if (!rateLimit.allowed) {
          return Response.json(
            { success: false, error: 'Terlalu banyak request. Coba lagi dalam 1 menit.' },
            { status: 429 },
          )
        }

        let query: string
        try {
          const body = await request.json()
          query = body.query
        } catch {
          return Response.json(
            { success: false, error: 'Request body tidak valid' },
            { status: 400 },
          )
        }

        if (!query || typeof query !== 'string' || query.trim().length === 0) {
          return Response.json(
            { success: false, error: 'Query harus diisi' },
            { status: 400 },
          )
        }

        const trimmedQuery = query.trim()

        let searchResults
        try {
          searchResults = await searchWeb(trimmedQuery, WEB_SEARCH.TAVILY_MAX_RESULTS)
        } catch (err: any) {
          return Response.json(
            { success: false, error: `Web search gagal: ${err.message}` },
            { status: 502 },
          )
        }

        if (searchResults.length === 0) {
          return Response.json(
            { success: false, error: 'Tidak ada hasil ditemukan untuk query tersebut' },
            { status: 422 },
          )
        }

        const topResults = searchResults.slice(0, WEB_SEARCH.MAX_URLS)

        // Process URLs in parallel — each URL hits a different domain so no
        // contention, and Tavily/NVIDIA tolerate this concurrency level.
        const settled = await Promise.allSettled(
          topResults.map((sr) =>
            indexUrl(sr.url, {
              titleHint: sr.title,
              extraMetadata: { search_query: trimmedQuery },
            }),
          ),
        )

        const urlResults: { url: string; title: string; chunks_count: number }[] = []
        const errors: string[] = []

        for (let i = 0; i < settled.length; i++) {
          const outcome = settled[i]
          const sr = topResults[i]
          if (outcome.status === 'fulfilled') {
            const result = outcome.value
            urlResults.push({
              url: result.url,
              title: result.title,
              chunks_count: result.chunksCount,
            })
          } else {
            const err = outcome.reason
            const message = err instanceof IndexUrlError ? err.message : 'unknown error'
            errors.push(`${sr.url}: ${message}`)
          }
        }

        if (urlResults.length === 0) {
          return Response.json(
            { success: false, error: `Semua URL gagal diproses: ${errors.join('; ')}` },
            { status: 502 },
          )
        }

        const totalChunks = urlResults.reduce((sum, r) => sum + r.chunks_count, 0)

        return Response.json({
          success: true,
          query: trimmedQuery,
          urls: urlResults,
          total_chunks: totalChunks,
          errors: errors.length > 0 ? errors : undefined,
        })
      },
    },
  },
})
