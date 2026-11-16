#import "../template.typ": *

= Alterações Arquiteturais

#orientacao[
  Partam do documento de solução arquitetural de base e descrevam apenas o *delta* introduzido pelo suporte a
  vídeo. O nível de detalhe é o de um MVP: o suficiente para que outra equipa perceba, mantenha e estenda a
  solução na Fase 2. Cada alteração deve estar ligada aos requisitos que a motivam.
]

== Visão geral das alterações

#orientacao[
  A vista de componentes é *opcional*: incluam-na se ajudar a perceber as alterações. A tabela de componentes
  novos e alterados é suficiente.
]

#figure(
  image("../images/projeto/arquitetura_componentes.png", width: 100%),
  caption: [Vista de componentes da solução com suporte a vídeo ],
)

As alterações são descritas em relação à solução de base (_commit_ `781a63e`). O suporte a vídeo foi
acrescentado sem mudar a organização em microsserviços: cada funcionalidade de vídeo tem o seu próprio serviço
de processamento ligado ao RabbitMQ, e os serviços existentes foram estendidos para aceitar e reproduzir vídeos,
guardar o estado dos trabalhos, contar operações e notificar o _frontend_. Todas as ferramentas leem e escrevem
os ficheiros no volume partilhado `image_data`, que passa a conter também vídeos. Ficam inalterados o
SeaweedFS, o serviço de subscrições (planos Free e Premium), o `generative-mock`, a cópia de segurança das bases
de dados e as ferramentas de imagem.

