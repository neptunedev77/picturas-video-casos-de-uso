#import "../template.typ": *

= Impacto no Sistema Existente

#orientacao[
  Que elementos do PictuRAS existente (perfis, quotas, armazenamento, biblioteca, encadeamento, lote,
  exportação, …) e do documento de requisitos de base (UCnn, RFnn, RNFnn) são afetados pelas funcionalidades
  de vídeo. Para cada elemento: *Manter* (fica igual), *Estender* (passa a fazer mais) ou *Alterar* (muda o
  comportamento atual). Incluam todos os requisitos ALT e os NOVO que interagem com mecanismos existentes.
  Se duas funcionalidades afetam o mesmo elemento de forma diferente, há uma inconsistência a resolver aqui.
]

#tab([Impacto no sistema existente],
  tabela(
    colunas: (3.4cm, 1.9cm, 1fr, 2.1cm, 2.8cm),
    tamanho: 8.5pt,
    [Elemento existente afetado], [Impacto], [Descrição do impacto], [Caso(s) de uso], [Requisitos],

    [Perfis de utilização (Anónimo, Registado, Premium) (UC04)], [Alterar], [O perfil anónimo deixa de ter acesso às ferramentas de vídeo; cada ferramenta define limites de duração, resolução e tamanho por plano; o modo Bokeh da remoção de fundo fica reservado ao Premium.], [UC-VID-001 a 005], [REQ-VID-AUTH-001; REQ-VID-SIL-003, 004; REQ-VID-COMP-007, 017, 021, 022, 023, 024; REQ-VID-BLUR-002; REQ-VID-LEG-006, 007; REQ-VID-BG-006, 030],
    [Quota diária de operações (serviço de utilizadores) (RNF48)], [Alterar], [Cada processamento de vídeo de um utilizador Registado conta como uma operação, descontada a quem o executa e só quando termina com sucesso; o Premium não desconta e tem prioridade. A remoção de silêncios acrescenta um contador próprio de análises (15 por dia).], [UC-VID-001 a 005], [REQ-VID-QUOTA-001, 002, 003; REQ-VID-SIL-006; REQ-VID-BLUR-009, 011],
    [Projetos (serviço de projetos) (RNF45; UC04)], [Estender], [Os projetos passam a guardar vídeos (com duração e resolução), os resultados como novos ficheiros, as revisões da remoção de silêncios e o registo de cada trabalho de processamento; a versão do projeto é verificada antes de processar.], [UC-VID-001 a 005], [REQ-VID-STORE-001; REQ-VID-SIL-013, 022; REQ-VID-COMP-012; REQ-VID-LEG-019, 020, 033; REQ-VID-BG-015, 029],
    [Execução de processamentos e desempenho (RNF43)], [Alterar], [O limite de 1 minuto para operações com IA deixa de se aplicar ao vídeo: o processamento passa a ser assíncrono, com estado, progresso, cancelamento e um tempo máximo proporcional à duração do vídeo.], [UC-VID-001 a 005], [REQ-VID-SUBMIT-001, 002; REQ-VID-STATUS-001, 002; REQ-VID-CANCEL-001; REQ-VID-FAIL-001; REQ-VID-TIMEOUT-001; REQ-VID-SIL-020; REQ-VID-BLUR-012, 016; REQ-VID-BG-031],
    [Reversão, _Reset_ e imagem original (RF42, RF71, RF72, RNF61)], [Estender], [A garantia de que o original não perde qualidade passa a abranger o vídeo: nenhum processamento, cancelamento ou falha altera o vídeo original.], [UC-VID-001 a 005], [REQ-VID-ORIG-001; REQ-VID-BLUR-011],
    [Partilha de projetos por link (UC07, RF45, RF53, RNF44)], [Estender], [Quem tem um link de partilha com permissão de edição pode usar as ferramentas de vídeo; a operação é descontada a quem executa e os resultados ficam acessíveis segundo as permissões do link.], [UC-VID-001, 003, 004, 005], [REQ-VID-SEC-001; REQ-VID-QUOTA-002],
    [Segurança e privacidade dos dados (RNF44, RNF57)], [Estender], [Os vídeos e os resultados seguem as regras de acesso e de cifra das imagens; os ficheiros temporários do processamento são apagados no fim de cada trabalho.], [UC-VID-001 a 005], [REQ-VID-SEC-001; REQ-VID-CLEAN-001],
    [Deteção de pessoas e objetos (RF46)], [Estender], [A deteção passa a ser aplicada ao longo do vídeo: fotograma a fotograma a rostos e matrículas (anonimização) e, na remoção de fundo, à segmentação de pessoas num fotograma em cada três, com interpolação nos restantes.], [UC-VID-003, 005], [REQ-VID-BLUR-007, 022; REQ-VID-BG-011],
    [Sugestão de _upgrade_ (RF64)], [Estender], [A mensagem de funcionalidade restrita ao Premium passa a aparecer também quando a quota acaba e no modo Bokeh.], [UC-VID-003, 005], [REQ-VID-QUOTA-001; REQ-VID-BG-030],
    [Fila de mensagens (RabbitMQ)], [Estender], [Novas filas de pedidos e de resultados por ferramenta; nas filas de pedidos, os pedidos Premium têm prioridade.], [UC-VID-001 a 005], [REQ-VID-SUBMIT-001; REQ-VID-QUOTA-003; REQ-VID-ARCH-001],
    [Notificações em tempo real (_WebSocket_)], [Estender], [Novos eventos de estado e de progresso dos processamentos de vídeo, enviados a quem iniciou a operação.], [UC-VID-001, 003, 004, 005], [REQ-VID-STATUS-001, 002],
    [Armazenamento de ficheiros e _upload_ (Nginx, `imageStorageService`)], [Alterar], [Passa a aceitar e a servir vídeos MP4 (H.264/AAC) e ficheiros SRT; o limite de _upload_ passa a 100 MB. O MOV, previsto na RNG-02, ainda está por alinhar (ver Conflitos).], [UC-VID-001 a 005], [REQ-VID-INPUT-001; REQ-VID-STORE-001; REQ-VID-SEC-001; REQ-VID-ORIG-001; REQ-VID-LEG-020],
    [Ferramentas (`Tools`)], [Estender], [Cinco novos serviços de processamento de vídeo, independentes das ferramentas de imagem.], [UC-VID-001 a 005], [REQ-VID-ARCH-001, 002; REQ-VID-SIL-007, 008, 021; REQ-VID-COMP-008; REQ-VID-BLUR-007, 008; REQ-VID-LEG-010, 011, 012; REQ-VID-BG-011, 012, 013],
    [Interface do editor (_frontend_)], [Estender], [Leitor de vídeo, barra de ferramentas de vídeo e um diálogo por ferramenta (opções, progresso, revisão ou pré-visualização e resultado).], [UC-VID-001 a 005], [REQ-VID-SIL-001, 002, 010, 011, 012, 025; REQ-VID-COMP-005, 006, 013; REQ-VID-BLUR-001; REQ-VID-LEG-013, 014, 015, 028; REQ-VID-BG-001, 002, 003, 004, 005],
    [Configuração de arranque (`docker-compose`)], [Estender], [Cinco novos serviços na configuração, com as dependências de vídeo e de IA dentro das imagens.], [UC-VID-001 a 005], [REQ-VID-ARCH-002],
    [Encadeamento, processamento em lote, _presets_ e assistente IA (UC05, UC06, RF39, RF44, RF66)], [Manter], [Sem alterações: continuam a aplicar-se só a imagens; as ferramentas de vídeo são aplicadas a um vídeo de cada vez.], [UC-VID-001 a 005], [—],
  ),
)

