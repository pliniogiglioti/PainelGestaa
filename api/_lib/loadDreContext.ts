import { promises as fs } from 'node:fs'
import * as path from 'node:path'

type DreContextResult = {
  context: string
  source: 'contexto_ia_dre.md' | 'fallback'
  truncated: boolean
}

const CACHE_TTL_MS = 5 * 60 * 1000
const MAX_CONTEXT_CHARS = 50_000

const IA_DIR = path.join(process.cwd(), 'public', 'ia')
const CONTEXTO_FILE = path.join(IA_DIR, 'contexto_ia_dre.md')
const PLANO_FILE = path.join(IA_DIR, 'plano_de_contas_dre.md')
const AULAS_FILE = path.join(IA_DIR, 'aulas_gestao_financeira.md')

let cache: { value: DreContextResult; expiresAt: number } | null = null

const extractSection = (markdown: string, title: string) => {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(^|\\n)#{1,6}\\s+${escaped}\\b[\\s\\S]*?(?=\\n#{1,6}\\s+|$)`, 'i')
  return markdown.match(regex)?.[0]?.trim() ?? ''
}

const keepEssentialSections = (markdown: string): string => {
  const links = extractSection(markdown, 'Links rápidos')
  const plano = extractSection(markdown, 'Plano de contas')

  const compactTranscricoes = markdown
    .split(/\n#{1,6}\s+/)
    .filter(block => /transcri/i.test(block))
    .map(block => block.slice(0, 2_500))
    .join('\n\n')

  const blocks = [
    '# Contexto DRE (resumido automaticamente)',
    links || '## Links rápidos\nSem seção dedicada no arquivo de contexto.',
    plano || '## Plano de contas\nSem seção dedicada no arquivo de contexto.',
    compactTranscricoes ? `## Transcrições (resumo)\n${compactTranscricoes}` : '',
  ]

  return blocks.filter(Boolean).join('\n\n').slice(0, MAX_CONTEXT_CHARS)
}

const readContextFromDisk = async (): Promise<DreContextResult> => {
  try {
    const content = await fs.readFile(CONTEXTO_FILE, 'utf-8')
    if (content.length <= MAX_CONTEXT_CHARS) {
      return { context: content, source: 'contexto_ia_dre.md', truncated: false }
    }

    return {
      context: keepEssentialSections(content),
      source: 'contexto_ia_dre.md',
      truncated: true,
    }
  } catch {
    const [plano, aulas] = await Promise.all([
      fs.readFile(PLANO_FILE, 'utf-8'),
      fs.readFile(AULAS_FILE, 'utf-8'),
    ])

    const merged = `# Plano de contas\n\n${plano}\n\n# Aulas e transcrições\n\n${aulas}`

    if (merged.length <= MAX_CONTEXT_CHARS) {
      return { context: merged, source: 'fallback', truncated: false }
    }

    return { context: keepEssentialSections(merged), source: 'fallback', truncated: true }
  }
}

export async function loadDreContext(): Promise<DreContextResult> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.value
  }

  const value = await readContextFromDisk()
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS }

  return value
}