#tab([Componentes novos e alterados],
  tabela(
    colunas: (3.2cm, 1.8cm, 1fr, 3cm),
    [Componente / serviço], [Estado], [Responsabilidade / alteração], [Requisitos],

    // ---------------------------------------------------------------- ferramentas de vídeo (novas)
    [`privacy_blur_tool`], [Novo], [Ferramenta de anonimização (UC-VID-003): deteção de rostos e matrículas com OpenCV (Haar) e desfoque em cada fotograma com FFmpeg; progresso enviado por _WebSocket_.], [REQ-VID-BLUR-007, 008, 016; REQ-VID-CLEAN-001; REQ-VID-ARCH-001, 002],
    [`silence_removal_tool`], [Novo], [Ferramenta de remoção de silêncios (UC-VID-001): análise do áudio, cortes no som e na imagem com FFmpeg e verificação da sincronização; até 2 pedidos em simultâneo; cancelamento por mensagem; filas de pedidos e de resultados próprias.], [REQ-VID-SIL-007, 008, 021, 023, 030; REQ-VID-ARCH-001, 002],
    [`video_compression_tool`], [Novo], [Ferramenta de compressão (UC-VID-002): recodificação com FFmpeg segundo o nível de qualidade escolhido; filas de pedidos e de resultados próprias.], [REQ-VID-COMP-008, 033, 035; REQ-VID-SUBMIT-001; REQ-VID-FAIL-001; REQ-VID-TIMEOUT-001],
    [`subtitle_generation_tool`], [Novo], [Ferramenta de legendas (UC-VID-004): reconhecimento de fala com _faster-whisper_ (CPU, INT8) e geração do SRT; filas de pedidos, resultados e cancelamento; volumes para o modelo e para o estado do _worker_.], [REQ-VID-LEG-010, 011, 012; REQ-VID-ARCH-001, 002; REQ-VID-TIMEOUT-001],
    [`video_bg_remove_tool`], [Novo], [Ferramenta de remoção de fundo (UC-VID-005): silhueta com ONNX (`u2netp`, embutido na imagem, num fotograma em cada três) e FFmpeg e substituição por _chroma key_, cor sólida ou _bokeh_; fila de pedidos com prioridade.], [REQ-VID-SUBMIT-001, 002; REQ-VID-BG-011, 012, 013, 031; REQ-VID-ARCH-001, 002; REQ-VID-TIMEOUT-001],

    // ---------------------------------------------------------------- serviços existentes alterados
    [Nginx], [Alterado], [Limite de upload aumentado para 100 MB (`client_max_body_size`) e pedidos _Range_ encaminhados, para reproduzir vídeo no browser; CORS no acesso ao armazenamento de objetos.], [REQ-VID-SIL-025; REQ-VID-OUTPUT-001],
    [_Frontend_ (Next.js)], [Alterado], [Leitor e pré-visualização de vídeo; upload de vídeos; barra de ferramentas de vídeo; diálogos de desfoque, remoção de silêncios (com linha temporal de revisão), remoção de fundo, compressão e legendas (com pré-visualização sincronizada).], [REQ-VID-SIL-001, 010, 011, 025, 035; REQ-VID-BLUR-001; REQ-VID-STATUS-001, 002; REQ-VID-COMP-005, 006; REQ-VID-LEG-013, 028; REQ-VID-BG-002, 003],
    [API Gateway], [Alterado], [Novas rotas autenticadas por JWT (`/silence`, `/subtitles`, `/compression`) que encaminham os pedidos de vídeo para o `projects`, indicando quem executa a operação (`X-Caller-Id`); a compressão devolve o resultado em _streaming_.], [REQ-VID-SEC-001; REQ-VID-AUTH-001],
    [WS Gateway], [Alterado], [Novos eventos: `video-progress`, `silence-update` e `subtitle-update` (este com validação do conteúdo), enviados só à sala do utilizador; eventos de projeto `IMAGE_ADDED` / `IMAGE_REMOVED` quando um vídeo resultante é acrescentado ou apagado.], [REQ-VID-STATUS-001, 002],
    [Users], [Alterado], [Quota de operações de vídeo; contador diário das análises de remoção de silêncios (campo `silence_analyses`), com pedidos para consultar, reservar e devolver uma análise.], [REQ-VID-SIL-006; REQ-VID-QUOTA-001, 002, 003; REQ-VID-BLUR-009],
    [Projects], [Alterado], [Metadados de vídeo (duração, resolução, tipo); rotas `silence`, `subtitles` e `compression`; modelos de trabalho `silenceJob`, `subtitleJob` e `compressionJob` (novas coleções no MongoDB); limites por plano, quota de operações avançadas e prioridade premium; tempo máximo proporcional à duração; anónimos bloqueados nas ferramentas de vídeo (403); apagar um vídeo ou projeto apaga os trabalhos associados.], [REQ-VID-SIL-003, 004, 013, 020, 022; REQ-VID-QUOTA-001, 002; REQ-VID-STATUS-001; REQ-VID-CANCEL-001; REQ-VID-FAIL-001; REQ-VID-STORE-001; REQ-VID-TIMEOUT-001; REQ-VID-BLUR-002, 011, 012; REQ-VID-COMP-007, 017; REQ-VID-LEG-005, 006, 007; REQ-VID-BG-005, 006, 029, 030],
    [Image Storage Service], [Alterado], [Upload de vídeo MP4 até 100 MB, mantendo a extensão do ficheiro; metadados de vídeo.], [REQ-VID-SIL-022; REQ-VID-BLUR-008; REQ-VID-STORE-001; REQ-VID-BG-015; REQ-VID-SEC-001],
    [RabbitMQ], [Alterado], [Novas filas de vídeo, todas as de pedidos com prioridade (`x-max-priority`): `privacy_blur_requests_queue`; `video_bg_remove_requests_queue`; `silence_removal_queue` e `silence_results_queue`; `video_compression_requests_queue` e `video_compression_results_queue`; `subtitle_generation_queue`, `subtitle_results_queue` e `subtitle_cancel_queue`.], [REQ-VID-QUOTA-003; REQ-VID-SIL-030; REQ-VID-SUBMIT-001, 002],
    [`Tools/utils`], [Alterado], [Biblioteca comum das ferramentas: envio do progresso por _WebSocket_ (`send_ws_progress`) e das deteções no resultado.], [REQ-VID-STATUS-001, 002; REQ-VID-BLUR-009],
    [`docker-compose.yaml`], [Alterado], [Cinco novos serviços de ferramentas de vídeo e dois novos volumes (`subtitle_model_cache`, `subtitle_worker_state`).], [REQ-VID-ARCH-002],
  ),
)

== Decisões arquiteturais

#orientacao[
  Registo leve de decisões (ao estilo ADR). Uma decisão só merece registo se havia alternativas reais
  (e.g., processamento síncrono vs. assíncrono via fila; um serviço por ferramenta vs. serviço de vídeo único;
  onde guardar ficheiros de entrada/saída; como reportar progresso ao _frontend_).
]

