# Requirements Document

## Introduction

Este documento descreve as melhorias no módulo de Controle de Laboratórios da aplicação React + TypeScript + Supabase. As mudanças abrangem cinco áreas: simplificação do formulário de criação de laboratório, enriquecimento do cadastro de serviços com prazo de produção e máscara monetária, cálculo automático de prazo no modal de novo envio com alerta de conflito com consulta agendada, exibição de datas previstas (somente leitura) no modal de resumo do trabalho, e adição de um modo calendário na tela principal para visualização das datas previstas de todos os serviços.

## Glossary

- **Sistema**: A aplicação de Controle de Laboratórios (`LabControlPage.tsx`).
- **Laboratório**: Entidade cadastrada na tabela `labs`, representando um parceiro de laboratório odontológico.
- **Serviço**: Item da lista de preços de um laboratório, armazenado na tabela `lab_precos`.
- **Envio**: Registro de trabalho enviado ao laboratório, armazenado na tabela `lab_envios`.
- **Etapa**: Subdivisão de um envio, representando um serviço individual dentro do envio (campo `etapas` JSONB).
- **Prazo de Produção**: Número de dias úteis necessários para concluir um serviço, contados a partir da data de criação do envio.
- **Data Prevista**: Data calculada automaticamente somando o prazo de produção (em dias úteis) à data de criação do envio, desconsiderando fins de semana e feriados do laboratório.
- **Data Concluída**: Data em que a etapa foi efetivamente finalizada (campo editável existente).
- **Prazo de Entrega Prometido**: Data prometida ao paciente para entrega do trabalho completo.
- **Data da Consulta**: Data agendada para a consulta do paciente.
- **Dias Úteis**: Dias que não são sábado, domingo ou feriado cadastrado no laboratório.
- **Modo Calendário**: Visualização alternativa da tela principal que exibe as datas previstas de todos os serviços em um calendário mensal navegável.
- **Máscara Monetária**: Formatação automática de valor numérico para o formato `R$ X.XXX,XX` durante a digitação.
- **Admin**: Usuário com permissão de administrador na empresa.

---

## Requirements

### Requirement 1: Remoção do Campo "Prazo Médio Dias" do Formulário de Criação de Laboratório

**User Story:** Como admin, quero que o formulário de criação de laboratório não exiba o campo "prazo médio dias", para que o cadastro inicial seja mais simples e focado nas informações essenciais.

#### Acceptance Criteria

1. WHEN o admin abre o modal de criação de um novo laboratório, THE Sistema SHALL exibir o formulário sem o campo "Prazo médio (dias)".
2. WHEN o admin salva um novo laboratório sem o campo "prazo médio dias", THE Sistema SHALL persistir o registro com o valor padrão de 0 para `prazo_medio_dias`.
3. WHILE o admin está editando um laboratório já existente, THE Sistema SHALL continuar exibindo o campo "Prazo médio (dias)" normalmente no modal de edição.

---

### Requirement 2: Campo "Prazo de Produção" no Cadastro de Serviço

**User Story:** Como admin, quero informar o prazo de produção em dias úteis ao cadastrar um serviço, para que o sistema possa calcular automaticamente as datas previstas de cada etapa.

#### Acceptance Criteria

1. WHEN o admin acessa o modal de lista de preços de um laboratório, THE Sistema SHALL exibir um campo numérico "Prazo de produção (dias úteis)" ao lado do campo de valor para cada serviço sendo adicionado ou editado.
2. WHEN o admin salva um serviço com prazo de produção preenchido, THE Sistema SHALL persistir o valor inteiro positivo no campo `prazo_producao_dias` da tabela `lab_precos`.
3. IF o admin salva um serviço sem preencher o prazo de produção, THEN THE Sistema SHALL persistir o valor `null` para `prazo_producao_dias`.
4. WHEN o admin digita um valor no campo de valor do serviço, THE Sistema SHALL aplicar máscara monetária automática exibindo o valor no formato `R$ X.XXX,XX` (ex: digitar `12399` exibe `R$ 123,99`).
5. THE Sistema SHALL armazenar o valor monetário como número decimal (centavos divididos por 100) independentemente da formatação exibida.

