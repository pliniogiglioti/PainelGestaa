# Diretrizes de Produto da TOP V8

## Decisões fechadas na V8

### 1. ICP-alvo
Donos de clínica leigos, preguiçosos, que querem "estalo de dedos". A V8 otimiza para este perfil; usuários avançados continuam na V7 ou esperam V9.

### 2. Escopo
Somente o **Mundo do Dono** é reescrito. O **Mundo do Vendedor** é cópia literal da V7.

### 3. Navegação
Seções horizontais com scroll-snap nativo. Uma pergunta por tela. Swipe + setas + dots + teclado, tudo redundante.

### 4. Fonte do preço mínimo (à vista)
Vem de **sistema externo** via contrato localStorage (`clinicscale:external-minimum-prices:v1`). No MVP é o stub `minimo-demo.html`; depois plugamos o sistema real.

### 5. Mecânica de gordura (valor de tabela)
- **Sugestão padrão**: `minPrice × (1 + jurosMensal)^parcelasMaximas`, com juros e parcelas definidos pelo dono na seção "Última Condição".
- **Override**: dono pode digitar **% de gordura** ou **valor absoluto (R$)** por procedimento.
- **Modo global**: dono pode aplicar o sugerido a todos em 1 clique, ou uma % global a todos em 1 clique.
- **Validação**: override abaixo do mínimo é recusado com aviso amigável.

### 6. O que o dono NÃO vê na V8
- Taxa maquininha, risco inadimplência, taxa débito, antecipação, `cardRates` por parcela.
- Descontos máximos (item, plano, total, à vista).
- Configuração detalhada do boleto (modo de juros, markup total).
- Override narrativo livre por item fora dos 3 modos (auto/pct/absolute).
Todos usam **defaults V7** preenchidos via `createDefaultOwnerSettings()`.

### 7. Atalho preguiçoso
Seção 0 tem botão **"Aceitar tudo sugerido"** que preenche defaults, pula para §6 e permite ativar em 2 cliques.

### 8. Preservação do motor
Toda a camada de cálculo e o Vendedor da V7 são literais. O adaptador V8→V7 garante que `ownerSettings` mantém o mesmo shape.

## O que NÃO entra na V8

- Reescrita do Mundo do Vendedor (fica para V9).
- Painel avançado de dono (edição direta de maquininha, risco etc.).
- Aprovação por gerente, dashboards, perfis.
- API real com sistema externo (por ora stub local + contrato).
- Custo direto, comissão, impostos.
