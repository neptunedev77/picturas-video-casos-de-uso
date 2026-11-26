#import "../template.typ": *

= Decisões Arquiteturais

#orientacao[
  *Origem:* Exercício 7, secção 3 do _template_.

  Uma decisão por cenário (`DA-1` para `QS-01`, `DA-2` para `QS-02`). Cada decisão é um pequeno registo, ao estilo ADR: o
  contexto, a tática escolhida, a estrutura ou padrão que a realiza, as alternativas consideradas e a razão da sua
  rejeição, as consequências positivas e negativas, e os elementos arquiteturais afetados.

  Só vale a pena registar uma decisão se havia *alternativas reais* (as táticas do capítulo 7 que não foram escolhidas).
  Justifiquem a escolha pelo cenário e pelas restrições da fase: rejeitem as táticas de classe C, porque a fase é de
  _refactoring_, e avaliem o risco de regressão do âmbito da alteração.

  *Depois de implementada*, completem cada decisão com as referências da implementação (_commits_ ou _pull requests_ no
  repositório entregue) e com os desvios face ao que foi decidido, explicando porquê. A vista «depois» do capítulo 9
  deve corresponder ao que foi efetivamente implementado.
]

As táticas escolhidas no capítulo 7 foram agrupadas em duas decisões, uma por candidato: a DA-1 responde ao QS-01 e
ao QS-02, e a DA-2 ao QS-03 e ao QS-04. Os valores indicados são os do código entregue.

== DA-1 — _Pools_ de _workers_ de vídeo por tipo de trabalho, com _autoscaler_ (cenário QS-01)

