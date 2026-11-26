#import "../template.typ": *

#paisagem[
= Trade-offs, Medição e Preservação Funcional

#orientacao[
  *Origem:* Exercício 7, secção 5 do _template_ (e os riscos de preservação funcional do Bloco 2, secção 6).

  *Objetivo do capítulo:* mostrar que as decisões foram avaliadas além do atributo que melhoram (_trade-offs_), que a
  melhoria foi medida de forma comparável (antes e depois) e que o comportamento funcional foi preservado.

  A mesma medição é feita *antes e depois* do _refactoring_, no mesmo ambiente. *Não inventem valores* de _baseline_, alvo
  ou mínimo aceitável: fixam-se após a medição inicial. Guardem os _scripts_, os dados e o ambiente das medições para os
  reutilizar como _baseline_.
]

== Matriz de efeitos

#orientacao[
  Para cada decisão, indiquem se cada atributo *melhora* (↑), *degrada* (↓) ou fica *neutro* (=), e justifiquem. Incluam
  no mínimo quatro atributos, e entre eles a característica do outro cenário: uma melhoria num atributo costuma ter um
  custo noutro, e é isso que esta matriz deve revelar. Se uma decisão degradar um atributo, digam como a equipa vai
  gerir esse custo.
]

#tab([Matriz de efeitos das decisões],
  tabela(
    colunas: (1.8cm, 2.6cm, 3.4cm, 2.4cm, 2.4cm, 3.6cm, 1fr),
    tamanho: 8.5pt,
    [Decisão], [Desempenho], [Disponibilidade / Fiabilidade], [Segurança], [Usabilidade], [Manutenibilidade / Testabilidade], [Justificação],
    [DA-1], [↑ para os trabalhos curtos e para a memória sem carga; ↓ para cada legendagem isolada],
      [\= (as réplicas não fazem perder nem duplicar trabalho); risco: sem o _autoscaler_ a correr, as legendagens
      ficam à espera], [↓ (o _autoscaler_ controla o Docker)], [↑ (esperas mais curtas)],
      [↓ um componente novo para manter / ↑ coberto por 182 testes],
      [A espera dos cortes desceu de 13,0 s para 1,7 s e a memória sem carga de 3 258 MB para 2 030 MB. Em troca, uma
      legendagem isolada passou de 16,5 s para 27,4 s, porque a réplica de legendagem arranca do zero e está limitada a
      4 CPUs. *Como gerimos o custo:* testámos manter uma réplica de legendagem sempre ligada (secção 10.4), e o
      _autoscaler_ só pode atuar sobre os dois serviços de vídeo.],
    [DA-2], [\= (o custo das confirmações é quase nulo)], [↑ (nenhum trabalho perdido ou pendurado)], [\=],
      [↑ (os erros chegam ao utilizador)], [↑ uma biblioteca comum em vez de 16 cópias / ↑ novos testes],
      [O R-1 passou de 58 % para 100 % e o R-4 do F5 de 50 % para 100 %. As corridas sem carga quase não mudaram (lote
      misto 2,29 → 2,40 s; 10 imagens 0,63 → 0,58 s) e as imagens por minuto ficaram iguais. *Custo a gerir:* erros que
      antes se perdiam passam a aparecer, e um trabalho que ultrapasse o prazo é dado como falhado; por isso o prazo
      depende do tipo e da duração do trabalho.],
  ),
)
]

== Interação entre DA-1 e DA-2

