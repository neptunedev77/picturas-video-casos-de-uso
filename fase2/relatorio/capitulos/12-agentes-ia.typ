#import "../template.typ": *

= Utilização de IA

#orientacao[
  *Origem:* Exercício 6, Bloco 2, secção 7, e Exercício 7, secção 6.

  Obrigatório: documentar as ferramentas, os modelos e as _skills_ utilizadas, enumerar as tarefas apoiadas e comprovar a
  validação realizada pela equipa, tanto na análise e na escrita como no código e nas medições. A equipa é responsável
  por todo o conteúdo entregue, incluindo o gerado por IA.

  Valoriza-se evidência concreta (_commits_, ficheiros de configuração dos agentes) e reflexão crítica: o que a IA
  fez bem, onde errou, como o erro foi detetado e o que foi rejeitado e porquê. Não basta dizer que a IA foi usada; é preciso mostrar
  que o resultado foi verificado.
]

Este capítulo resume o registo de utilização de IA do repositório (`fase2/PROMPTS.md`). Para cada tarefa, o registo
indica o pedido feito ao agente, o resultado, as verificações e a intervenção da equipa, separando o que foi
verificado pelo agente do que foi verificado pela equipa. As _prompts_ da elasticidade foram registadas como resumos fiéis;
as entradas dessa frente foram reconstruídas a partir dos _commits_ e das mensagens da equipa.

== Ferramentas, modelos e configuração

#tabela(
  colunas: (3.5cm, 1fr),
  [Ferramenta / modelo], [Configuração e utilização (_skills_, instruções de projeto, MCP, …)],
  [Claude Code (Opus 5.5)], [Fiabilidade (Sérgio Vieira), medição e qualidade e organização do relatório (António
    Sousa). Partiu das
    _prompts_ de implementação do grupo (`fase2/docs/prompts-implementacao.md`). Regras fixadas pela equipa: o
    agente não faz _commits_, _push_ nem _merges_; cada etapa começa com um plano sem alterar código, que é aprovado
    ou corrigido, e termina com um relatório; o registo distingue o trabalho do agente do da equipa. As regras das
    mensagens ficaram descritas no `AGENTS.md` do repositório. Não foram registadas _skills_ específicas.],
  [Claude (Opus 5.5)], [Revisão do _pull request_ da fiabilidade (Diogo Macedo), contra a _prompt_ e o plano, e
    correção dos problemas encontrados num ramo próprio.],
  [Codex (modelo não registado)], [Elasticidade (Bruno Sousa e Bruno Vale, com as contas git `RafaelSousa29` e
    `brunovale2003`). Partiu da _prompt_ de implementação da elasticidade do grupo, pedida por etapas. Regras definidas
    pela equipa: ler o `AGENTS.md` e analisar o código antes de implementar; não alterar a Fiabilidade; não fazer
    _commit_, _push_, _merge_ ou _rebase_ sem autorização explícita.],
)

== Tarefas apoiadas e validação

