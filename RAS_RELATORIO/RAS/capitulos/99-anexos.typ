#import "../template.typ": *

#set heading(numbering: "A.1.")
#counter(heading).update(0)

= Instruções de execução

#orientacao[Passos mínimos para lançar a solução entregue (`solucao-ext-mvp.zip`) (pré-requisitos, comandos, credenciais de teste, ficheiros de vídeo de exemplo) e para correr os testes automáticos.]

== Pré-requisitos

Para executar a solução basta ter o Docker com o Docker Compose v2 (no Windows, o Docker Desktop com WSL 2), com
cerca de 8 GB de memória disponíveis para o Docker e 15 GB de disco para as imagens. Não é preciso instalar Python,
Node.js nem FFmpeg no computador, porque cada serviço traz as suas dependências e os modelos de IA vêm dentro das
imagens (REQ-VID-ARCH-002).

== Lançar a solução

+ Extrair `solucao-ext-mvp.zip` e abrir um terminal na pasta `projeto/`.
+ Construir e iniciar todos os serviços com `docker compose up -d --build`. A primeira construção demora vários
  minutos; as seguintes reaproveitam as imagens.
+ Confirmar que os serviços estão a correr com `docker compose ps`. Os registos de um serviço veem-se com
  `docker compose logs -f <serviço>` (por exemplo, `video_bg_remove_tool`).
+ Abrir `https://localhost:8080` no browser e aceitar o certificado autoassinado.
+ Para parar, usar `docker compose down`. Os dados ficam guardados nos volumes do Docker; `docker compose down -v`
  apaga-os.

== Utilizar as ferramentas de vídeo

Depois de criar um projeto, carrega-se um vídeo MP4 (H.264/AAC, até 100 MB) e abre-se no editor, onde as cinco
ferramentas aparecem na barra lateral. O progresso e o estado de cada processamento (Em fila, A processar,
Concluída, Falhada ou Cancelada) são atualizados em tempo real, e cada resultado é acrescentado ao projeto como um
novo ficheiro.

Para experimentar o fluxo principal serve qualquer vídeo curto, de 10 a 30 s, com uma pessoa a falar, o que permite
usar as cinco ferramentas no mesmo ficheiro. Os vídeos sintéticos usados nos testes do Cap. 10 são gerados com
FFmpeg; o vídeo com pausas conhecidas, por exemplo, é criado por `python cli.py demo`.

== Testes automáticos

Os comandos da tabela seguinte correm a partir da pasta `projeto/`; os resultados estão no Cap. 10.


#tab([Comandos dos testes automáticos],
  tabela(
  colunas: (3.4cm, 1fr),
  tamanho: 8.5pt,
  [Âmbito], [Comando],
  [Compressão (API e quota)], [`node --test Tools/video_compression/tests/test_api.cjs Tools/video_compression/tests/test_quota.cjs`],
  [Compressão (serviço)], [`docker run --rm -v "$PWD/Tools/video_compression:/app" -w /app picturas-video_compression_tool python -m unittest discover -s tests -v`],
  [Remoção de silêncios], [`docker run --rm -v "$PWD/Tools/silence_removal:/app" -w /app picturas-silence_removal_tool python -m unittest discover -s tests -v` (e `python cli.py demo` para o teste ponta a ponta)],
  [Legendas (serviço)], [`cd Tools/subtitle_generation && python -m unittest discover -s tests -v`],
  [Remoção de fundo], [`docker run --rm --entrypoint python -w /app picturas-video_bg_remove_tool -m unittest discover -s tests -v`],
  [Filas e erros das ferramentas], [`cd Tools && python -m unittest discover -s utils/tests -v` e `node --test projects/tests/priority_queues.test.cjs`],
  [_Frontend_ (compressão e legendas)], [`cd frontend && node --test tests/compression.test.cjs tests/subtitles.test.cjs` (precisa do pacote `typescript`)],
  ),
)

= Glossário

