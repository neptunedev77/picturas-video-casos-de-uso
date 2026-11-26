// Diagrama de sequência de um pedido completo de vídeo na solução de base (commit a2c0772).
// Desenhado com o pacote chronos (Typst Universe); os números entre parênteses retos
// correspondem às evidências EV-nn do capítulo 2.
#import "@preview/chronos:0.2.1"

#let video = rgb("#C2410C")

#let sequencia-pedido = chronos.diagram({
  import chronos: *
  _par("B", display-name: "Browser", shape: "actor")
  _par("G", display-name: [nginx +\ API Gateway])
  _par("P", display-name: [projects\ (orquestrador)])
  _par("S", display-name: [img_storage +\ SeaweedFS], shape: "database")
  _par("Q", display-name: [RabbitMQ], shape: "queue")
  _par("V", display-name: [video_tool])
  _par("W", display-name: [WS Gateway])

  _sep[1. Carregamento do vídeo]
  _seq("B", "G", comment: [POST …/video (multipart)])
  _seq("G", "P", comment: [POST /:user/:project/video\ (ficheiro em memória) [EV-01]])
  _seq("P", "P", comment: [ffprobe + validação\ pelo perfil [EV-02]])
  _seq("P", "S", comment: [guarda o original (src)])
  _seq("P", "B", comment: [201], dashed: true)

  _sep[2. Definição do pipeline]
  _seq("B", "P", comment: [POST …/tool (uma vez por efeito) [EV-03]])

  _sep[3. Apply]
  _seq("B", "P", comment: [POST …/process [EV-04]])
  _seq("P", "S", comment: [descarrega o original\ para o volume image_data])
  _seq("P", "Q", comment: [video_queue: 1 mensagem\ com o pipeline completo [EV-05]], color: video)
  _seq("P", "B", comment: [201], dashed: true)
  _seq("Q", "V", comment: [entrega (prefetch = 1) [EV-06]], color: video)

  _sep[4. Progresso]
  _grp("loop", desc: [durante o processamento], {
    _seq("V", "Q", comment: [ws_queue: percentagem [EV-07]], color: video)
    _seq("Q", "W", comment: [ws_queue])
    _seq("W", "B", comment: [Socket.IO video-progress])
  })

  _sep[5. Resultado]
  _seq("V", "Q", comment: [project_queue: resultado\ + ack no fim [EV-08]], color: video)
  _seq("Q", "P", comment: [project_queue])
  _seq("P", "S", comment: [guarda o resultado (out) e\ regista-o na execução])
  _seq("P", "Q", comment: [ws_queue: process-update])
  _seq("Q", "W", comment: [ws_queue])
  _seq("W", "B", comment: [Socket.IO process-update])
  _seq("B", "P", comment: [GET …/process/url [EV-09]])
  _seq("P", "B", comment: [URLs dos resultados], dashed: true)
})

// Encolhe um conteúdo (mantendo as proporções) para não passar de uma largura e de uma altura máximas.
#let ajustar-altura(corpo, altura-max) = layout(espaco => {
  let m = measure(corpo)
  let f = calc.min(1, espaco.width / m.width, altura-max / m.height)
  align(center, scale(f * 100%, reflow: true, corpo))
})