== Conflitos entre funcionalidades

#orientacao[
  Pontos em que as funcionalidades foram especificadas ou implementadas de forma diferente. A resolução fica
  escrita nos requisitos comuns (Cap. 5.4); a coluna *Código* indica o que ainda tem de ser alinhado na implementação.
]

#tab([Conflitos entre funcionalidades e respetiva resolução],
  tabela(
    colunas: (3cm, 1fr, 4.2cm, 3.4cm),
    tamanho: 8.5pt,
    [Tema], [Diferença encontrada], [Resolução], [Código],
    [Momento do desconto da quota], [A compressão descontava ao arrancar e não devolvia se falhasse; as restantes reservam e devolvem.], [Só se desconta quando o processamento termina com sucesso (REQ-VID-QUOTA-002, RNG-04).], [Alinhado: a compressão devolve a operação em falha, tempo excedido e cancelamento.],
    [Nomes dos estados], [Cada caso de uso usa nomes diferentes (e.g., "em processamento", "concluído", `a_processar`).], [Cinco estados comuns: em fila, a processar, concluída, falhada, cancelada (REQ-VID-STATUS-001, RNG-06).], [Alinhado em todas as ferramentas: nomes comuns na interface (`lib/video-status.ts`); a remoção de silêncios e as legendas mostram ainda o passo "Pronta para revisão".],
    [Tempo máximo], [3× a duração + 60 s (silêncios, anonimização, fundo); a compressão usava 2× a duração e as legendas 1800 s fixos.], [3× a duração + 60 s no MVP (REQ-VID-TIMEOUT-001, RNG-08).], [Alinhado em todas as ferramentas.],
    [Prioridade Premium], [A compressão não usava a fila com prioridade; a anonimização e a remoção de fundo enviavam os pedidos Premium para uma fila separada (`high_priority_queue`) que nenhum serviço consumia, pelo que ficavam por processar.], [Todas as ferramentas dão prioridade ao Premium (REQ-VID-QUOTA-003, RNG-07).], [Alinhado em todas: prioridade de mensagem na fila de pedidos de cada ferramenta; a `high_priority_queue` deixou de ser usada.],
    [Acompanhamento em tempo real], [A compressão era acompanhada só por consulta periódica, sem _WebSocket_.], [Estado em tempo real em todas (REQ-VID-STATUS-001).], [Alinhado: evento `compression-update`.],
    [Persistência dos resultados], [A compressão guardava o resultado fora do projeto e não o apagava com o projeto; especificava "pelo menos 24 h".], [Os resultados ficam no projeto enquanto existirem (REQ-VID-STORE-001, RNG-03).], [Alinhado: o vídeo comprimido é acrescentado ao projeto.],
    [Acesso em projetos partilhados], [A compressão só permitia o dono; as restantes aceitam quem tem link de partilha com permissão.], [Acesso de quem tem permissão no projeto (REQ-VID-SEC-001); a operação é descontada a quem executa (RNG-05).], [Alinhado: link de edição para criar e cancelar, de leitura para consultar.],
    [Formatos de entrada], [MP4 (compressão, anonimização, legendas), MP4 e MOV (silêncios), MP4, WebM e MOV (fundo).], [MP4 e MOV (H.264/AAC) em todas, com saída sempre em MP4 (RNG-02, REQ-VID-INPUT-001).], [A alinhar: hoje o _upload_ (_frontend_, `imageStorageService` e `projects`) e as ferramentas só aceitam MP4.],
    [Limites por plano], [Os limites de duração, resolução e tamanho variam por ferramenta; as legendas não distinguem planos e os 500 MB / 2 GB da compressão não se atingem com o _upload_ limitado a 100 MB.], [Os limites podem variar por ferramenta, com justificação em cada caso de uso (UC-VID-001/A7, A8; UC-VID-002/A11; UC-VID-003/A6; UC-VID-004/A8; UC-VID-005/A4), e são verificados antes de o pedido entrar na fila (RNG-07). O limite efetivo de tamanho no MVP é o upload de 100 MB (Nginx); os valores acima são alvos
de produção (Cap. 2.1).], [Legendas: 10 min e PT/EN verificados antes da fila e de novo no serviço. Compressão: os 500 MB e 2 GB mantêm-se, mas o limite efetivo é o _upload_ de 100 MB.],
    [Títulos e pormenores dos documentos], [Cada caso de uso tinha um título diferente; o UC-VID-005 indicava "Grupo 25" e tinha texto do _template_; o UC-VID-004 repetia a DQ-008 como DQ-009.], [O mesmo título em todos os documentos; grupo 6; texto do _template_ retirado; a DQ-009 do UC-VID-004 passou a ser a decisão sobre o tempo máximo.], [Não se aplica (só documentação).],
  ),
)
