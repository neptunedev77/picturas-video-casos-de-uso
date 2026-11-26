#import "../template.typ": *

// Capítulo inteiro na horizontal (tabelas largas). Para voltar ao vertical, retirar o #paisagem[ ].
#paisagem[
= Candidatos a Requisitos Não Funcionais

#orientacao[
  *Origem:* Exercício 6, Bloco 2, secção 5 do _template_.

  *Objetivo do capítulo:* escolher *dois* requisitos não funcionais *distintos* a melhorar nesta fase, a partir dos
  cenários de qualidade mais prioritários do capítulo 5. Cada um é classificado segundo a ISO/IEC 25010 (característica e,
  quando aplicável, subcaracterística) e parte de uma fragilidade concreta da solução de base, com evidência.

  Cada candidato é depois especificado, implementado e avaliado por si, ainda que os dois possam estar relacionados.
  A coluna do cenário liga o candidato ao `QS-nn` do capítulo 5, que é a entrada do Exercício 7 (capítulo 7).
]

#tab([Candidatos a requisitos não funcionais da Fase 2],
  tabela(
    colunas: (1.6cm, 2.6cm, 3cm, 2.4cm, 2.8cm, 2.6cm, 2cm, 3cm, 2.8cm),
    tamanho: 7.5pt,
    [\#], [Característica / subcaracterística (ISO/IEC 25010)], [Fragilidade na base (evidência)], [Origem (padrão global / vídeo / interação)], [Impacto nos stakeholders (pertinência)], [Exigência técnica (complexidade)], [Cenário (`QS-nn`, cap. 5)], [Escala e método de medição (esboço)], [Pré-requisitos / efeitos colaterais],
    [CAND-1 · Elasticidade], [Eficiência de desempenho: comportamento temporal, capacidade, utilização de recursos],
      [Um único _worker_ de vídeo, réplicas fixas e sem limites: os cortes esperam atrás das legendagens e tudo fica
      ligado mesmo sem carga (EV-06, EV-11, EV-22)],
      [Interação: o _worker_ único vem do padrão do vídeo; a capacidade fixa vem do padrão global],
      [Quem edita um vídeo enquanto outro está a ser legendado; utilizadores com vídeos longos; quem paga os recursos
      sempre ligados],
      [Alta: fila própria para a legendagem, _autoscaler_ que cria e remove réplicas com segurança e limites de
      recursos],
      [QS-01 (principal), QS-02],
      [Tempos de espera, tempos para acrescentar e retirar réplicas, memória e imagens por minuto, em três cenários
      de carga com 5 repetições],
      [Depende do CAND-2 para retirar réplicas sem perder trabalho; afeta a memória e a segurança],
    [CAND-2 · Fiabilidade], [Fiabilidade: tolerância a falhas, recuperabilidade],
      [Mensagens confirmadas cedo demais, publicações que se podem perder, filas sem DLQ, trabalhos sem prazo e erros de
      imagem que não chegam ao utilizador (EV-10, EV-15, EV-16, EV-17, EV-18, EV-23)],
      [Sobretudo o padrão global; no vídeo, a falta de sinais de vida do _worker_ (EV-21)],
      [Qualquer utilizador: 25 de 60 trabalhos ficaram pendurados para sempre, sem aviso],
      [Alta: muda a forma como todas as ferramentas e o `projects` trocam mensagens, e obriga a evitar duplicados],
      [QS-03 (principal), QS-04],
      [% de trabalhos que terminam e que terminam com sucesso, tempo de recuperação, % de erros comunicados a tempo e
      resultados duplicados, com seis falhas provocadas por _scripts_ e 5 repetições],
      [É necessário para o CAND-1 retirar réplicas; pode acrescentar algum tempo a cada mensagem; os erros passam a
      ser visíveis],
  ),
)

== Quantificação

#orientacao[
  Indiquem a *escala* (o que se mede e em que unidade) e o *método de medição* (cenário, carga, ambiente e instrumento) de
  cada candidato. O objetivo é mostrar que o requisito é mensurável e que sabem como o medir.

  Os valores medidos na base, os valores-alvo e os valores mínimos aceitáveis *só são fixados após a medição inicial
  (_baseline_, capítulo 10)*. Não os inventem: preencham as três últimas linhas da tabela só depois de medir a base,
  indicando a origem de cada valor (e.g., medição, referência externa, necessidade de um _stakeholder_).
]

