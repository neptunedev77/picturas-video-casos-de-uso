#import "../template.typ": *

= Alternativas e Matriz de Comparação

#orientacao[
  *Origem:* Exercício 6, Bloco 1, secção 3 do _template_.

  *Objetivo do capítulo:* comparar o padrão atual com alternativas relevantes *para o processamento de vídeo*, de forma
  fundamentada, e concluir se o padrão atual é adequado. Entre duas e três alternativas. O padrão global é o contexto da
  comparação: indiquem sempre se cada alternativa o *mantém* ou o *altera*.

  *Restrição da fase:* é de _refactoring_. As alternativas têm de preservar o comportamento funcional; por isso, o
  custo e o risco de migração têm de ser analisados para cada uma. Consultem os slides da aula 11 e o documento de apoio
  de padrões arquiteturais; se for relevante, incluam uma alternativa ao próprio padrão global como termo de comparação.
]

== Alternativas consideradas

#tab([Alternativas consideradas],
  tabela(
    colunas: (1.4cm, 3.4cm, 1fr, 2.8cm, 2.6cm),
    tamanho: 8.5pt,
    [ID], [Nome / padrão], [Descrição breve], [Mantém ou altera o padrão global?], [Fonte],
    [ALT-1], [_Competing Consumers_ elástico, com _pools_ por tipo de trabalho e consumo fiável],
      [Os vídeos com legendagem passam a ter uma fila e um grupo de _workers_ (_pool_) próprios. Um _autoscaler_ ajusta
      o número de réplicas de cada _pool_ ao tamanho da fila, dentro de limites. Os _workers_ só confirmam uma
      mensagem quando terminam, as mensagens que falham repetidamente vão para uma fila própria (DLQ) e o `projects`
      dá como falhado um trabalho que não responde dentro de um prazo.],
      [Mantém], [Documento de apoio, secção 7; slides da aula 11],
    [ALT-2], [_Pipes and Filters_ distribuído],
      [O _pipeline_ de vídeo é dividido em etapas, cada uma com o seu serviço e a sua fila (por exemplo, legendagem,
      efeitos, corte), e o `projects` conduz a cadeia, como já faz nas imagens.],
      [Mantém (aproxima o vídeo das imagens)], [Documento de apoio, secção 6; slides da aula 11],
    [ALT-3], [Microsserviços sobre Kubernetes (k3s) com KEDA],
      [A implantação passa de Docker Compose para Kubernetes. O KEDA ajusta as réplicas ao tamanho das filas, e o
      Kubernetes reinicia contentores, limita recursos e para-os de forma controlada.],
      [Altera (muda a implantação de todos os serviços)], [Documento de apoio, secção 3; documentação do KEDA],
  ),
)

Considerámos ainda uma *fila com prioridades*, que daria prioridade aos cortes curtos, mas pusemo-la de parte: com um
único _worker_ ocupado numa legendagem, a prioridade só escolhe o trabalho seguinte, e o corte continua à espera que
a legendagem termine (EV-06).

== Análise de cada alternativa

#orientacao[
  Copiem o bloco abaixo para cada alternativa. Para cada uma, descrevam a coerência com o padrão global, o efeito nos
  atributos de qualidade, as vantagens, as desvantagens ou riscos, e o custo e risco de migração. Evitem listas
  genéricas: cada ponto deve referir algo concreto da solução do PictuRAS (e citar evidência `EV-nn` ou hipótese `H-nn`).
]

*ALT-1 — _Competing Consumers_ elástico, com _pools_ por tipo de trabalho e consumo fiável*

#tabela-campos(
  [Coerência com o padrão global], [Total. Usa as mesmas filas, o mesmo armazenamento e o mesmo Docker Compose (EV-10,
    EV-11, EV-12). O `projects` passa apenas a escolher a fila de cada vídeo e a vigiar prazos, e o _worker_ de vídeo é
    o mesmo, lançado em dois _pools_.],
  [Efeito nos atributos de qualidade], [Melhora o tempo de resposta e a capacidade, porque um corte deixa de esperar
    por uma legendagem e cada _pool_ ganha réplicas quando a fila cresce. Melhora a fiabilidade, porque nenhum trabalho
    se perde nem fica pendurado. Piora um pouco a segurança, porque o _autoscaler_ controla o Docker.
    *H-01*: separar os trabalhos leves dos pesados e ajustar as réplicas à fila reduz a espera de um corte para perto
    do tempo de arranque de uma réplica (4,8 s, EV-19); confirma-se com as métricas E-1 a E-4 (capítulo 10).
    *H-02*: com o consumo fiável, a DLQ e o _watchdog_, todos os trabalhos das falhas F1–F6 terminam com sucesso ou com
    o erro comunicado; confirma-se com as métricas R-1 a R-5 (capítulo 10).],
  [Vantagens potenciais], [Resolve as duas fragilidades do capítulo 3 sem mudar de padrão: o bloqueio dos vídeos
    curtos (EV-06, EV-22) e os trabalhos perdidos ou pendurados (EV-15, EV-16, EV-18, EV-23). Uma única biblioteca de
    consumo serve as ferramentas de imagem e o vídeo, e o vídeo continua a ser lido e gravado uma só vez (EV-20).],
  [Desvantagens ou riscos], [Um componente novo (o _autoscaler_) com acesso ao Docker. Só é seguro retirar réplicas se
    o _worker_ terminar o trabalho em curso antes de sair, ou seja, a elasticidade depende da fiabilidade. Arrancar uma
    réplica a partir de zero atrasa o primeiro trabalho. Como as mensagens podem ser entregues mais do que uma vez, os
    resultados têm de ser gravados sem duplicados.],
  [Custo e risco de migração (a funcionalidade existente tem de ser preservada)], [Baixo. Não há serviços novos no
    caminho do pedido nem mudanças na API ou nas notificações. Os riscos (resultados duplicados e erros que passam a
    ser visíveis) controlam-se com a gravação sem duplicados e com a suite de regressão (capítulo 10).],
)

