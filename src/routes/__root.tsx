import { Outlet, createRootRoute, HeadContent, Scripts } from '@tanstack/react-router'
import appCss from '../styles/globals.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'IIR Agent — Web Fetch RAG Chatbot' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'preconnect',
        href: 'https://fonts.googleapis.com',
      },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      // Preload the fonts CSS so it parallelizes with main JS download.
      // We only need: Cormorant 400 (display), Inter 400/500/600 (body), JetBrains 400 (code).
      {
        rel: 'preload',
        as: 'style',
        href: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400&display=swap',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400&display=swap',
      },
    ],
  }),
  component: RootLayout,
  notFoundComponent: NotFoundPage,
})

function NotFoundPage() {
  return (
    <div style={{ padding: '64px 24px', textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 48, fontWeight: 400, marginBottom: 12 }}>
        Halaman tidak ditemukan
      </h1>
      <p style={{ color: '#6c6a64' }}>
        URL yang kamu tuju tidak terdaftar di IIR Agent.{' '}
        <a href="/" style={{ color: '#cc785c' }}>Kembali ke beranda</a>
      </p>
    </div>
  )
}

function RootLayout() {
  return (
    <html lang="id">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
