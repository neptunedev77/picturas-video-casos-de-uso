#import "../template.typ": *

= Trade-offs, Cenários de Qualidade e Prioridades

#orientacao[
  *Origem:* Exercício 6, Bloco 2, secção 4 do _template_ (sem a justificação detalhada da matriz, que não faz parte
  deste relatório).

  *Objetivo do capítulo:* transformar o diagnóstico dos capítulos 2 a 4 em cenários de qualidade concretos e
  verificáveis, priorizá-los e perceber como os atributos se afetam uns aos outros.

  *Princípio central:* a caracterização dos cenários de qualidade *deve basear-se na identificação de fragilidades do
  sistema atual*. Cada cenário parte de uma fragilidade concreta, com evidência (`EV-nn`), observada na solução de
  base (e.g., uma falha sem recuperação, um ponto de contenção, uma dependência rígida). Um cenário sem fragilidade
  identificada é uma preferência, não uma necessidade. Reutilizem os `EV`, `H` e `ALT` já usados, sem os alterar.

  *Este é o único sítio onde os cenários de qualidade se caracterizam:* os capítulos 6 a 10 usam-nos sem os reescrever.
]

== Cenários de qualidade para a extensão de vídeo

#orientacao[
  Para cada fragilidade relevante, escrevam um cenário com os *seis elementos*:
  - *fonte do estímulo*: quem ou o que o origina (utilizador, serviço, falha de infraestrutura);
  - *estímulo*: o evento a que o sistema tem de reagir;
  - *artefacto*: a parte do sistema afetada;
  - *ambiente*: em que condições (carga normal, pico, degradado);
  - *resposta*: o que o sistema deve fazer;
  - *medida da resposta*: como se verifica, com métrica e escala. Definem-na vocês e tem de ser *verificável*.

  A coluna *Fragilidade* liga o cenário à evidência que o justifica. Não inventem valores de _baseline_, alvo ou
  mínimo: esses fixam-se após a medição inicial. A medida da resposta indica o que se mede, não o valor a atingir.
]

#paisagem[
#tab([Cenários de qualidade],
  tabela(
    colunas: (1.2cm, 3.4cm, 2.6cm, 2.2cm, 2.2cm, 2.4cm, 2.2cm, 2.6cm, 3cm),
    tamanho: 7.5pt,
    [ID], [Fragilidade na base (EV-nn)], [Característica (ISO/IEC 25010)], [Fonte do estímulo], [Estímulo], [Artefacto], [Ambiente], [Resposta], [Medida da resposta],
    [QS-01], [Um único _worker_ de vídeo trata um vídeo de cada vez: um corte curto espera que a legendagem em curso
      termine (EV-06, EV-11, EV-22)],
      [Eficiência de desempenho: comportamento temporal], [Utilizador],
      [Pede um corte de um vídeo de 10 s enquanto outro vídeo está a ser legendado], [Processamento de vídeo],
      [Carga normal (uma legendagem em curso)], [O corte começa sem esperar pela legendagem],
      [Tempo (s) entre o pedido e o primeiro sinal de progresso do corte: p95 e mediana em 5 repetições (cenário S1)],
    [QS-02], [Réplicas fixas e sem limites de recursos; todos os serviços sempre ligados (EV-11, EV-19, EV-22)],
      [Eficiência de desempenho: capacidade, utilização de recursos], [Vários utilizadores],
      [Rajada de 2 legendagens, 6 edições curtas e 20 projetos de imagem em 30 s], [_Workers_ de vídeo],
      [Pico de carga seguido de um período sem carga],
      [As réplicas aumentam enquanto a fila cresce e diminuem depois, dentro de um limite de recursos; as imagens não
      ficam mais lentas],
      [Espera p95 (s) dos vídeos e tempo total da rajada; tempo (s) até surgir e até ser retirada uma réplica; memória
      (MB); imagens por minuto (cenários S2 e S3)],
    [QS-03], [Mensagens confirmadas cedo demais, publicações que se podem perder, filas sem DLQ e trabalhos sem prazo
      (EV-10, EV-15, EV-16, EV-18, EV-23)],
      [Fiabilidade: tolerância a falhas, recuperabilidade], [Falha de infraestrutura],
      [Uma ferramenta de imagem, o _worker_ de vídeo, o RabbitMQ ou o `projects` falha a meio de um lote],
      [Filas, _workers_ e `projects`], [Um componente reinicia],
      [Os trabalhos terminam com sucesso, sem o utilizador repetir o pedido e sem resultados duplicados],
      [% de trabalhos que terminam; % concluídos com sucesso; atraso (s) face à mesma corrida sem falha; resultados
      duplicados (falhas F1 a F4)],
    [QS-04], [Os erros das ferramentas de imagem perdem-se e ninguém controla prazos (EV-17, EV-18, EV-21, EV-23)],
      [Fiabilidade: tolerância a falhas; Usabilidade: proteção contra erros], [Ferramenta],
      [Falha por parâmetros inválidos ou fica parada 60 s a meio de um trabalho], [`projects`, ferramentas e
      notificações], [Carga normal com uma ferramenta em falha],
      [O utilizador recebe uma mensagem de erro e o trabalho termina],
      [% de erros que chegam à interface dentro de um prazo (falhas F5 e F6)],
    [QS-05], [O ficheiro carregado fica inteiro em memória em três serviços, até 1100 MB por pedido (EV-01, EV-14,
      *EV-24*: `projects/routes/projects.js:72-73` e `imageStorageService/route/upload.js:6`)],
      [Eficiência de desempenho: utilização de recursos], [Utilizador _premium_], [Carrega um vídeo de 1 GB],
      [Serviços de entrada e armazenamento], [Vários carregamentos ao mesmo tempo],
      [O carregamento termina sem esgotar a memória], [Pico de memória (MB) dos serviços e duração (s) do
      carregamento],
    [QS-06], [O orquestrador concentra a lógica de todos os fluxos num ficheiro de 2732 linhas (EV-13)],
      [Manutenibilidade: modularidade, modificabilidade], [Equipa de desenvolvimento],
      [Precisa de alterar o fluxo do vídeo], [`projects`], [Desenvolvimento],
      [A alteração fica num só módulo, sem tocar no fluxo das imagens],
      [Número de ficheiros e de linhas alterados e de testes afetados],
  ),
)
]