#tab([Decisão arquitetural DA-1],
  tabela-campos(
    [Contexto], [Um único _worker_ trata todos os vídeos, e uma legendagem bloqueia os cortes (QS-01; EV-06, EV-22);
      as réplicas são fixas e sem limites (QS-02; EV-11). Como a fase é de _refactoring_, o resultado de cada vídeo, a
      API e as notificações não podem mudar.],
    [Tática(s) escolhida(s)], [TAT-02 (fila e _pool_ próprios para a legendagem), TAT-01 (réplicas ajustadas à fila)
      e TAT-03 (limites de recursos). Para retirar réplicas, depende da TAT-12 da DA-2.],
    [Estrutura / padrão que a realiza], [_Competing Consumers_ elástico (ALT-1). Há dois _pools_ com o mesmo código:
      `video_tool`, para os vídeos sem legendas, e `video_heavy_tool`, para os vídeos com legendas, cada um com a sua
      fila. O `projects` escolhe a fila conforme o _pipeline_. Um _autoscaler_ consulta as filas a cada segundo e cria
      ou remove réplicas. Regras: o _pool_ normal tem 1 a 2 réplicas e o pesado 0 a 2, com um máximo de 3 réplicas de
      vídeo; acrescenta uma réplica quando há trabalho à espera, com pelo menos 5 s entre subidas; retira uma réplica
      depois de 40 s sem trabalho, com pelo menos 30 s entre descidas. Cada réplica tem no máximo 4 CPUs e 3 GiB. Para
      retirar uma réplica, o _autoscaler_ pede-lhe que pare, espera que termine e só depois a remove.],
    [Alternativas consideradas e razão de rejeição], [TAT-04 (fila com prioridades): não resolve com o único
      _worker_ ocupado. TAT-05 (mais CPU ou GPU): não é elástico e não há GPU utilizável. TAT-06 (posição na fila):
      funcionalidade nova. ALT-2 e ALT-3: custo de migração e risco de regressão demasiado altos (capítulo 4).],
    [Consequências positivas], [Os cortes deixam de esperar pelas legendagens; a capacidade acompanha a procura dentro
      de um limite; sem carga fica apenas uma réplica de vídeo ligada, o que reduz a memória.],
    [Consequências negativas / riscos], [Como o _pool_ pesado começa sem réplicas, a primeira legendagem espera que uma
      réplica arranque. Cada legendagem é um pouco mais lenta do que na base, onde não havia limite de CPU. O
      _autoscaler_ controla o Docker e tem de estar a correr; se parar, as legendagens ficam à espera na fila (não se
      perdem).],
    [Elementos arquiteturais afetados], [Encaminhamento dos vídeos no `projects` (`videoRouting.js`); configuração do
      Docker Compose e das filas do RabbitMQ; o _worker_ de vídeo passa a receber a fila por configuração; novo
      componente `fase2/autoscaler/`.],
    [Origem e âmbito do _refactoring_], [Interação: muda o padrão do vídeo (de um _worker_ para dois _pools_) e a
      implantação global (réplicas variáveis com limites). Risco de regressão baixo, porque o processamento de vídeo
      não muda.],
    [Classe (A/B/C)], [A: o utilizador obtém o mesmo resultado, apenas mais cedo.],
    [Implementação (_commits_ / _pull requests_)], [#link("https://github.com/neptunedev77/picturas-video-casos-de-uso/pull/7")[PR \#7] (filas, _pools_,
      encaminhamento e _autoscaler_) e #link("https://github.com/neptunedev77/picturas-video-casos-de-uso/pull/8")[PR \#8] (correção de configuração e limite de 4
      CPUs).],
    [Desvios face à decisão], [
      - *O _autoscaler_ corre fora do Docker Compose*, diretamente na máquina, e não como serviço, como estava
        previsto. Por isso tem de ser lançado à parte; o _script_ de medição lança-o e verifica que está ativo.
      - *Consulta as filas a cada 1 s*, em vez de 2 s.
      - *4 CPUs por réplica*, em vez de 2: com 2 CPUs uma legendagem de 60 s demorava 28 s, com 4 demora 19 s e sem
        limite 17,5 s. Com 3 réplicas usam-se no máximo 12 das 16 _threads_ da máquina.
      - *40 s sem trabalho antes de retirar uma réplica*, em vez de 60 s, para cumprir o alvo do E-4 (≤ 60 s).
      - *Ajuste antes da medição final:* o _autoscaler_ passou a considerar também o ficheiro
        `docker-compose.override.yml`, que o Docker Compose carrega automaticamente, para usar exatamente a mesma
        configuração.
      - Testámos manter sempre uma réplica de legendagem ligada, numa só repetição: a espera do S2 desceu de 8,1 s
        para 5,2 s. Não foi adotado porque aumenta a memória sem carga e não foi medido com 5 repetições
        (capítulo 10).],
  ),
)

== DA-2 — Entrega garantida e erros sempre comunicados (cenário QS-03)

