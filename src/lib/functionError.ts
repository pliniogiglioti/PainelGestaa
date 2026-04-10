export async function getFunctionErrorMessage(
  error: unknown,
  fallback = 'Erro ao executar operacao.',
) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const context = (error as { context?: unknown } | null)?.context

  if (context instanceof Response) {
    try {
      const body = await context.clone().json()
      const detail = body?.error ?? body?.message
      if (detail) return String(detail)
    } catch {
      try {
        const text = await context.clone().text()
        if (text.trim()) return text.trim()
      } catch {
        // Mantem o fallback abaixo quando o corpo nao puder ser lido.
      }
    }
  }

  return message || fallback
}