#tab([Quantificação dos requisitos não funcionais],
  tabela(
    colunas: (4.2cm, 1fr, 1fr),
    [], [CAND-1], [CAND-2],
    [Escala (o que se mede e em que unidade)], [Cinco métricas, E-1 a E-5 (@tab-quant-e): tempos de espera (s),
      tempos para acrescentar e retirar réplicas (s), memória (MB) e imagens por minuto],
      [Cinco métricas, R-1 a R-5 (@tab-quant-r): percentagens de trabalhos que terminam e que terminam com sucesso,
      tempo de recuperação (s), percentagem de erros comunicados a tempo e resultados duplicados],
    [Cenário de medição], [S1: uma legendagem de um vídeo de 60 s e, 5 s depois, 3 cortes de vídeos de 10 s.
      S2: rajada de 2 legendagens, 6 edições curtas e 20 projetos de imagem em 30 s. S3: 60 s sem carga, a rajada do
      S2 e 180 s sem carga. E ainda corridas sem carga de cada tipo de trabalho, como referência.],
      [F1: parar a ferramenta de contraste a meio de um lote de imagens. F2: parar o _worker_ de vídeo a meio de uma
      legendagem. F3: reiniciar o RabbitMQ. F4: parar e reiniciar o `projects`. F5: parâmetros inválidos numa imagem e
      num vídeo. F6: congelar o _worker_ de vídeo e a ferramenta de brilho durante 60 s.],
    [Carga], [Dados fixos e guardados no repositório: um vídeo de 60 s com fala, um vídeo de 10 s e 10 imagens],
      [Os mesmos dados, com um a três trabalhos por cenário],
    [Ambiente], [O portátil de referência, nas condições descritas no capítulo 2; cada corrida regista o _commit_, as
      versões e o hardware], [O mesmo],
    [Instrumento], [Scripts em `fase2/bench/`: geram a carga pela API pública, registam as notificações, as filas e a
      memória, e calculam mediana, p95 e desvio-padrão das 5 repetições], [Os mesmos; as falhas são provocadas com
      comandos do Docker em instantes fixos],
    [Valor medido na base], [Medição de 17 de novembro sobre o _commit_ `a2c0772` (@tab-quant-e)], [Idem
      (@tab-quant-r)],
    [Valor-alvo (e origem)], [Por métrica, com a origem (@tab-quant-e)], [Por métrica, com a origem (@tab-quant-r)],
    [Valor mínimo aceitável (e origem)], [Por métrica (@tab-quant-e)], [Por métrica (@tab-quant-r)],
  ),
)

Os alvos foram fixados depois da medição inicial e não mudaram até à medição final. Os valores da base são medianas
de 5 repetições; o p95 é o valor abaixo do qual ficam 95 % das medições.