#tab([Decisões arquiteturais],
  tabela(
    colunas: (1.2cm, 2.6cm, 1fr, 3cm, 2.4cm),
    tamanho: 8.5pt,
    [ID], [Decisão], [Contexto e alternativas consideradas], [Consequências], [Requisitos / DQ],
    [DA-01], [Processamento assíncrono através do RabbitMQ], [Processar um vídeo pode demorar minutos. Alternativas: pedido HTTP síncrono até ao fim do processamento; fila de mensagens já usada pelas ferramentas de imagem. Escolheu-se a fila: o `projects` valida o pedido, responde de imediato e coloca o trabalho na fila.], [A sessão do utilizador nunca fica bloqueada e o trabalho continua mesmo que o browser feche; passa a ser preciso guardar o estado de cada trabalho e notificar o fim.], [REQ-VID-SUBMIT-002, 001],
    [DA-02], [Um serviço e uma fila por ferramenta de vídeo], [Alternativas: um único serviço de vídeo com todas as operações; um serviço por ferramenta, como nas ferramentas de imagem. Escolheu-se um serviço por ferramenta.], [Cada ferramenta evolui, escala e falha de forma independente e as dependências pesadas (modelos de IA) ficam isoladas; há algum código repetido entre serviços (leitura do vídeo com `ffprobe`, ligação ao RabbitMQ).], [REQ-VID-ARCH-001],
    [DA-03], [Filas de resultados próprias e estado do trabalho no `projects` para as ferramentas com passos intermédios], [O circuito genérico das ferramentas de imagem só conhece "processar e devolver um ficheiro". A remoção de silêncios, a compressão e as legendas precisam de passos intermédios (análise e revisão, transcrição e confirmação), progresso e cancelamento. Alternativas: estender o circuito genérico; filas e modelos de trabalho próprios. O desfoque e a remoção de fundo, que são um processamento simples, reutilizam o circuito genérico.], [Permite revisão, cancelamento e reposição do estado; coexistem dois padrões de integração, a harmonizar na Fase 2.], [REQ-VID-SIL-009, 013, 020; REQ-VID-STATUS-001; REQ-VID-CANCEL-001; REQ-VID-LEG-014],
    [DA-04], [Ficheiros passados pelo volume partilhado; vídeos guardados no armazenamento de objetos], [As ferramentas precisam de ler o vídeo e escrever o resultado. Alternativas: cada ferramenta acede diretamente ao SeaweedFS; reutilizar o volume partilhado `image_data`, como as ferramentas de imagem, e deixar o `projects` e o Image Storage Service tratar do SeaweedFS.], [As ferramentas não precisam de credenciais do armazenamento; o original nunca é escrito por elas; os ficheiros temporários no volume têm de ser limpos no fim de cada trabalho.], [REQ-VID-SIL-022; REQ-VID-FAIL-001; REQ-VID-SEC-001; REQ-VID-ORIG-001; REQ-VID-STORE-001],
    [DA-05], [Reprodução de vídeo pelo Nginx com pedidos _Range_], [O browser precisa de reproduzir e avançar no vídeo sem o descarregar todo. Alternativas: servir o ficheiro inteiro através da API; encaminhar pedidos _Range_ no Nginx diretamente para o armazenamento de objetos.], [Reprodução e navegação no vídeo sem carga na API; o limite de upload passa a 100 MB, o que limita o tamanho dos vídeos aceites por todas as ferramentas.], [REQ-VID-SIL-025; REQ-VID-OUTPUT-001; REQ-VID-COMP-012],
    [DA-06], [Progresso e estado enviados pelo WS Gateway existente], [Alternativas: o browser consulta periodicamente o estado; novo canal de notificações; reutilizar a `ws_queue` e o WS Gateway. Escolheu-se reutilizar, com novos tipos de evento enviados só à sala do utilizador.], [Atualizações em tempo real sem novos componentes; como uma mensagem pode perder-se, o pedido de estado (`GET`) continua a ser a fonte de verdade quando a ligação é restabelecida.], [REQ-VID-STATUS-001, 002],
    [DA-07], [Prioridade premium na fila], [Os utilizadores premium têm prioridade. Alternativas: fila separada para premium (`high_priority_queue`); prioridade de mensagem na fila de cada ferramenta (RabbitMQ `x-max-priority`). A fila separada foi abandonada: era partilhada pelo desfoque e pela remoção de fundo e nenhum serviço a consumia, pelo que os pedidos premium ficavam por processar. Todas as ferramentas usam agora prioridade de mensagem (5 para premium) numa fila própria; o desfoque e a remoção de fundo consomem-na com confirmação manual e um pedido de cada vez, para a prioridade decidir o pedido seguinte.], [Sem novos serviços; uma só forma de prioridade. Um serviço que pare a meio de um pedido recebe-o de novo ao reiniciar.], [REQ-VID-QUOTA-003],
    [DA-08], [Tempo máximo e falhas controlados pelo `projects`], [Uma ferramenta pode bloquear ou ir abaixo a meio. Alternativas: confiar só no tempo máximo dentro da ferramenta; verificação periódica no `projects`. Na remoção de silêncios usam-se as duas: a ferramenta interrompe processos acima do tempo máximo e o `projects` verifica a cada 30 s os trabalhos sem notícias há 90 s, acima do tempo máximo ou há 15 min em fila. No desfoque e na remoção de fundo, o tempo máximo é de 3 × a duração do vídeo + 60 s: no desfoque é controlado por um temporizador no `projects`, que invalida a execução e devolve a operação; na remoção de fundo é aplicado pela própria ferramenta. A compressão e as legendas aplicam o mesmo limite (3× a duração + 60 s) na própria ferramenta, e o `projects` vigia-o com uma margem (REQ-VID-TIMEOUT-001).], [O trabalho passa sempre a "falhada", mesmo que a ferramenta morra; não há repetição automática no MVP.], [REQ-VID-FAIL-001; REQ-VID-TIMEOUT-001; DQ-004; REQ-VID-BLUR-012; REQ-VID-TIMEOUT-001; REQ-VID-BG-031],
    [DA-09], [Dependências e modelos dentro das imagens Docker, só com CPU], [FFmpeg e os modelos de IA (OpenCV, ONNX, _faster-whisper_) são pesados. Alternativas: instalar no computador; serviço externo de IA; GPU. Escolheu-se tudo dentro da imagem de cada ferramenta, a correr em CPU; o modelo de legendas é guardado num volume para não ser descarregado a cada arranque.], [Funciona em qualquer computador com Docker; os tempos de processamento são os de CPU (alvos do MVP); imagens maiores.], [REQ-VID-ARCH-002],
  ),
)