*ALT-2 — _Pipes and Filters_ distribuído*

#tabela-campos(
  [Coerência com o padrão global], [Alta: o vídeo passa a funcionar como as imagens, com uma mensagem por etapa e o
    `projects` a conduzir a cadeia (EV-13).],
  [Efeito nos atributos de qualidade], [Melhora a capacidade, se cada etapa tiver réplicas próprias, e a legendagem
    deixa de ocupar o _worker_ dos cortes. Mas piora o tempo de cada vídeo. *H-03*: cada etapa volta a ler e a gravar o
    vídeo inteiro, pelo que um _pipeline_ de _n_ etapas demora perto de _n_ vezes mais e perde qualidade a cada
    gravação; confirma-se medindo o mesmo _pipeline_ de 3 efeitos numa e em 3 etapas. Sem _autoscaler_, as réplicas
    continuam fixas.],
  [Vantagens potenciais], [Etapas pequenas e independentes; o `projects` sabe em que etapa está cada vídeo; uma falha
    obriga a repetir só uma etapa.],
  [Desvantagens ou riscos], [Perde-se a vantagem de ler e gravar o vídeo uma só vez (EV-20) e surgem ficheiros
    intermédios que podem chegar a 1 GB (EV-12). O progresso em percentagem (EV-07) teria de ser calculado a partir de
    várias etapas, e o orquestrador, que já é grande (EV-13), ficaria mais complexo. Sozinha, não resolve a
    fiabilidade.],
  [Custo e risco de migração], [Alto. É preciso dividir o processamento de vídeo em serviços e mudar o encadeamento no
    `projects`. O risco de regressão é elevado, porque o corte, a velocidade e a sincronização entre áudio e imagem
    são hoje resolvidos de uma só vez.],
)

*ALT-3 — Microsserviços sobre Kubernetes (k3s) com KEDA*

#tabela-campos(
  [Coerência com o padrão global], [Mantém os microsserviços e as filas, mas muda a forma de implantar e operar todo o
    sistema: os 32 serviços e 7 volumes do Docker Compose (EV-11) teriam de passar para Kubernetes.],
  [Efeito nos atributos de qualidade], [Melhora a capacidade e a elasticidade com ferramentas maduras. Não resolve, por
    si só, a perda de mensagens: a confirmação automática, a falta de DLQ e a falta de prazos (EV-10, EV-15, EV-18)
    continuam a exigir as mesmas mudanças da ALT-1. *H-04*: o k3s e o KEDA ocupam memória e CPU significativas numa
    máquina de 16 GB que já usa 3,2 GB sem carga (EV-22), e a pasta partilhada teria de ser acessível a partir de
    várias máquinas; confirma-se instalando o k3s na máquina de referência e medindo a memória sem carga.],
  [Vantagens potenciais], [Ajuste automático de réplicas, limites de recursos e paragem controlada já testados, e
    permissões do _autoscaler_ mais restritas do que o acesso total ao Docker.],
  [Desvantagens ou riscos], [Uma tecnologia nova para toda a equipa e uma plataforma diferente da que os outros grupos
    e os docentes usam. Mais memória ocupada sem carga (H-04).],
  [Custo e risco de migração], [Muito alto para uma fase de _refactoring_: seria preciso refazer toda a implantação e
    voltar a validar todos os fluxos, com risco de afetar funcionalidades que nada têm a ver com o vídeo.],
)

#paisagem[
== Matriz de comparação de padrões

#orientacao[
  Atribuam um nível a cada atributo para o padrão global (referência), para o padrão atual do vídeo e para cada
  alternativa. A escala é à vossa escolha (e.g., Alto / Médio / Baixo) e deve ser a mesma em toda a matriz.

  *Justifiquem cada célula* com evidência da solução (`EV-nn` ou `H-nn`) numa frase curta, logo na própria célula: as
  avaliações sem fundamento não são valorizadas. A matriz inclui o padrão global como referência para se ver o que
  cada alternativa ganha ou perde em relação a ele. Os atributos e subcaracterísticas seguem a ISO/IEC 25010; podem
  acrescentar linhas para outros atributos relevantes.
]

