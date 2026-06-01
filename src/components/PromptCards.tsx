interface Prompt {
  icon: React.ReactNode
  title: string
  body: string
  prompt: string
}

interface PromptCardsProps {
  onSelect: (prompt: string) => void
}

const PROMPTS: Prompt[] = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
    title: 'Cari di web',
    body: 'Tanya pertanyaan, sistem akan cari sumber relevan otomatis.',
    prompt: 'Apa kabar perkembangan AI minggu ini?',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
    title: 'Index dari URL',
    body: 'Paste URL artikel atau dokumen untuk diambil konten penuhnya.',
    prompt: 'https://en.wikipedia.org/wiki/Pancasila',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v18" />
        <path d="m6 9 6-6 6 6" />
        <path d="M3 12h18" />
      </svg>
    ),
    title: 'Eksplorasi topik',
    body: 'Mulai dari pertanyaan terbuka, dapat sumber terkurasi.',
    prompt: 'Bagaimana cara kerja vector database?',
  },
]

export function PromptCards({ onSelect }: PromptCardsProps) {
  return (
    <div className="prompt-cards-grid">
      {PROMPTS.map((p, i) => (
        <button
          key={i}
          className="prompt-card tactile-lift"
          onClick={() => onSelect(p.prompt)}
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="prompt-card-icon">{p.icon}</div>
          <div className="prompt-card-title">{p.title}</div>
          <div className="prompt-card-body">{p.body}</div>
          <div className="prompt-card-example">{p.prompt}</div>
        </button>
      ))}
    </div>
  )
}