#figure(kind: table, caption: [Quantificação do CAND-1 (elasticidade)],
  tabela(
    colunas: (1.2cm, 1fr, 1.4cm, 3.4cm, 3.4cm, 1fr),
    tamanho: 8pt,
    [ID], [Escala (o que se mede)], [Cenário], [Base (medida)], [Alvo / mínimo aceitável], [Origem do alvo],
    [E-1], [Espera p95 (s) de um corte curto, do pedido ao primeiro sinal de progresso], [S1],
      [*13,0* (mediana 12,3)], [*≤ 2* / ≤ 5],
      [O mesmo corte sem carga demora 0,8 s; o mínimo admite o arranque de uma réplica nova (4,8 s, EV-19).
      REQ-VID-EDIT-010 (Fase 1 de 2026/27)],
    [E-2], [Espera p95 (s) dos vídeos numa rajada; o tempo total da rajada é uma métrica secundária], [S2],
      [*21,5* (tempo total 39,6)], [*≤ 8* / ≤ 12; tempo total ≤ 33],
      [Arranque de uma réplica (4,8 s) mais um ciclo do _autoscaler_ (2 s). O tempo total nunca desce muito abaixo de
      31,5 s, porque a 2.ª legendagem só é pedida aos 15 s e demora 16,5 s],
    [E-3], [Tempo (s) entre a fila começar a acumular e surgir uma réplica nova], [S3], [Não se aplica (sempre 1
      réplica)], [*≤ 10* / ≤ 20], [Arranque de uma réplica (4,8 s, EV-19), mais um ciclo e uma margem],
    [E-4], [Tempo (s) até retirar uma réplica depois de a fila esvaziar, e memória total (MB)], [S3],
      [Nunca retira réplicas; *3 258 MB* sem carga, 4 252 na rajada, 3 453 depois], [Retirar *≤ 60 s* / ≤ 120;
      memória *≤ 3 420* / ≤ 3 585 MB], [Memória sem carga da base mais 5 % / 10 %],
    [E-5], [Imagens processadas por minuto, com 20 projetos em simultâneo (não deve piorar)], [S2],
      [*41,7* (igual ao ritmo de pedidos)], [*≥ 41,7* / ≥ 40], [As imagens não são um problema (10 imagens × 3
      filtros em 0,63 s) e não devem piorar. RNF43 e RNF58 da base de 2025/26],
  ),
) <tab-quant-e>
#pagebreak()
#figure(kind: table, caption: [Quantificação do CAND-2 (fiabilidade)],
  tabela(
    colunas: (1.2cm, 1fr, 1.4cm, 3.4cm, 3.4cm, 1fr),
    tamanho: 8pt,
    [ID], [Escala (o que se mede)], [Falhas], [Base (medida)], [Alvo / mínimo aceitável], [Origem do alvo],
    [R-1], [% de trabalhos que terminam bem (com sucesso, ou com o erro comunicado), sem nenhum pendurado], [F1–F6],
      [*58,3 %* (25 de 60 pendurados)], [*100 %* / ≥ 95 %], [REQ-VID-FAIL-004 (sem perda de trabalho)],
    [R-2], [% de trabalhos concluídos com sucesso sem o utilizador repetir o pedido], [F1–F4], [*50 %* (20 de 40)],
      [*≥ 99,5 %* / ≥ 95 %], [REQ-VID-EDIT-012; com 40 trabalhos, na prática exige 100 %],
    [R-3], [Atraso (s) em relação à mesma corrida sem falha], [F1–F4], [F2 *+26,1*; F1, F3 e F4 *nunca
      recuperam*], [*≤ 30* / ≤ 60], [O F2 na base: reiniciar o contentor e refazer o vídeo (+26 s)],
    [R-4], [% de falhas de ferramenta comunicadas ao utilizador dentro do prazo], [F5, F6],
      [F5 *50 %* em ≤ 10 s (só os erros de vídeo); F6 *0 %*], [F5 *100 % em ≤ 10 s* / ≥ 95 %; F6 *100 %* em ≤ 50 s
      (ver secção 7.2)], [REQ-VID-FAIL-003 (mensagens compreensíveis)],
    [R-5], [Resultados duplicados ou trocados depois de uma mensagem ser entregue de novo], [F1–F4], [*0*], [*0*],
      [REQ-VID-EDIT-009 (reprodutibilidade)],
  ),
) <tab-quant-r>

== Relação entre os dois candidatos

Os dois candidatos pertencem a características diferentes da ISO/IEC 25010, mas um depende do outro: o _autoscaler_
do CAND-1 só pode retirar réplicas se o CAND-2 garantir que um _worker_ termina o trabalho em curso antes de parar.
No sentido contrário, o CAND-2 pode tornar o sistema um pouco mais lento, porque cada mensagem passa a esperar pela
confirmação do RabbitMQ; por isso medimos também as corridas sem carga e o E-5. Há ainda efeitos noutros requisitos:
na memória (mais réplicas nos picos, menos sem carga), na segurança (o _autoscaler_ controla o Docker) e na
usabilidade (erros que antes se perdiam passam a aparecer).

== Evidência exploratória (se existir)

#tab([Evidência exploratória],
  tabela(
    colunas: (4cm, 5cm, 1fr),
    [Descrição], [Localização (_scripts_, dados, resultados)], [Como repetir],
    [Tempo até uma nova réplica de vídeo começar a trabalhar (origem do alvo do E-3)],
      [`fase2/bench/results/baseline/E3-replica-startup.txt` (EV-19)],
      [Acrescentar uma réplica com `docker compose up --scale video_tool=2` e medir quando a fila passa a ter 2
      consumidores; 3 medições],
  ),
)
]