#tab([Decisão arquitetural DA-2],
  tabela-campos(
    [Contexto], [Trabalhos que se perdem ou ficam pendurados quando uma ferramenta, o _worker_ de vídeo, o RabbitMQ ou
      o `projects` falham (QS-03; EV-10, EV-15, EV-16, EV-18, EV-23), e erros que não chegam ao utilizador (QS-04;
      EV-17, EV-21). As mudanças não podem alterar os resultados nem criar duplicados.],
    [Tática(s) escolhida(s)], [TAT-07 (confirmar no fim), TAT-08 (mensagens persistentes e filas replicadas), TAT-09
      (limite de tentativas e DLQ), TAT-10 (prazos e sinais de vida), TAT-11 (sem duplicados), TAT-12 (paragem
      controlada) e TAT-13 (respostas de erro corrigidas).],
    [Estrutura / padrão que a realiza], [
      - *Consumidor fiável comum* (`Tools/utils/reliable_consumer.py`), usado por 15 das 16 ferramentas de imagem e pelo
        vídeo (a marca d'água é um serviço à parte e ficou de fora). Cada _worker_ trata uma mensagem de cada vez, envia sinais de vida ao RabbitMQ enquanto trabalha e só
        confirma a mensagem depois de a resposta ter sido recebida pelo RabbitMQ. Quando lhe pedem para parar,
        espera até 8 s que o trabalho termine e, se não terminar, devolve-o à fila. Se o RabbitMQ falhar, volta a
        ligar-se sozinho.
      - *Envio fiável no `projects`*: uma ligação permanente, mensagens persistentes e confirmadas pelo RabbitMQ; um
        envio não confirmado é repetido.
      - *Filas replicadas com DLQ*: cada mensagem tem no máximo 5 tentativas e depois segue para a fila
        `picturas.dlq`; o `projects` lê essa fila, avisa o utilizador e devolve a quota reservada.
      - *Prazos no `projects`* (_watchdog_, verificados a cada 10 s): um passo de imagem sem resposta em 30 s, ou um
        vídeo sem resposta no maior valor entre 120 s e a duração do vídeo, é dado como falhado e o utilizador é
        avisado. É uma rede de segurança: os _workers_ que morrem ou param são detetados primeiro pela falta de sinais
        de vida.
      - *Sem duplicados*: uma resposta repetida é reconhecida pelo seu identificador e pelo identificador da execução
        (EV-26), e o resultado não é gravado outra vez.],
    [Alternativas consideradas e razão de rejeição], [Corrigir cada ferramenta separadamente: o mesmo código repetido
      em 16 sítios. Repetir os trabalhos a partir do orquestrador: não resolve uma falha do _worker_ a meio. Prazos só
      no _worker_: não resolvem um _worker_ morto ou parado. Eliminar duplicados na interface: os duplicados já
      estariam gravados. TAT-14 (botão «tentar de novo»): funcionalidade nova.],
    [Consequências positivas], [Nenhum trabalho fica pendurado; os trabalhos interrompidos são refeitos; os erros
      chegam ao utilizador; não há resultados duplicados; e passa a ser seguro retirar réplicas (DA-1).],
    [Consequências negativas / riscos], [Esperar a confirmação do RabbitMQ acrescenta algum tempo a cada envio. Erros
      que antes se perdiam passam a aparecer. Um trabalho que ultrapasse o prazo é dado como falhado: foi o que
      aconteceu à primeira remoção de fundo depois de reconstruir a imagem, que descarregava um modelo de 176 MB e
      demorava mais de 30 s.],
    [Elementos arquiteturais afetados], [Biblioteca comum dos _workers_ (`Tools/utils`), 15 ferramentas de imagem e o
      _worker_ de vídeo; no `projects`, o envio de mensagens, a leitura da DLQ, os prazos e a gravação sem
      duplicados; a configuração das filas do RabbitMQ.],
    [Origem e âmbito do _refactoring_], [Sobretudo o padrão global (envio, receção e orquestração), com efeito no vídeo
      (sinais de vida e paragem controlada). Risco de regressão médio, porque toca em todas as ferramentas; controlado
      com a suite de regressão (capítulo 10).],
    [Classe (A/B/C)], [B: os erros que antes se perdiam passam a ser mostrados ao utilizador, que é precisamente o
      objetivo da melhoria (a base já previa mostrá-los); o resto é A.],
    [Implementação (_commits_ / _pull requests_)], [_Commits_ `f01bec7` a `a0ed568`, de 18 e 19 de novembro, e
      #link("https://github.com/neptunedev77/picturas-video-casos-de-uso/pull/6")[PR \#6] (modelo da remoção de fundo incluído na imagem).],
    [Desvios face à decisão], [
      - *Filas replicadas (_quorum_)* em vez de filas simples persistentes, porque já suportam o limite de tentativas
        usado pela DLQ.
      - *Modelo da remoção de fundo incluído na imagem*: descarregá-lo no primeiro trabalho ultrapassava o prazo de
        30 s; o modelo e os resultados são os mesmos.
      - Ao arrancar, o _watchdog_ fechou cerca de 100 trabalhos que estavam pendurados desde execuções antigas.
      - *Limitação*: a ferramenta de marca d'água depende de um serviço externo e ficou sem esta proteção.],
  ),
)