#orientacao[
  *Priorização.* Avaliem cada cenário em duas dimensões: a *importância para os stakeholders* (quem sofre com a
  fragilidade e quanto) e a *dificuldade ou risco técnico* de a resolver. Justifiquem cada avaliação em poucas palavras
  e atribuam uma ordem de prioridade (1 = mais prioritário). Os dois cenários mais prioritários, e que dão origem aos
  candidatos a RNF do capítulo 6, são os mais importantes e viáveis, não necessariamente os mais fáceis.
]

#tab([Priorização dos cenários],
  tabela(
    colunas: (1.6cm, 4.8cm, 4.8cm, 2cm),
    [ID], [Importância para os stakeholders], [Dificuldade / risco técnico], [Prioridade],
    [QS-01], [*Alta* — afeta qualquer utilizador que edite um vídeo enquanto outro está a ser legendado: um corte de
      0,8 s passa a demorar mais de 12 s (EV-22)], [*Média* — separar as filas e acrescentar réplicas sem mudar o
      resultado], [1],
    [QS-02], [*Média* — afeta os picos de carga e o custo de manter tudo ligado], [*Alta* — exige um _autoscaler_,
      limites de recursos e retirar réplicas sem perder trabalho], [3],
    [QS-03], [*Alta* — o utilizador perde trabalho sem aviso: 25 de 60 trabalhos ficaram pendurados (EV-23)],
      [*Alta* — muda a forma como todas as ferramentas recebem e enviam mensagens, com risco de duplicados], [2],
    [QS-04], [*Alta* — o utilizador fica à espera sem saber que algo falhou], [*Média* — corrigir as respostas de
      erro e controlar prazos], [4],
    [QS-05], [*Média* — afeta só vídeos grandes, e não observámos falhas], [*Média* — mudar o carregamento em três
      serviços], [5],
    [QS-06], [*Baixa* — não afeta diretamente os utilizadores], [*Alta* — reorganizar um orquestrador grande, com
      resultados difíceis de medir], [6],
  ),
)

== Atributos de qualidade por ordem de prioridade

#orientacao[
  Com base nos cenários mais importantes, ordenem os atributos de qualidade (ISO/IEC 25010) do mais para o menos
  prioritário, indicando os cenários que justificam cada posição. A ordem tem de ser coerente com a tabela de
  priorização acima.
]

+ *Eficiência de desempenho (comportamento temporal e capacidade)* — QS-01 e QS-02. O bloqueio dos vídeos curtos
  atrás dos longos é o problema mais visível da extensão de vídeo.
+ *Fiabilidade (tolerância a falhas e recuperabilidade)* — QS-03 e QS-04. Perder trabalho é grave e, além disso, só
  é seguro retirar réplicas se os _workers_ não perderem trabalho quando são parados.
+ *Usabilidade (proteção contra erros)* — QS-04. Os erros têm de chegar ao utilizador.
+ *Eficiência de desempenho (utilização de recursos) no carregamento* — QS-05. É um risco real para vídeos grandes,
  mas não foi observado.
