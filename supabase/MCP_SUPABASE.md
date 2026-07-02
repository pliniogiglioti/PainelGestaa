# Como conectar o MCP do Supabase

Este projeto usa o MCP remoto oficial do Supabase. Ele permite que o Codex consulte tabelas, execute SQL, veja logs, advisors, migrations, Edge Functions e a documentação do Supabase.

## Configuração deste projeto

- Nome do servidor: `supabase`
- Project ref: `scdtwfxhtrpdcujwfcpp`
- Endpoint:

```text
https://mcp.supabase.com/mcp?project_ref=scdtwfxhtrpdcujwfcpp&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cbranching%2Cfunctions%2Cstorage
```

Restringir o MCP com `project_ref` é importante para impedir que o agente acesse outros projetos da mesma conta.

## Conectar pelo Codex CLI

No terminal, dentro do projeto, execute:

```powershell
codex mcp add supabase --url "https://mcp.supabase.com/mcp?project_ref=scdtwfxhtrpdcujwfcpp&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cbranching%2Cfunctions%2Cstorage"
```

Depois autentique via OAuth:

```powershell
codex mcp login supabase
```

O navegador será aberto. Entre na conta do Supabase, autorize o acesso ao projeto e volte ao Codex.

Reinicie o Codex ou abra uma nova sessão após a autenticação. No terminal interativo do Codex, use `/mcp` para confirmar que o servidor `supabase` está ativo.

## Configuração manual do Codex

O Codex guarda servidores MCP em `~/.codex/config.toml`. Para limitar a configuração a este repositório, também é possível usar `.codex/config.toml` em um projeto marcado como confiável:

```toml
[mcp_servers.supabase]
url = "https://mcp.supabase.com/mcp?project_ref=scdtwfxhtrpdcujwfcpp&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cbranching%2Cfunctions%2Cstorage"
```

Depois execute:

```powershell
codex mcp login supabase
```

## Configuração para clientes que usam `.mcp.json`

O repositório já possui um `.mcp.json`. O formato é:

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=scdtwfxhtrpdcujwfcpp&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cbranching%2Cfunctions%2Cstorage"
    }
  }
}
```

O `.mcp.json` depende do cliente utilizado. No Codex, prefira `codex mcp add` ou `config.toml`.

## Conferir a conexão

No Codex, peça uma operação somente de leitura, por exemplo:

```text
Use o MCP do Supabase e liste as tabelas do schema public.
```

Se ferramentas como `list_tables`, `execute_sql`, `get_logs` e `get_advisors` estiverem disponíveis, a conexão está funcionando.

## Remover ou refazer a conexão

```powershell
codex mcp logout supabase
codex mcp remove supabase
```

Depois repita os comandos de instalação e login.

## Solução de problemas

1. Confirme se o servidor foi cadastrado com `codex mcp --help` e `/mcp`.
2. Execute novamente `codex mcp login supabase` e conclua o OAuth no navegador.
3. Reinicie o Codex após o login.
4. Confira se o `project_ref` da URL está correto.
5. Teste se `https://mcp.supabase.com/mcp` responde. Uma resposta HTTP `401` sem autenticação significa que o servidor está acessível.
6. Se as ferramentas aparecem, mas uma consulta é bloqueada, verifique permissões e políticas RLS do projeto.

## Segurança

- Não coloque `service_role`, secret key ou access token no repositório.
- Prefira trabalhar em uma branch de desenvolvimento para mudanças arriscadas.
- Restrinja o MCP a um único projeto com `project_ref`.
- Reduza a lista de `features` quando não precisar de todas as ferramentas.
- Revise SQL e migrations antes de aplicá-los em produção.

Documentação oficial: [Supabase MCP Server](https://supabase.com/docs/guides/ai-tools/mcp) e [Codex MCP](https://developers.openai.com/codex/mcp).
