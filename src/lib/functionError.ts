const ERROR_TRANSLATIONS: Array<[RegExp, string]> = [
  [/a user with this email address has already been registered/i, 'Já existe um usuário cadastrado com este e-mail.'],
  [/user already registered/i, 'Já existe um usuário cadastrado com este e-mail.'],
  [/email address.*already.*registered/i, 'Já existe um usuário cadastrado com este e-mail.'],
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'Confirme seu e-mail antes de entrar.'],
  [/signup.*disabled/i, 'Novos cadastros estão temporariamente desativados.'],
  [/(email|request).*rate limit/i, 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.'],
  [/password should be at least/i, 'A senha não possui o tamanho mínimo exigido.'],
  [/new password should be different/i, 'A nova senha deve ser diferente da senha atual.'],
  [/jwt expired|token.*expired|session.*expired/i, 'Sua sessão expirou. Entre novamente para continuar.'],
  [/failed to fetch|networkerror|network request failed/i, 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'],
  [/duplicate key|already exists|unique constraint/i, 'Este registro já existe.'],
  [/row-level security|violates row level security|permission denied/i, 'Você não tem permissão para realizar esta ação.'],
  [/database error saving new user/i, 'Não foi possível criar o usuário. Tente novamente.'],
  [/user not found/i, 'Usuário não encontrado.'],
  [/invalid email/i, 'Informe um endereço de e-mail válido.'],
]

const PORTUGUESE_MESSAGE = /\b(não|nao|erro|falha|informe|selecione|sessão|sessao|acesso|usuário|usuario|empresa|arquivo|possível|possivel|salvar|excluir|carregar|cadastrar|preencha|senha|nome|convite|registro|tente|dados|permissão|permissao)\b/i

export function translateFunctionErrorMessage(message: unknown, fallback = 'Não foi possível concluir a operação.') {
  const normalizedMessage = String(message ?? '').trim()
  if (!normalizedMessage) return fallback

  const translation = ERROR_TRANSLATIONS.find(([pattern]) => pattern.test(normalizedMessage))
  if (translation) return translation[1]
  if (PORTUGUESE_MESSAGE.test(normalizedMessage)) return normalizedMessage
  return fallback
}

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
      if (detail) return translateFunctionErrorMessage(detail, fallback)
    } catch {
      try {
        const text = await context.clone().text()
        if (text.trim()) return translateFunctionErrorMessage(text, fallback)
      } catch {
        // Mantem o fallback abaixo quando o corpo nao puder ser lido.
      }
    }
  }

  return translateFunctionErrorMessage(message, fallback)
}