---

### Requirement 3: Cálculo Automático de Prazo de Entrega no Modal de Novo Envio

**User Story:** Como usuário, quero que o prazo de entrega prometido seja calculado automaticamente com base nos serviços selecionados, para que eu não precise calcular manualmente e evite erros.

#### Acceptance Criteria

1. WHEN o usuário seleciona um ou mais serviços no modal de novo envio, THE Sistema SHALL calcular o "Prazo de entrega prometido" como a data de criação do envio somada ao maior `prazo_producao_dias` entre todos os serviços selecionados, em dias úteis.
2. WHEN o cálculo do prazo de entrega prometido é realizado, THE Sistema SHALL desconsiderar fins de semana e feriados cadastrados no laboratório ao contar os dias úteis.
3. WHEN o usuário altera a seleção de serviços, THE Sistema SHALL recalcular automaticamente o prazo de entrega prometido.
4. WHEN o prazo de entrega prometido calculado for posterior à data da consulta agendada informada, THE Sistema SHALL exibir um alerta visual destacado informando que o prazo ultrapassa a data da consulta.
5. IF nenhum serviço selecionado possuir `prazo_producao_dias` definido (todos nulos), THEN THE Sistema SHALL manter o comportamento atual de cálculo baseado em `prazo_medio_dias` do laboratório.
6. WHEN o modal de novo envio é aberto, THE Sistema SHALL preencher automaticamente o campo "Data do serviço" (data de envio) com a data atual.

---

### Requirement 4: Datas Previstas no Modal de Resumo do Trabalho

**User Story:** Como usuário, quero visualizar a data prevista de cada etapa no modal de resumo do trabalho, para que eu possa acompanhar o andamento em relação ao planejado.

#### Acceptance Criteria

1. WHEN o usuário abre o modal de resumo de um envio, THE Sistema SHALL exibir, para cada etapa, um campo "Previsto" somente leitura contendo a data calculada como data de criação do envio somada ao `prazo_producao_dias` do serviço correspondente, em dias úteis.
2. WHEN o `prazo_producao_dias` do serviço for nulo, THE Sistema SHALL exibir o campo "Previsto" com o valor `—` (traço) indicando ausência de prazo definido.
3. WHILE o modal de resumo está aberto, THE Sistema SHALL manter o campo "Previsto" como somente leitura, sem permitir edição pelo usuário.
4. WHEN o usuário abre o modal de resumo de um envio, THE Sistema SHALL continuar exibindo o campo "Concluído" como editável, preservando o comportamento atual.
5. THE Sistema SHALL exibir os campos "Previsto" e "Concluído" lado a lado para cada etapa no modal de resumo.

---

### Requirement 5: Modo Calendário na Tela Principal

**User Story:** Como usuário, quero visualizar as datas previstas de todos os serviços em um calendário mensal, para que eu tenha uma visão temporal da carga de trabalho do laboratório.

#### Acceptance Criteria

1. WHEN o usuário está na tela principal de Controle de Laboratórios, THE Sistema SHALL exibir um botão "Modo Calendário" na área de ações do cabeçalho.
2. WHEN o usuário clica em "Modo Calendário", THE Sistema SHALL alternar a visualização da tela principal para exibir um calendário mensal.
3. WHEN o modo calendário é ativado, THE Sistema SHALL exibir o mês atual por padrão.
4. WHEN o calendário está ativo, THE Sistema SHALL exibir nas células dos dias as datas previstas (calculadas) de todos os serviços de todos os envios em andamento.
5. WHEN o usuário clica nos botões de navegação do calendário, THE Sistema SHALL navegar para o mês anterior ou próximo mês, atualizando a exibição.
6. WHEN o calendário exibe um serviço em uma data, THE Sistema SHALL mostrar o nome do paciente e o nome do serviço na célula correspondente.
7. IF um dia do calendário não possuir nenhum serviço previsto, THEN THE Sistema SHALL exibir a célula vazia sem indicadores.
8. WHEN o usuário clica em "Modo Calendário" novamente ou em um botão de alternância, THE Sistema SHALL retornar à visualização padrão (lista de laboratórios ou kanban).