#tab([Matriz de comparação de padrões (escala: Alto / Médio / Baixo)],
  tabela(
    colunas: (3.6cm, 4cm, 4cm, 4cm, 4cm, 4cm),
    tamanho: 8pt,
    [Atributo de qualidade (ISO/IEC 25010)], [Padrão global atual (referência)], [Padrão atual do vídeo], [ALT-1], [ALT-2], [ALT-3],
    [Relação com o padrão global], [—], [Afasta-se em parte], [Mantém], [Mantém], [Altera (implantação)],
    [Eficiência de desempenho: comportamento temporal],
      [*Médio* — as imagens são rápidas (10 imagens × 3 filtros em 0,63 s), mas a capacidade é fixa (EV-22)],
      [*Baixo* — um corte de 0,8 s espera 12,3 s atrás de uma legendagem (EV-06, EV-22)],
      [*Alto* — os cortes têm um _pool_ próprio e a fila pesada ganha réplicas (H-01)],
      [*Médio* — a legendagem deixa de bloquear os cortes, mas cada etapa volta a gravar o vídeo (H-03)],
      [*Alto* — o mesmo efeito da ALT-1 (H-04)],
    [Eficiência de desempenho: capacidade / elasticidade],
      [*Baixo* — um contentor fixo por serviço; aumentar é manual (EV-11, EV-19)],
      [*Baixo* — um único _worker_, um vídeo de cada vez (EV-06)],
      [*Alto* — réplicas ajustadas à fila, dentro de limites (H-01)],
      [*Médio* — cada etapa pode ter réplicas, mas fixas],
      [*Alto* — ajuste automático, limitado pela memória da máquina (H-04)],
    [Fiabilidade: tolerância a falhas / recuperabilidade],
      [*Baixo* — mensagens confirmadas cedo demais, publicações que se perdem, sem DLQ nem prazos; 25 de 60 trabalhos
      pendurados (EV-10, EV-15, EV-16, EV-18, EV-23)],
      [*Médio* — recupera de uma falha do _worker_ (F2: 5 de 5), mas não deteta um _worker_ parado (EV-08, EV-21)],
      [*Alto* — consumo fiável, DLQ e _watchdog_ (H-02)],
      [*Médio* — mais etapas, mais pontos de falha; precisa das mesmas mudanças],
      [*Médio* — reinicia contentores, mas as mensagens continuam a perder-se sem as mudanças da ALT-1],
    [Manutenibilidade: modularidade / modificabilidade],
      [*Médio* — serviços independentes, mas um orquestrador de 2732 linhas (EV-13)],
      [*Médio* — o _pipeline_ num só módulo é fácil de testar (EV-20), mas mistura trabalho leve e pesado],
      [*Médio* — acrescenta o _autoscaler_ e uma biblioteca partilhada; o orquestrador muda pouco],
      [*Baixo* — mais serviços e mais lógica no `projects` (EV-13)],
      [*Baixo* — implantação nova para 32 serviços],
    [Segurança],
      [*Médio* — entrada única com TLS e autenticação (EV-14, EV-01)],
      [*Médio* — igual ao padrão global],
      [*Médio* — o _autoscaler_ controla o Docker (risco novo a mitigar)],
      [*Médio* — igual ao padrão global],
      [*Médio* — permissões mais restritas, mas uma nova interface a proteger],
    [Usabilidade: operabilidade],
      [*Médio* — os erros das ferramentas de imagem não chegam ao utilizador (EV-17)],
      [*Médio* — mostra o progresso (EV-07), mas não avisa quando o _worker_ para (EV-23)],
      [*Alto* — erros sempre comunicados e esperas curtas (H-01, H-02)],
      [*Médio* — o progresso tem de ser recalculado a partir das etapas],
      [*Médio* — sem efeito direto para o utilizador],
  ),
)
]

== Adequação do padrão atual

O *padrão global* (microsserviços sobre filas de mensagens) é adequado e decidimos mantê-lo: já separa cada ferramenta
num contentor que pode ter mais réplicas sem mudar o código (EV-19) e desacopla quem pede de quem processa (EV-05). Os
problemas estão em decisões tomadas dentro dele: réplicas fixas e sem limites (EV-11), mensagens que podem perder-se
(EV-10, EV-15, EV-16) e trabalhos sem prazo (EV-18). Já o *padrão do vídeo*, um único _worker_ que faz todo o
_pipeline_, funciona bem para um vídeo isolado (EV-20), mas não serve os requisitos identificados: deixa os trabalhos
curtos presos atrás dos longos (EV-22) e trabalhos pendurados sem aviso (EV-23).

Das três alternativas, a *ALT-1* é a que melhor resolve os dois problemas com o menor custo de migração: mantém o
padrão global e a forma eficiente de processar o vídeo, e muda apenas o número de _workers_, a forma de receber as
mensagens e o controlo dos prazos. A ALT-2 resolve o bloqueio, mas torna cada vídeo mais lento e o orquestrador mais
complexo, sem tratar a fiabilidade. A ALT-3 usa ferramentas mais maduras, mas migrar toda a implantação é
desproporcionado numa fase de _refactoring_ e não dispensa as mudanças de fiabilidade da ALT-1. Por isso, seguimos a
ALT-1 (capítulos 7 e 8).