== Fluxo de processamento de vídeo

#figure(
  image("../images/projeto/sequencia_processamento_video.png", width: 100%),
  caption: [Sequência de processamento de um vídeo entre componentes],
)

As cinco ferramentas de vídeo seguem o mesmo fluxo geral, com duas formas de integração (DA-03): o desfoque
(UC-VID-003) e a remoção de fundo (UC-VID-005) usam o circuito genérico das ferramentas da solução de base; a
remoção de silêncios (UC-VID-001), a compressão (UC-VID-002) e as legendas (UC-VID-004) têm filas de pedidos e
de resultados próprias e um registo do trabalho no `projects`.

+ *Pedido.* O browser envia o pedido pelo Nginx ao API Gateway, que valida o JWT e o encaminha para o
  `projects`, indicando quem executa a operação. As ferramentas genéricas usam a rota de processamento já
  existente; as restantes usam as novas rotas `/silence`, `/compression` e `/subtitles`.
+ *Validação, limites e quota.* O `projects` verifica a permissão sobre o projeto (dono ou link de partilha
  com edição), recusa utilizadores anónimos (403) e verifica os limites do
  plano com os metadados do vídeo. A quota é verificada ou descontada no `users` (o momento varia, ver tabela
  seguinte); sem quota, o pedido é recusado.
+ *Encaminhamento.* O `projects` copia o vídeo original do SeaweedFS para o volume partilhado `image_data` e
  publica o pedido na fila da ferramenta. Os utilizadores premium têm prioridade (DA-07). Nas ferramentas com
  registo próprio, o trabalho fica guardado no MongoDB com o estado "em fila" e o browser recebe 202 (aceite).
+ *Processamento.* A ferramenta lê o vídeo do volume, valida-o com `ffprobe`, processa-o (FFmpeg e, quando
  aplicável, o modelo de IA) e escreve o resultado no volume, enviando o progresso à medida que avança.
+ *Notificação.* O progresso e o estado chegam ao browser pela `ws_queue` e pelo WS Gateway (DA-06): as
  ferramentas genéricas enviam diretamente o evento `video-progress`; nas outras, o `projects` consome a fila
  de resultados, atualiza o trabalho e reencaminha `silence-update`, `compression-update` ou `subtitle-update`.
