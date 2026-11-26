#import "../template.typ": *

= Vista Arquitetural Antes e Depois

#orientacao[
  *Origem:* Exercício 7, secção 4 do _template_.

  Duas vistas do mesmo diagrama: *antes* e *depois* das decisões. Usem o tipo de diagrama que melhor mostrar a alteração
  (componentes, implantação ou sequência). Destaquem os elementos ou as interações introduzidos ou alterados pelas
  táticas (com um estereótipo `«tática: …»` ou uma cor) e incluam uma *legenda*.

  As duas vistas devem ser comparáveis: mesma notação, mesma escala e os mesmos elementos de contexto, de modo a que a
  diferença se perceba a olho. A legenda e as notas explicam o que mudou entre elas e porquê.
]

As duas vistas são diagramas de componentes, no mesmo estilo da figura do capítulo 2, mas mostram apenas a parte do
sistema que as decisões alteram: a entrada, o orquestrador, as filas, os _workers_ e as notificações. O resto da
arquitetura não mudou. As duas figuras estão à mesma escala, para facilitar a comparação.

== Antes

#figure(
  image("../images/vista_antes.png", width: 66%),
  caption: [Vista arquitetural antes das decisões DA-1 e DA-2 (_commit_ `a2c0772`)],
) <fig-vista-antes>

== Depois

#figure(
  image("../images/vista_depois.png", width: 100%),
  caption: [Vista arquitetural depois das decisões DA-1 e DA-2 (_tag_ `final`), com os elementos alterados a verde],
) <fig-vista-depois>

== Legenda e notas

#tab([Legenda das vistas antes e depois],
  tabela(
    colunas: (5cm, 1fr),
    [Elemento (cor, forma ou estilo)], [Significado],
    [Seta laranja grossa], [Caminho do vídeo.],
    [Seta cinzenta], [Caminho das imagens e restante padrão global.],
    [Caixa ou fila verde-clara; seta verde], [Elemento ou interação novos ou alterados pelas táticas.],
    [Estereótipo `«tática: TAT-nn»`], [Tática do capítulo 7 que o elemento realiza.],
    [Caixa laranja-clara], [_Workers_ de vídeo.],
    [Seta tracejada], [Apenas leitura (o _autoscaler_ consulta as filas).],
  ),
)

*O que mudou e porquê*

- *Uma fila de vídeo passou a duas* (DA-1, TAT-02). Os vídeos com legendagem seguem para uma fila nova e os restantes
  para a fila original. Cada fila tem o seu _pool_ de _workers_, com o mesmo código. É isto que impede uma legendagem
  de bloquear um corte (QS-01).
- *O número de réplicas passou a variar* (DA-1, TAT-01 e TAT-03). O _autoscaler_ consulta as filas e cria ou remove
  réplicas, até um máximo de 3 réplicas de vídeo, cada uma com 4 CPUs e 3 GiB (QS-02).
- *As filas passaram a ser replicadas e a ter uma DLQ* (DA-2, TAT-08 e TAT-09). Uma mensagem que falha 5 vezes segue
  para a DLQ, e o `projects` avisa o utilizador e devolve a quota (QS-03, QS-04).
- *Os _workers_ passaram a usar o consumidor fiável* (DA-2, TAT-07, TAT-10, TAT-12 e TAT-13): só confirmam as mensagens no
  fim, enviam sinais de vida, terminam o trabalho antes de parar e enviam as respostas de erro corretamente. A
  exceção é a marca d'água, que é um serviço à parte e ficou de fora.
- *O `projects` ganhou novas responsabilidades* (DA-2, TAT-08, TAT-10 e TAT-11): envio confirmado das mensagens,
  controlo de prazos, leitura da DLQ e gravação sem duplicados.
- *O que não mudou*: a entrada, o WS Gateway, as filas das ferramentas de imagem e o envio do progresso do vídeo. O
  padrão global mantém-se, como previsto na ALT-1.
