/** Get hostname dari URL, strip "www." prefix. Fallback ke string asli. */
export function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Build favicon URL dari Google's S2 service. Bekerja untuk semua domain publik. */
export function getFaviconUrl(url: string, size = 32): string {
  const host = getHostname(url)
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`
}