+ *Manutenibilidade (modularidade)* — QS-06. Útil para a equipa, mas sem impacto direto nos utilizadores.

== Pré-requisitos e efeitos colaterais entre atributos

#orientacao[
  Os atributos não são independentes. Identifiquem os pares em que melhorar um é *pré-requisito* do outro (e.g.,
  observabilidade antes de otimizar desempenho), em que há *sinergia*, ou em que há *conflito* (melhorar um degrada
  o outro). Expliquem a razão e, se possível, citem evidência.
]

#tab([Pré-requisitos e efeitos colaterais entre atributos],
  tabela(
    colunas: (2.8cm, 2.8cm, 4cm, 1fr),
    [Atributo A], [Atributo B], [Efeito (pré-requisito, sinergia ou conflito)], [Razão / evidência],
    [Fiabilidade], [Elasticidade], [Pré-requisito], [Só é seguro retirar uma réplica se o _worker_ terminar o trabalho
      em curso e só confirmar a mensagem no fim; com a confirmação automática das ferramentas (EV-15), parar uma
      réplica perde o trabalho.],
    [Fiabilidade], [Tempo de resposta], [Conflito], [Tornar as mensagens persistentes e esperar a confirmação do
      RabbitMQ acrescenta algum tempo a cada envio (EV-16); este custo tem de ser medido.],
    [Elasticidade], [Utilização de recursos], [Sinergia e conflito], [Retirar réplicas sem carga poupa memória, mas
      mais réplicas no pico gastam mais, e arrancar uma réplica do zero atrasa o primeiro trabalho (EV-19).],
    [Elasticidade], [Segurança], [Conflito], [Um _autoscaler_ que cria e remove contentores precisa de controlar o
      Docker (ALT-1).],
    [Fiabilidade], [Usabilidade], [Sinergia], [Prazos e uma DLQ transformam falhas silenciosas em erros que o
      utilizador vê (QS-04).],
    [Fiabilidade], [Correção funcional], [Conflito a controlar], [Uma mensagem entregue duas vezes pode gerar
      resultados duplicados, por isso os resultados têm de ser gravados sem duplicados e verificados por testes de
      regressão.],
  ),
)

== Recomendações de melhoria à solução atual

#orientacao[
  Recomendações concretas que respondem às fragilidades identificadas, indicando o atributo que melhoram, o padrão
  (global ou vídeo) a que se aplicam, o esforço estimado e o risco de regressão. Esta fase é de _refactoring_: as
  recomendações têm de poder ser aplicadas sem acrescentar funcionalidades.
]

#tab([Recomendações de melhoria],
  tabela(
    colunas: (1fr, 2.6cm, 3cm, 1.8cm, 2.2cm),
    tamanho: 8.5pt,
    [Recomendação], [Atributo(s)], [Padrão a que se refere (global / vídeo)], [Esforço], [Risco de regressão],
    [Separar os vídeos com legendagem numa fila e num _pool_ próprios (QS-01)], [Tempo de resposta], [Vídeo],
      [Baixo], [Baixo],
    [Ajustar o número de réplicas ao tamanho de cada fila, com limites de CPU e memória (QS-02)], [Capacidade,
      recursos], [Global e vídeo], [Alto], [Médio],
    [Confirmar as mensagens só no fim e terminar o trabalho em curso antes de parar, numa biblioteca comum a todas as
      ferramentas (QS-03)], [Tolerância a falhas, recuperabilidade], [Global], [Médio], [Médio],
    [Enviar mensagens persistentes e esperar a confirmação do RabbitMQ (QS-03)], [Tolerância a falhas], [Global],
      [Baixo], [Baixo],
    [Limitar as novas tentativas e enviar as mensagens que falham sempre para uma DLQ, avisando o utilizador (QS-03,
      QS-04)], [Tolerância a falhas, usabilidade], [Global], [Baixo], [Baixo],
    [Dar um prazo a cada trabalho e marcá-lo como falhado se não houver resposta (QS-04)], [Tolerância a falhas,
      usabilidade], [Global], [Médio], [Baixo],
    [Corrigir as respostas de erro e gravar os resultados sem duplicados (QS-03, QS-04)], [Tolerância a falhas,
      correção], [Global], [Baixo], [Médio],
    [Carregar os ficheiros por partes em vez de os guardar inteiros em memória (QS-05)], [Utilização de recursos],
      [Global], [Médio], [Médio],
    [Separar o fluxo do vídeo do resto do orquestrador (QS-06)], [Modularidade], [Vídeo], [Alto], [Alto],
  ),
)