+ *Armazenamento do resultado.* O resultado é enviado ao Image Storage Service, que o guarda no SeaweedFS, e
  acrescentado ao projeto (evento `IMAGE_ADDED`). O original nunca é alterado e os ficheiros temporários são apagados.
+ *Falhas e cancelamento.* Um erro da ferramenta, o tempo máximo excedido ou um cancelamento levam o trabalho
  a "falhada" ou "cancelada", sem resultado parcial visível; a operação é devolvida nos casos indicados na
  tabela seguinte.

#tab([Diferenças do fluxo entre as funcionalidades de vídeo],
  tabela(
    colunas: (2.4cm, 2.6cm, 1fr, 2.6cm, 2.6cm),
    tamanho: 8.5pt,
    [Funcionalidade], [Integração], [Quota], [Progresso], [Cancelamento e resultado],
    [UC-VID-001 Remover silêncios], [Filas próprias; análise e revisão antes de aplicar], [Análise não gasta operações (máx. 15/dia no free); 1 operação descontada ao entrar na fila, devolvida se cancelar ou falhar], [`silence-update`], [Cancela a análise ou o processamento; novo vídeo no projeto],
    [UC-VID-002 Compressão], [Filas próprias], [Verificada antes de entrar na fila; 1 operação reservada quando o FFmpeg arranca, devolvida se cancelar, falhar ou exceder o tempo máximo], [`compression-update`], [Cancela em fila ou a processar; novo vídeo no projeto],
    [UC-VID-003 Anonimização], [Circuito genérico], [1 operação avançada reservada ao aceitar o pedido; devolvida em falha, cancelamento, tempo excedido ou 0 deteções], [`video-progress`], [Cancela em fila ou a processar, repondo o último estado confirmado; novo vídeo no projeto],
    [UC-VID-004 Legendas], [Filas próprias, incluindo de cancelamento; transcrição revista antes de gerar o SRT], [1 operação reservada ao criar o trabalho; devolvida se cancelar, rejeitar ou falhar], [`subtitle-update`], [Cancela ou rejeita a transcrição; ficheiro SRT no projeto],
    [UC-VID-005 Remoção de fundo], [Circuito genérico], [1 operação avançada reservada ao aceitar o pedido e consolidada só após o sucesso; devolvida em falha, cancelamento ou tempo excedido], [`video-progress`], [Cancela em fila ou a processar, repondo o último estado confirmado; novo vídeo no projeto],
  ),
)

== Impacto na instalação e execução

- *Novos contentores* no `docker-compose.yaml`: `privacy_blur_tool`, `silence_removal_tool`,
  `video_compression_tool`, `subtitle_generation_tool` e `video_bg_remove_tool`, todos ligados ao RabbitMQ e ao
  volume `image_data`.
- *Novos volumes*: `subtitle_model_cache` (modelo de reconhecimento de fala, descarregado no primeiro
  arranque) e `subtitle_worker_state`.
- *Dependências externas*: FFmpeg e `ffprobe`, OpenCV, ONNX Runtime e _faster-whisper_/CTranslate2, todas
  instaladas dentro das imagens Docker; nada tem de ser instalado no computador.
- *Nginx*: uploads até 100 MB e pedidos _Range_; vídeos maiores são recusados antes de chegarem aos serviços.
- *RabbitMQ*: as novas filas estão declaradas em `rabbitMQ/definitions.json` e são criadas no arranque.
- *Variáveis de configuração* (todas com valor por omissão): `SILENCE_MAX_CONCURRENT_JOBS`,
  `FREE_DAILY_SILENCE_ANALYSES`, os tempos máximos `SILENCE_*_MAX_SEC` e as variáveis `SUBTITLE_*` (modelo,
  tipo de cálculo, filas e pastas).
- *Bases de dados*: o MongoDB do `projects` guarda os metadados de vídeo e três novas coleções de trabalhos; o
  do `users` passa a guardar `silence_analyses` em cada dia de operações. Não é preciso migrar dados existentes.
- *Execução*: `docker compose up --build`; o primeiro arranque demora mais, porque constrói as novas imagens e
  descarrega o modelo de legendas. Instruções completas de execução no Anexo A.
