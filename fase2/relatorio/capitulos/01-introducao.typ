#import "../template.typ": *

= Introdução

#orientacao[
  Uma a duas páginas, no máximo. O leitor deve perceber, sem ler o resto, o que é este documento e em que se baseia.
  Respondam a:
  - *Propósito da fase*: que requisitos não funcionais do PictuRAS se pretende melhorar, por _refactoring_ e sem novas
    funcionalidades, e porquê.
  - *_Baseline_*: em que versão do sistema se basearam (_commit_ de partida), a mesma em todos os exercícios. Este
    relatório *estende* os documentos de base; não os reescreve.
  - *Âmbito do que é apresentado*: este relatório reúne os contributos dos Exercícios 6 (Blocos 1 e 2) e 7. Reutiliza
    os respetivos _templates_: copiem o conteúdo já preenchido, *mantendo os IDs* (`EV`, `H`, `ALT`, `QS`, `CAND`,
    `TAT`, `DA`), porque é através deles que os capítulos se encadeiam.
  - *Organização do documento*: Partes II (diagnóstico), III (qualidade), IV (táticas, decisões, medição e resultados)
    e V (síntese).
]

== Propósito e âmbito

Nesta fase, o objetivo foi melhorar dois requisitos não funcionais (RNF) do PictuRAS através de _refactoring_, ou
seja, sem acrescentar funcionalidades. Escolhemos dois RNF de características diferentes da ISO/IEC 25010:

- *Elasticidade* (eficiência de desempenho). Na solução de base existe um único _worker_ de vídeo, por isso uma
  legendagem demorada bloqueia todos os outros vídeos. Além disso, o número de réplicas é fixo e nenhum serviço tem
  limites de CPU ou de memória.
- *Fiabilidade* (tolerância a falhas e recuperabilidade). Quando um contentor, o RabbitMQ ou o orquestrador falham a
  meio de um trabalho, esse trabalho pode perder-se e ficar "em processamento" para sempre. Os erros das ferramentas de
  imagem também nunca chegam ao utilizador.

Os dois requisitos estão ligados: só é seguro retirar réplicas quando há pouca carga (_scale-in_) se os _workers_ não
perderem o trabalho que estão a fazer quando são parados.

O foco é a extensão de vídeo, mas analisada dentro do padrão global da solução, que são microsserviços que comunicam
por filas de mensagens. Algumas mudanças afetam também as imagens, porque as ferramentas de imagem e de vídeo recebem
mensagens da mesma forma. Para garantir que o comportamento se mantém, usámos uma suite de regressão com 30 casos,
comparados com os resultados da versão original (capítulo 10).

Para cada RNF seguimos o mesmo ciclo: definir o requisito, quantificá-lo, medir a solução de base, fazer o
_refactoring_ e medir de novo. Os alvos foram fixados depois da medição inicial e não mudaram, e as duas medições usam
os mesmos instrumentos.

== _Baseline_ e repositório
#tab([Artefactos de partida],
  tabela(
    colunas: (5cm, 1fr),
    [Artefacto], [Versão / referência],
    [Documento de requisitos de base], [doc-ext-requisitos-2627.pdf (Fase 1 de 2026/27, Grupo 4: extensão de vídeo)],
    [Documento de solução arquitetural de base], [doc-sol-arquitetural.pdf (Fase 2 de 2025/26)],
    [Solução de base], [`picturas-um/picturas-27` (PictuRAS v27.1), _commit_ `0523102`],
    [Repositório de partida], [#link("https://github.com/neptunedev77/picturas-video-casos-de-uso")[`github.com/neptunedev77/picturas-video-casos-de-uso`],
      _commit_ `a2c0772`, com a solução de base em `fase2/picturas-27`, sem alterações. A _tag_ `baseline` acrescenta
      só os instrumentos de medição, os testes de regressão e os resultados da medição inicial.],
    [Repositório entregue], [O mesmo repositório. A _tag_ `final` contém o código e os resultados da medição final.
      _Commit_ da entrega: #preencher[hash do _commit_ entregue]],
    [Diretrizes da Fase 2], [Versão 1],
  ),
)

== Exercícios e versões usadas

#orientacao[
  Indiquem, para cada exercício, a versão do enunciado e do _template_ que usaram, e a versão do vosso documento que
  serviu de entrada ao exercício seguinte (Bloco 1 → Bloco 2 → Exercício 7). Isto garante que quem avalia consegue
  perceber a que regras o trabalho respondeu, caso os enunciados tenham sido atualizados durante a fase.
]

Os Exercícios 6 e 7 não foram entregues como documentos separados. Os capítulos correspondentes foram escritos
diretamente neste relatório, seguindo a estrutura dos _templates_, e os IDs (`EV`, `H`, `ALT`, `QS`, `CAND`, `TAT`,
`DA`) são atribuídos aqui pela primeira vez.

#tab([Exercícios que alimentam este relatório],
  tabela(
    colunas: (1fr, 2.4cm, 2cm, 2cm),
    [Exercício (estrutura seguida)], [Capítulos], [Enunciado], [Template],
    [Exercício 6, Bloco 1: padrões arquiteturais], [2, 3 e 4], [1.1], [1.1],
    [Exercício 6, Bloco 2: trade-offs, cenários e candidatos a RNF], [5 e 6], [1.1], [1.1],
    [Exercício 7: táticas arquiteturais], [7 a 10], [3.0], [3.0],
  ),
)

== Organização do documento

- *Parte II, diagnóstico* (capítulos 2 a 4): como a solução foi lançada, a arquitetura com o caminho do vídeo, os
  padrões atuais e as alternativas. As afirmações sobre o sistema apoiam-se numa evidência (`EV-nn`) ou são assumidas
  como hipóteses (`H-nn`).
- *Parte III, qualidade* (capítulos 5 e 6): os cenários de qualidade (`QS-nn`), construídos a partir das fragilidades
  encontradas, e os dois candidatos a RNF (`CAND-n`) com as respetivas métricas.
- *Parte IV, solução e resultados* (capítulos 7 a 10): as táticas (`TAT-nn`), as decisões arquiteturais (`DA-n`), a
  arquitetura antes e depois, os resultados das medições e a preservação funcional.
- *Parte V, síntese* (capítulos 11 e 12): conclusões e utilização de IA.

Os IDs ligam os capítulos entre si: as evidências e hipóteses sustentam as alternativas e os cenários, cada candidato
parte de um cenário, as táticas respondem a esse cenário e cada decisão junta táticas que são avaliadas no capítulo 10.
