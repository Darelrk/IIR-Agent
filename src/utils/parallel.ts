/**
 * Like Promise.all + Array.map, but with a concurrency limit.
 *
 * Useful for bursty third-party APIs (NVIDIA embed, Tavily) where firing all
 * requests at once risks rate-limit hits, but full sequential is too slow.
 *
 * Preserves output order matching input order.
 */
export async function parallelMap<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const limit = Math.max(1, Math.min(concurrency, items.length))
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (true) {
      const i = nextIndex++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()))
  return results
}