#tab([Interação entre as decisões],
  tabela(
    colunas: (2.2cm, 2.2cm, 4.4cm, 1fr),
    [Decisão A], [Decisão B], [Efeito (pré-requisito, sinergia ou conflito)], [Razão / evidência],
    [DA-2], [DA-1], [Pré-requisito], [Só é seguro retirar uma réplica porque o _worker_ termina o trabalho em curso
      antes de parar e só confirma a mensagem no fim (TAT-07, TAT-12). Sem isso, cada réplica retirada perderia
      trabalho.],
    [DA-1], [DA-2], [Conflito resolvido a favor da fiabilidade], [O _autoscaler_ não age enquanto uma réplica estiver
      parada, congelada ou a arrancar. No F6 isto impede-o de acrescentar réplicas durante a falha: evita decisões com
      dados errados, à custa de elasticidade nesse período.],
    [DA-1], [DA-2], [Conflito a gerir], [Com o _pool_ de legendagem sem réplicas e o _autoscaler_ parado, uma
      legendagem fica na fila sem se perder, mas o _watchdog_ acaba por dá-la como falhada ao fim de pelo menos 120 s.],
    [DA-2], [DA-1], [Conflito a gerir], [O prazo de 30 s para imagens obrigou a incluir na imagem da remoção de fundo o
      modelo de 176 MB, que antes era descarregado no primeiro trabalho.],
  ),
)

== Plano de medição

#tab([Plano de medição],
  tabela(
    colunas: (1.6cm, 3.2cm, 3cm, 2.6cm, 2.4cm, 2.8cm),
    tamanho: 8pt,
    [Cenário], [Cenário de teste e carga], [Ambiente (máquina, recursos, versões)], [O que se regista], [Repetições e agregação], [Onde ficam os _scripts_ e os dados],
    [QS-01], [S1: uma legendagem de 60 s e, 5 s depois, 3 cortes de 10 s], [Portátil de referência (capítulo 2),
      ligado à corrente, em modo de desempenho e sem outras aplicações], [Instantes do pedido, do primeiro progresso e
      do fim de cada trabalho; filas a cada segundo; memória a cada 2 s, aproximadamente], [5 repetições; mediana, p95 e
      desvio-padrão], [`fase2/bench/` (_scripts_) e `fase2/bench/results/` (dados)],
    [QS-02], [S2: 2 legendagens, 6 edições e 20 projetos de imagem em 30 s. S3: 60 s sem carga, a mesma rajada e
      180 s sem carga. Uma corrida sem carga para medir a memória], [O mesmo], [O mesmo, e o número de _workers_
      ligados a cada fila], [O mesmo], [O mesmo],
    [QS-03], [Falhas F1–F4 e as mesmas corridas sem falha, como referência], [O mesmo], [Estado final e resultados
      de cada trabalho e tempo total], [5 repetições; percentagens sobre todos os trabalhos; atraso face à referência],
      [O mesmo],
    [QS-04], [Falhas F5 (parâmetros inválidos) e F6 (_worker_ congelado 60 s)], [O mesmo], [Instante e conteúdo da
      mensagem de erro], [5 repetições; % de erros comunicados dentro do prazo], [O mesmo],
  ),
)

== Resultados das medições

#orientacao[
  Para cada requisito não funcional, apresentem os valores medidos *antes* (_baseline_) e *depois* do _refactoring_, com o
  mesmo método e nas mesmas condições (plano acima), e comparem-nos com o valor-alvo e o valor mínimo aceitável fixados no
  capítulo 6. Os dados brutos e os _scripts_ ficam no repositório entregue.

  Na análise, sejam críticos: o que melhorou, o que não foi atingido e porquê, que outros atributos foram afetados
  (confirmando ou não a matriz de efeitos) e que ameaças à validade das medições existem.
]

