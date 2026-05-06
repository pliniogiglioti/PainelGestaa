# Contrato de Integração V8 — Preço Mínimo Externo

## Objetivo

Especificar o contrato pelo qual o **TOP V8** recebe preços mínimos (à vista) de um **sistema externo** de cálculo de margem.

No MVP, o "sistema externo" é o stub local `minimo-demo.html`. No futuro, será uma ferramenta real (web/API). O contrato desacopla o TOP V8 da origem dos dados.

## Mecanismo

Comunicação via **`localStorage`** do navegador, em chave compartilhada versionada.

### Chave
```
clinicscale:external-minimum-prices:v1
```

### Formato do payload

```json
{
  "version": 1,
  "exportedAt": "2026-04-24T14:30:00.000Z",
  "source": "minimo-demo" | "real-system",
  "items": [
    {
      "name": "Implante Unitário",
      "category": "Implantodontia",
      "minPrice": 2240,
      "updatedAt": "2026-04-24T14:29:50.000Z",
      "code": "IMP-UNI-001"
    }
  ]
}
```

### Campos

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `version` | int | sim | Versão do contrato. Atual = 1. |
| `exportedAt` | ISO date string | sim | Quando foi exportado. |
| `source` | string | sim | Identifica origem (`"minimo-demo"` ou `"real-system"`). |
| `items` | array | sim | Lista de procedimentos com preço mínimo. |
| `items[].name` | string | sim | Nome exato do procedimento. Precisa bater com `FLAT_CATALOG` do TOP V8. |
| `items[].category` | string | sim | Categoria do procedimento. |
| `items[].minPrice` | number | sim | Preço à vista (= preço mínimo) em reais. |
| `items[].updatedAt` | ISO date string | sim | Última edição deste item na origem. |
| `items[].code` | string | opcional | Código interno do procedimento. Quando presente e o sistema real enviar, passa a ser usado como chave de merge em vez de `name`. |

## Regras de consumo no TOP V8

1. **Leitura explícita**: o TOP V8 **nunca** consome a chave automaticamente. A seção §2 (Preços Mínimos) detecta, mostra "Detectamos X procedimentos em HH:MM — Usar?" e só importa quando o dono clica em "Importar".
2. **Snapshot congelado**: após importar, o TOP V8 copia os itens para `externalMinimumSnapshot` dentro do `ownerV8Model` e **deixa de depender** da chave externa. Editar o stub depois não altera dados do dono sem nova importação explícita.
3. **Substituição total**: cada importação **sobrescreve** o snapshot anterior. Sem merge.
4. **Mapeamento por nome (MVP)**: chave primária é `name` comparado a `FLAT_CATALOG`. Nomes desconhecidos são ignorados e o TOP V8 exibe aviso ("3 procedimentos do export não foram reconhecidos").
5. **Mapeamento por código (futuro)**: quando o sistema real começar a enviar `code`, o TOP V8 passa a preferir `code` sobre `name` para o merge (mais robusto a renomeações).
6. **Rejeição de versões futuras**: se `version !== 1`, o TOP V8 recusa a importação e exibe "Versão do contrato incompatível. Atualize o TOP V8."
7. **Fallback manual**: se a chave não existir ou o dono recusar importar, §2 oferece tabela inline para preencher manualmente.

## Regras de produção no stub / sistema real

1. Grava o JSON na chave exatamente como especificado.
2. `items[].name` deve bater com `FLAT_CATALOG` do TOP V8 (copiado literal no stub).
3. Sempre atualiza `exportedAt` e os `updatedAt` dos itens alterados.
4. Pode gravar a qualquer momento; o consumo é pull-based (dono decide quando importar).

## Duplicação de `FLAT_CATALOG`

Hoje o catálogo está duplicado entre `top_v8.html` e `minimo-demo.html` (paradigma "um HTML roda sozinho"). Consequência: alterar o catálogo exige tocar ambos os arquivos. Fase futura pode extrair para `catalog.js` compartilhado.

## Segurança

- localStorage é local ao navegador; não há risco de vazamento entre usuários.
- Se o sistema real futuro for web, precisará expor um mecanismo de gravar na chave (extensão, postMessage, redirect com parâmetros, etc.). Definir quando chegar a hora.