#tab([Tarefas apoiadas por IA e validação],
  tabela(
    colunas: (2.6cm, 2.4cm, 2.4cm, 2.8cm, 2.8cm),
    tamanho: 8.5pt,
    [Ferramenta / modelo / _skill_], [Tarefa apoiada (capítulo)], [O que foi aceite], [O que foi rejeitado e porquê], [Como foi validado pela equipa],
    [Claude Code], [Consumidor fiável e migração das ferramentas e do vídeo (DA-2, cap. 8)],
      [`reliable_consumer.py`; ferramentas e vídeo sem alterações individuais], [—],
      [Sérgio: revisão guiada do código antes do 1.º _commit_, onde se encontrou um bloqueio do _worker_ quando a
      publicação falhava (corrigido); `run-all.sh` com `ALL PASSED` em cada etapa; tempos piores em `dev` analisados
      antes de aceitar],
    [Claude Code], [Respostas de erro das ferramentas de imagem (DA-2)], [Correção de 23 chamadas em 12 ferramentas e
      dos identificadores; teste automático que deteta chamadas erradas], [Uma substituição automática: cada chamada foi confirmada uma a uma],
      [Sérgio: confirmação individual das 23 chamadas; esse teste corrido à parte; F5 preliminar],
    [Claude Code], [Ligação persistente e confirmada no `projects` (DA-2)], [Novo módulo de envio de mensagens, com a mesma interface],
      [Descartar as mensagens cujo tratamento falha (podia perder mensagens antes de existir a DLQ); uma fila
      persistente adicional (fora do plano)], [Sérgio: verificação da confirmação das mensagens com o código que as usa;
      limitação documentada],
    [Claude Code], [Filas _quorum_ e DLQ (DA-2)], [Política com 5 entregas e DLQ; consumidor da DLQ],
      [A ordem de migração proposta (parar o `projects` primeiro deixaria trabalhos pendentes)],
      [Sérgio: confirmação da política antes de migrar; nova ordem de migração; remoção do volume só no seu
      ambiente],
    [Claude Code], [_Watchdog_ (DA-2)], [Prazos de 30 s e max(120 s, duração), aviso e reposição da quota],
      [Alterações à rota de cancelamento e ao _benchmark_], [Sérgio: testes de três condições exigidos; limitação
      (mede o tempo desde o envio, não o progresso) documentada],
    [Claude Code], [Idempotência e revisão técnica (DA-2)], [Bloqueio por mensagem; correção de uma situação de
      corrida entre o _watchdog_ e o tratamento de uma resposta], [O reenvio automático de pedidos quando o sucessor já existe],
      [Sérgio: revisão técnica pedida antes do último _commit_; correção aprovada com condições],
    [Claude], [Revisão do _pull request_ da fiabilidade], [Três correções no `projects` (envios recusados, mensagens
      sem confirmação e devolução da quota a partir da DLQ)], [Restantes pontos da revisão deixados como limitações],
      [Diogo: escolheu que problemas corrigir e quais ficavam como limitações; correu a suite de testes, e a
      regressão foi depois confirmada com 30/30 na máquina de referência],
    [Codex], [Fila pesada, _pools_ de vídeo, limites e encaminhamento (DA-1)], [Topologia, `video_heavy_tool`,
      `videoRouting.js`, 15 testes de topologia], [—], [Bruno Sousa: implementação pedida bloco a bloco, cada um
      com testes; os testes de topologia passaram na máquina de referência a 23/11],
    [Codex], [_Autoscaler_: observação, _scale-out_ e _scale-in_ (DA-1)], [`fase2/autoscaler/` com três modos],
      [Dois bloqueios de recuperação encontrados na revisão final, corrigidos antes do _commit_], [Bruno Vale:
      análise antes de implementar, requisitos de segurança e cenários críticos definidos para a revisão, Fiabilidade
      fora do âmbito, _commits_ só depois de revisão e com os ficheiros indicados; testes do _autoscaler_ aprovados na
      máquina de referência a 23/11 e funcionamento com Docker real na medição final (capítulo 10)],
    [Claude Code], [Instrumentos de medição e medição inicial (cap. 6 e 10)], [`fase2/bench/`, dados de teste e
      campanha de 5 repetições], [A 1.ª versão do F1, F4 e F6, que injetava a falha depois de os trabalhos acabarem],
      [António: preparou a máquina de referência, correu a campanha e reviu os resultados, onde detetou o problema do
      F1, F4 e F6],
    [Claude Code], [Suite de regressão e _golden outputs_ (cap. 10)], [30 casos e `run-all.sh`], [—],
      [António: confirmou a regressão 30/30 num clone limpo e definiu que todos os _commits_ seriam feitos pela
      equipa],
    [Claude Code], [Revisão antes da medição final (cap. 8 e 10)], [Parecer em PDF; alterações ao `analyze.py` e ao
      `run-measurements.sh`; período sem trabalho de 40 s], [—], [António: pediu correções simples de explicar e
      decidiu assumir as correções finais, as medições e o relatório],
    [Claude Code], [Organização do relatório (todos os capítulos)], [Estrutura dos capítulos segundo o _template_ da
      Fase 2 e organização do conteúdo produzido pela equipa], [—], [António: escolheu o conteúdo de cada capítulo e
      reviu o texto],
  ),
)
#pagebreak()
== Análise crítica

=== O que correu bem
Trabalhar por etapas, com um plano aprovado antes de qualquer alteração e um relatório no fim,
permitiu à equipa corrigir propostas antes de chegarem ao código. Na fiabilidade, cada etapa terminou com testes novos
e com a suite de regressão a passar, e os resultados obtidos fora da máquina de referência ficaram registados como
preliminares.

=== Onde a IA errou e como foi detetado
- Propostas que podiam perder mensagens ou trabalho: descartar mensagens cujo tratamento falhava, e uma ordem de
  migração do RabbitMQ que deixava trabalhos pendentes. Ambas foram detetadas na aprovação dos planos.
- Defeitos no código gerado: um bloqueio do _worker_ quando o envio falhava (revisão guiada), uma situação de corrida
  entre o _watchdog_ e o tratamento das respostas e a falta de confirmações nos _workers_ (revisão técnica pedida antes
  do último _commit_), e três problemas no `projects` encontrados na revisão do _pull request_.
- Um erro de método na medição: a primeira versão do F1, F4 e F6 provocava a falha depois de os trabalhos acabarem; foi
  detetado na revisão dos resultados e esses dados foram postos de parte.
- Uma métrica que não media o alvo: o R-4 do F6 só contava erros até 10 s; foi corrigida com a definição do plano, sem
  alterar os valores da base.
- No início, o agente chegou a fazer _commits_ sem que lhe fossem pedidos; a partir daí, todos os _commits_ passaram
  a ser feitos pela equipa.

=== Limitações do registo
Na elasticidade, as _prompts_ estão registadas como resumos fiéis e não como a conversa
completa. Na revisão do _pull request_ da fiabilidade, os testes com a aplicação completa foram corridos pela equipa.

=== Práticas adotadas
Plano antes do código; verificações do agente separadas das
da equipa; medições oficiais apenas na máquina de referência; e os instrumentos de medição e os resultados de
referência da regressão mantidos sem alterações entre a base e a medição final, salvo as alterações documentadas.