#tab([Resultados das medições],
  tabela(
    colunas: (1.6cm, 1fr, 2cm, 2cm, 2cm, 2cm, 2cm),
    tamanho: 8.5pt,
    [Cenário], [Medição (o que se mede, unidade)], [Antes (_baseline_)], [Depois], [Valor-alvo], [Mínimo aceitável], [Atingido?],
    [QS-01], [E-1: espera p95 de um corte curto (s)], [13,0], [*1,7*], [≤ 2], [≤ 5], [Alvo],
    [QS-02], [E-2: espera p95 dos vídeos na rajada (s)], [21,5], [*8,1*], [≤ 8], [≤ 12],
      [Mínimo],
    [QS-02], [E-2 (secundária): tempo total da rajada (s)], [39,6], [*46,0*], [≤ 33], [—], [Não],
    [QS-02], [E-3: tempo até surgir uma réplica nova no _pool_ de legendagem (s)], [—], [*10*], [≤ 10], [≤ 20], [Alvo],
    [QS-02], [E-4: tempo até retirar a 1.ª réplica de legendagem depois de a fila esvaziar (s)], [—], [*51*], [≤ 60], [≤ 120],
      [Alvo],
    [QS-02], [E-4: memória sem carga (MB)], [3 258], [*2 030*], [≤ 3 420], [≤ 3 585], [Alvo],
    [QS-02], [E-4: memória no minuto seguinte à carga (MB)], [3 453], [*2 239*], [≤ 3 420], [≤ 3 585], [Alvo],
    [QS-02], [E-5: imagens por minuto (não deve piorar)], [41,7], [*41,8*], [≥ 41,7], [≥ 40], [Alvo],
    [QS-03], [R-1: trabalhos que terminam, F1–F6 (%)], [58,3], [*100*], [100], [≥ 95], [Alvo],
    [QS-03], [R-2: trabalhos concluídos com sucesso, F1–F4 (%)], [50], [*100* (40 de 40)], [≥ 99,5], [≥ 95],
      [Alvo],
    [QS-03], [R-3: atraso face à corrida sem falha (s): F1 / F2 / F3 / F4], [nunca / +26,1 / nunca /
      nunca], [*+4,1 / +17,4 / +3,9 / +4,8*], [≤ 30], [≤ 60], [Alvo],
    [QS-03], [R-5: resultados duplicados, F1–F4], [0], [*0*], [0], [0], [Alvo],
    [QS-04], [R-4: F5, erros comunicados em ≤ 10 s (%)], [50], [*100*], [100], [≥ 95], [Alvo],
    [QS-04], [R-4: F6, erros das imagens paradas comunicados em ≤ 50 s (%)], [0], [*100*], [100], [≥ 95], [Alvo],
  ),
)

*Análise dos resultados*

A medição inicial foi feita a 17 de novembro, sobre o _commit_ `a2c0772`, e a final a 23 de novembro, sobre o código
da _tag_ `final`, no mesmo ambiente, com os mesmos _scripts_ e 5 repetições por cenário. Na medição final o
_autoscaler_ esteve sempre ligado. Os dados estão em `fase2/bench/results/`. *No total, 12 dos 14 alvos foram
atingidos: a espera dos vídeos na rajada (E-2) ficou dentro do mínimo aceitável, e o tempo total da rajada, uma
métrica secundária, não foi atingido.*

*CAND-1 · Elasticidade.*
- *O que melhorou.* Um corte deixou de esperar pela legendagem: a espera p95 passou de 13,0 s para 1,7 s, o que
  confirma a H-01. Na rajada, surgiu uma réplica de legendagem em 10 s; a primeira réplica foi retirada 51 s depois
  de a fila esvaziar, e o _pool_ voltou ao estado inicial (sem réplicas de legendagem) cerca de 101 s depois. O
  _pool_ normal nunca precisou de mais réplicas, porque os cortes são curtos: os tempos do E-3 e do E-4 são todos do
  _pool_ de legendagem. As imagens por minuto não pioraram.
- *O que não foi atingido e porquê.* No S2, a espera p95 dos vídeos ficou em 8,1 s, 0,1 s acima do alvo, e o tempo
  total da rajada subiu de 39,6 s para 46,0 s. A causa é uma escolha de desenho: para poupar memória, o _pool_ de
  legendagem começa sem réplicas, por isso uma legendagem que precise de uma réplica nova espera cerca de 10 s. O
  _autoscaler_ reage em menos de um segundo, mas a réplica demora esse tempo a arrancar e a ligar-se à fila. Na
  rajada isto acontece duas vezes, e cada legendagem é ainda um pouco mais lenta por causa do limite de 4 CPUs. É
  também por isso que uma legendagem isolada passou de 16,5 s para 27,4 s.