#tab([Glossário],
  tabela(
  colunas: (4cm, 1fr),
  [Termo], [Definição],
  [Trabalho de processamento], [Pedido para aplicar uma ferramenta de vídeo a um vídeo do projeto. É aceite de imediato, processado em segundo plano e acompanhado pelo seu estado até terminar.],
  [Estado do trabalho], [Fase em que o trabalho se encontra: Em fila, A processar, Concluída, Falhada ou Cancelada (e Pronta para revisão, quando o utilizador tem de confirmar o resultado).],
  [Fila de mensagens], [Fila do RabbitMQ onde o serviço `projects` coloca os pedidos e de onde cada ferramenta os retira por ordem; os pedidos Premium têm prioridade.],
  [Ferramenta (serviço de processamento)], [Microsserviço independente, na pasta `Tools`, que executa um tipo de processamento (por exemplo, `video_bg_remove`) e comunica com o resto do sistema só por filas.],
  [Plano Free / Premium], [Planos de utilizador registado. O Free tem quota diária e limites de duração e resolução mais baixos; o Premium não tem limite diário, tem limites mais altos e prioridade na fila.],
  [Quota diária (operação)], [Número de processamentos que um utilizador Free pode fazer por dia. A operação é reservada quando o pedido é aceite e só fica descontada se o processamento terminar com sucesso.],
  [Quem executa], [Utilizador que lança o processamento. Num projeto partilhado é a ele, e não ao dono do projeto, que é descontada a operação.],
  [Tempo máximo], [Limite de duração de um processamento: 3 vezes a duração do vídeo mais 60 s no MVP. Quando é excedido, o trabalho é interrompido, fica Falhada e os ficheiros temporários são apagados.],
  [Vídeo original], [Ficheiro carregado pelo utilizador. Nunca é alterado: cada resultado é guardado como um novo ficheiro no projeto.],
  [Troço], [Intervalo de tempo de um vídeo (início e fim). Na remoção de silêncios, cada pausa detetada é um troço que o utilizador pode rever antes de aplicar os cortes.],
  [Perfil de qualidade], [Conjunto de parâmetros de codificação escolhido pelo utilizador na compressão: Alta, Equilibrada ou Tamanho reduzido.],
  [Transcrição (STT)], [Reconhecimento de fala (_speech-to-text_) que converte o áudio em texto com tempos de início e fim; nas legendas é feito com o modelo Whisper.],
  [SRT], [Formato de ficheiro de legendas em texto, com numeração, tempos no formato HH:MM:SS,mmm e o texto de cada legenda.],
  [Máscara de segmentação], [Imagem que indica, para cada píxel de um fotograma, a probabilidade de pertencer ao sujeito; é usada para separar a pessoa do fundo.],
  [Fotograma-chave], [Na remoção de fundo, fotograma em que a máscara é estimada pela IA (um em cada três); os fotogramas intermédios recebem a interpolação das máscaras vizinhas.],
  [Chroma key / Bokeh], [Modos de substituição do fundo: _chroma key_ pinta o fundo de verde uniforme para edição posterior; _Bokeh_ desfoca o fundo e mantém o sujeito nítido (só Premium).],
  [Desfasamento som/imagem], [Diferença temporal entre o áudio e o vídeo do resultado, medida em milissegundos; o alvo é no máximo 40 ms.],
  [H.264 / AAC / MP4], [Codec de vídeo, codec de áudio e contentor reproduzidos nativamente pelos browsers; o resultado das ferramentas de vídeo é sempre MP4 com H.264 e AAC.],
  [WebSocket], [Ligação permanente entre o browser e o serviço `wsGateway`, usada para enviar o progresso e as mudanças de estado em tempo real.],
  [RNG], [Regra de negócio geral: regra comum às cinco funcionalidades de vídeo (Cap. 3), da qual derivam os requisitos comuns REQ-VID-…],
  [MVP], [_Minimum Viable Product_: versão mínima da extensão de vídeo, implementada nesta fase para validar os casos de uso.],
  ),
)