- *Alternativa testada.* Com uma réplica de legendagem sempre ligada, num ensaio de uma só repetição, a espera do S2
  desceu para 5,2 s e a legendagem isolada para 19,6 s, e o tempo total ficou em 40,0 s, como na base. Não a
  adotámos porque aumenta a memória sem carga e não foi medida com 5 repetições. O alvo do tempo total (≤ 33 s) é
  difícil de atingir neste cenário: a 2.ª legendagem só é pedida aos 15 s, o vídeo só chega à fila 7 a 8 s depois do
  pedido (já era assim na base) e cada legendagem demora cerca de 13 s. *H-05*: esses 7 a 8 s são gastos no
  `projects` antes de enviar o trabalho, por exemplo a copiar o original para a pasta partilhada (EV-04); confirma-se
  medindo cada passo do pedido de _Apply_.
- *Memória.* A memória sem carga desceu de 3 258 MB para 2 030 MB, mas só parte desta descida se deve às nossas
  mudanças. Na base, o único _worker_ de vídeo ficava com o modelo de legendagem em memória depois de legendar
  (787 MB); agora a réplica normal nunca legenda (16 MB) e a de legendagem é retirada quando não há trabalho. Os
  restantes cerca de 570 MB vêm de outros contentores cuja memória depende do trabalho que fizeram antes da medição. Mesmo
  sem essa parte, a memória sem carga (cerca de 2 570 MB) fica abaixo do alvo.

*CAND-2 · Fiabilidade.*
- *O que melhorou.* Os 60 trabalhos das falhas F1–F6 terminaram todos (antes, 25 ficavam pendurados), e os 40
  trabalhos do F1–F4 terminaram com sucesso sem o utilizador repetir o pedido, o que confirma a H-02. As falhas que
  antes nunca recuperavam (F1, F3 e F4) recuperam agora em 4 a 5 s, e o F2 em 17,4 s. Os erros do F5 chegam todos ao
  utilizador em menos de 10 s e os do F6 dentro do prazo. Não houve resultados duplicados.
- *O caso do F6.* Só metade dos trabalhos do F6 termina com sucesso, e é o comportamento esperado: as imagens paradas
  ultrapassam o prazo de 30 s e o utilizador é avisado, enquanto a legendagem termina, porque 60 s de paragem é menos
  do que o prazo do vídeo (120 s).
- *Custo.* As corridas sem carga quase não mudaram (lote misto 2,29 → 2,40 s; 10 imagens 0,63 → 0,58 s; corte 0,79 →
  0,80 s), por isso o custo das confirmações é pequeno, como previsto na matriz de efeitos.

*Ameaças à validade.*
- Usámos uma só máquina e 5 repetições por cenário. As medianas são estáveis, mas com 5 valores o p95 é, na
  prática, o maior deles.
- O R-3 compara com a corrida sem falha da mesma campanha. Na medição final, a legendagem de referência é mais lenta,
  o que torna o atraso do F2 menor; comparando com a referência da base, seria de 28 s, ainda dentro do alvo.
- O tempo até surgir uma réplica só pode valer 5 ou 10 s, porque depende da frequência de amostragem.
- A memória sem carga depende do historial de cada contentor (ver acima), e o _autoscaler_, que corre fora dos
  contentores, não entra nessa soma.
- Os _scripts_ de medição foram ajustados depois da medição inicial (novas métricas para as réplicas e o R-4 do F6
  com o prazo do _watchdog_). As alterações estão documentadas em `fase2/bench/README.md` e foram aplicadas também
  aos dados da base, sem alterar nenhum valor anterior.
- Dois ajustes foram feitos com base nos ensaios, antes da medição final: a configuração usada pelo _autoscaler_ e o
  limite de 4 CPUs (capítulo 8).

== Preservação funcional

A preservação funcional verifica-se com o _script_ `fase2/tests/run-all.sh`, com a aplicação ligada. Este _script_
corre os testes automáticos do `projects` e do _worker_ de vídeo e uma suite de regressão de 30 casos, que usa a API
como um utilizador e compara cada resultado com o obtido na versão original. Os resultados de referência foram
guardados na base e nunca foram substituídos. Na base passavam 8 testes do `projects`, 74 do vídeo e os 30 casos de
regressão. No _commit_ final, a 24 de novembro, passaram todos (`fase2/tests/results/run-all-final.txt`), tal como
os testes do _autoscaler_ e da configuração das filas.

#tab([Preservação funcional e testes de regressão],
  tabela(
    colunas: (2.2cm, 3.2cm, 2.8cm, 4.4cm, 1fr),
    tamanho: 8pt,
    [Zona alterada], [Testes de regressão existentes (`Tools/video/tests`, `projects/tests`, …)], [Lacunas de teste], [Testes acrescentados], [Resultado (imagem e vídeo)],
    [DA-1: duas filas de vídeo, dois _pools_ e _autoscaler_],
      [Testes do vídeo e do `projects`; 7 casos de regressão de vídeo (corte, velocidade, filtros, geometria,
      combinação, legendas e extração de imagens) e um projeto misto],
      [Criar e remover réplicas reais não tem teste automático; foi verificado nos ensaios e na medição final],
      [Teste do encaminhamento dos vídeos; 182 testes do _autoscaler_; 15 testes da configuração das filas],
      [Os 7 casos de vídeo dão o mesmo resultado da base, incluindo a legendagem, agora feita no novo _pool_;
      _autoscaler_ 182/182; configuração 15/15],
    [DA-2: consumidor fiável, envio confirmado, DLQ, prazos e gravação sem duplicados],
      [Os mesmos, e os casos de regressão das 16 ferramentas de imagem, de um _pipeline_ com várias imagens, da
      pré-visualização, dos carregamentos recusados e da partilha],
      [As falhas F1–F6 não são testes automáticos: são cobertas pela medição. Um teste do vídeo não corre dentro do
      contentor, porque precisa do código das ferramentas de imagem],
      [Testes do consumidor fiável, das respostas de erro, do envio de mensagens, da DLQ, dos prazos e da gravação sem
      duplicados],
      [`projects`: 52/52 (base: 8); vídeo: 106 passam e 1 não corre (base: 74); regressão: 30/30],
  ),
)

#tab([Riscos para a preservação funcional e mitigação],
  tabela(
    colunas: (3.6cm, 2.8cm, 1fr, 4.2cm),
    tamanho: 8.5pt,
    [Risco], [Funcionalidade afetada (imagem / vídeo)], [Mitigação], [Teste de regressão],
    [Uma mensagem entregue duas vezes grava o resultado duas vezes], [Imagem e vídeo], [Gravação sem duplicados
      (TAT-11)], [Testes da gravação sem duplicados; R-5 = 0 nas falhas F1–F4],
    [O vídeo com legendas passa para outra fila e outro _worker_], [Vídeo (legendagem)], [O mesmo código nos dois
      _pools_; só muda a fila], [Teste do encaminhamento; caso de legendagem igual ao da base],
    [O _watchdog_ dá como falhado um trabalho lento, mas válido], [Imagens com IA e vídeos longos], [Prazo por tipo
      de trabalho e pela duração do vídeo; modelo da remoção de fundo incluído na imagem], [Testes dos prazos; caso
      da remoção de fundo depois de reconstruir a imagem],
    [As respostas de erro corrigidas mudam o que o utilizador vê], [Imagem (erros)], [É a mudança pretendida (classe
      B); as respostas de sucesso não mudam], [Testes das respostas de erro; R-4 do F5 = 100 %],
    [Retirar uma réplica interrompe um trabalho], [Vídeo], [Paragem controlada (8 s) e devolução à fila; só se
      retiram réplicas sem trabalho], [Testes do consumidor fiável e da remoção de réplicas],
  ),
)
