#import "../template.typ": *

// =============================================================================
//  CASO DE USO — um ficheiro por caso de uso (UC-VID-001.typ, UC-VID-002.typ, …).
//  Copiar este ficheiro e acrescentar o #include em capitulos/04-casos-de-uso.typ.
//  Os requisitos derivados deste caso de uso vão para as tabelas partilhadas dos
//  capítulos seguintes (ERS, impacto, rastreabilidade).
// =============================================================================

== UC-VID-001 — Remover silêncios e pausas de um vídeo

=== Cabeçalho

#tab([Caso de uso UC-VID-001 — Remover silêncios e pausas de um vídeo],
  tabela-campos(
    [ID do Caso de Uso], [UC-VID-001],
    [Nome], [Remover silêncios e pausas de um vídeo],
    [Versão], [v1.1],
    [Autor], [António Sousa],
    [Data], [2026-10-15],
    [Objetivo], [Permitir ao utilizador detetar automaticamente os silêncios e pausas de um vídeo, rever e ajustar os troços a remover e obter uma nova versão do vídeo, mais curta, sem esses troços.],
    [Âmbito], [Módulo de vídeo do PictuRAS: análise do áudio, revisão dos cortes, processamento do vídeo, quota e fila de processamento.],
    [Ator Principal], [Utilizador registado (plano free ou premium).],
    [_Stakeholders_ e Interesses], [
      - *Utilizador (criador de conteúdo)*: quer encurtar o vídeo sem ter de cortar manualmente cada pausa, mas sem perder pausas intencionais, momentos com música ou falas mais baixas.
      - *Proprietário do Sistema*: pretende oferecer uma funcionalidade muito procurada e com baixo custo de processamento, que incentive o registo e a subscrição premium.
      - *Equipa de Desenvolvimento*: valida o processamento de áudio em vídeo, a revisão manual de um resultado intermédio e a manutenção da sincronização entre som e imagem depois dos cortes.
    ],
    [Pré-condições], [
      - O utilizador tem sessão iniciada.
      - O vídeo já foi submetido com sucesso e está disponível no projeto do utilizador.
      - O vídeo tem som.
    ],
    [_Trigger_], [O utilizador, com um vídeo selecionado, escolhe a opção *Remover silêncios*.],
  ),
)

=== Fluxo Principal

#tab([UC-VID-001 — Fluxo principal],
  tabela(
    colunas: (1.2cm, 1fr, 1fr),
    [Passo], [Ação do Ator], [Resposta do Sistema],
    [1], [O utilizador abre um projeto e seleciona um vídeo.], [Apresenta o vídeo, a sua duração e as operações diárias que o utilizador ainda tem disponíveis.],
    [2], [O utilizador escolhe *Remover silêncios*.], [Apresenta as opções de deteção com valores sugeridos: sensibilidade ao silêncio, duração mínima de uma pausa para ser removida, margem a manter antes e depois da fala e indicação de que o vídeo tem música de fundo. Disponibiliza também três perfis pré-definidos (Suave, Equilibrado e Agressivo).],
    [3], [O utilizador ajusta as opções, ou mantém as sugeridas, e escolhe *Analisar*.], [Valida o vídeo, o seu som, a duração permitida para o perfil do utilizador e as opções escolhidas.],
    [4], [—], [Analisa o áudio do vídeo, identifica os troços de silêncio e mostra o progresso da análise.],
    [5], [—], [Apresenta os resultados: a linha temporal do áudio com os troços a remover assinalados, a lista desses troços (início, fim e duração) e a poupança prevista (duração original, duração final e tempo removido).],
    [6], [O utilizador revê os troços: ouve cada um, desmarca os que quer manter e ajusta o início ou o fim dos que entender.], [Atualiza a marcação na linha temporal e a poupança prevista a cada alteração.],
    [7], [O utilizador escolhe *Aplicar cortes*.], [Verifica que existe pelo menos um troço selecionado e que o utilizador tem quota disponível, regista a operação e coloca o processamento na fila.],
    [8], [—], [Mostra o estado e o progresso do processamento, com a opção de cancelar sempre visível.],
    [9], [—], [Remove os troços selecionados do som e da imagem ao mesmo tempo, suaviza as passagens entre troços para não se ouvirem cortes bruscos e gera o novo vídeo.],
    [10], [—], [Confirma que o som e a imagem do novo vídeo estão sincronizados e guarda-o no projeto.],
    [11], [O utilizador consulta o resultado.], [Apresenta o novo vídeo para reprodução e transferência, juntamente com a comparação entre a duração original e a final. O vídeo original mantém-se inalterado.],
  ),
)

=== Fluxos Alternativos

#tab([UC-VID-001 — Fluxos alternativos],
  tabela(
    colunas: (4cm, 1fr),
    [Fluxo], [Descrição (passo de origem: condição → comportamento → retorno)],
    [FA1 – Utilizador premium], [No passo 7, o sistema verifica que o utilizador é premium → o processamento é colocado em fila com prioridade e não é descontada nenhuma operação da quota.],
    [FA2 – Nenhum silêncio encontrado], [No passo 4, o sistema não encontra troços que cumpram as opções escolhidas → informa o utilizador, sugere um perfil mais agressivo e termina sem gastar quota.],
    [FA3 – Repetir a análise com outras opções], [No passo 6, o utilizador não está satisfeito com os troços encontrados e altera as opções de deteção → o sistema avisa que os ajustes manuais feitos serão perdidos e, após confirmação, o fluxo regressa ao passo 3.],
    [FA4 – Manter todos os troços], [No passo 6, o utilizador desmarca todos os troços → a opção *Aplicar cortes* fica indisponível e o caso de uso termina sem gastar quota se o utilizador sair.],
    [FA5 – Retomar a revisão mais tarde], [No passo 6, o utilizador sai sem aplicar os cortes → o sistema guarda a revisão feita e, quando o utilizador voltar a abrir a ferramenta no mesmo vídeo, apresenta-a sem ser preciso analisar de novo.],
    [FA6 – Cancelar a análise], [Durante o passo 4, o utilizador cancela → o sistema interrompe a análise, descarta os resultados parciais e regressa ao passo 2.],
    [FA7 – Cancelar o processamento], [Durante os passos 8 a 10, o utilizador cancela → o sistema interrompe o processamento, devolve a operação à quota, mantém o vídeo original e regressa ao passo 6 com a revisão intacta.],
    [FA8 – Remoção de grande parte do vídeo], [No passo 7, os troços selecionados representam mais de 80% da duração do vídeo → o sistema pede ao utilizador que confirme antes de colocar o processamento na fila.],
  ),
)

=== Exceções

#tab([UC-VID-001 — Exceções],
  tabela(
    colunas: (1fr, 1fr),
    [Condição], [Comportamento do Sistema],
    [O vídeo não tem som.], [Informa que não é possível detetar silêncios num vídeo sem som e não executa a análise.],
    [O ficheiro de vídeo está corrompido, ilegível ou usa um formato ou _codec_ não suportado.], [Apresenta o erro "Não foi possível ler este vídeo" e não executa a análise.],
    [O vídeo excede a duração, a resolução ou o tamanho permitidos para o perfil do utilizador (RN2, RN9).], [Indica o limite do perfil que foi excedido e o valor do vídeo e não executa a análise.],
    [O utilizador atingiu o limite diário de análises (RN6).], [Informa que o limite foi atingido e não executa a análise; as revisões já guardadas continuam acessíveis.],
    [No momento de aplicar os cortes, o utilizador não tem quota disponível.], [Informa que o limite diário de operações foi atingido e guarda a revisão para poder aplicar os cortes mais tarde.],
    [Quase todo o áudio é considerado silêncio (por exemplo, sensibilidade mal ajustada ou vídeo só com ruído de fundo).], [Não propõe cortes, informa que as opções podem não ser adequadas a este vídeo e sugere um perfil mais suave.],
    [O processamento falha ou demora mais do que o tempo máximo previsto.], [Interrompe o processamento, devolve a operação à quota, mantém o vídeo original e informa o utilizador.],
    [O novo vídeo fica com o som desfasado da imagem.], [Não disponibiliza o resultado, devolve a operação à quota e informa o utilizador de que o processamento não foi concluído.],
    [A ligação em tempo real é interrompida durante a análise ou o processamento.], [O processamento continua no servidor e o estado atualizado é apresentado quando a ligação for restabelecida.],
  ),
)

=== Pós-condições

#tabela(
  colunas: (4cm, 1fr),
  [Tipo], [Resultado],
  [Garantia de Sucesso], [É criado um novo vídeo sem os troços confirmados pelo utilizador, com som e imagem sincronizados e sem cortes bruscos audíveis; o novo vídeo fica guardado no projeto, o utilizador vê o tempo poupado e o vídeo original mantém-se inalterado.],
  [Garantia Mínima], [O vídeo original mantém-se inalterado; não é disponibilizado nenhum vídeo incompleto ou desfasado; qualquer operação descontada num processamento que não terminou é devolvida à quota e é apresentada uma mensagem com o motivo.],
)

=== Regras de Negócio e Restrições

#tabela(
  colunas: (1.4cm, 1fr),
  [ID], [Regra],
  [RN1], [Cada aplicação de cortes concluída conta como uma operação na quota diária do plano free; no plano premium não há limite.],
  [RN2], [No plano free, só podem ser processados vídeos até 2 minutos; no plano premium, até 30 minutos.],
  [RN3], [Os cortes só são aplicados depois de o utilizador rever os troços e confirmar explicitamente.],
  [RN4], [Os troços são removidos ao mesmo tempo do som e da imagem, para que o novo vídeo se mantenha sincronizado.],
  [RN5], [A remoção de silêncios gera sempre um novo vídeo, sem alterar o original.],
  [RN6], [A análise não conta para a quota diária de operações, mas no plano free está limitada a 15 análises por dia.],
  [RN7], [Não é descontada quota quando nenhum troço é selecionado, quando o processamento é cancelado ou quando falha.],
  [RN8], [É sempre mantida uma pequena margem antes e depois da fala, para que o início e o fim das palavras não sejam cortados.],
  [RN9], [São aceites vídeos MP4 e MOV com vídeo H.264 e áudio AAC; no plano free até 1080p e 200 MB, no plano premium até 4K e 2 GB.],
)

=== Assunções

#tabela(
  colunas: (1.4cm, 1fr),
  [ID], [Assunção],
  [A1], [O vídeo pertence a um projeto do utilizador, tal como as imagens, e está integralmente armazenado e acessível no momento do pedido.],
  [A2], [Em vídeos falados (aulas, _podcasts_, tutoriais, reuniões), as pausas têm um volume claramente inferior ao da fala, o que permite distingui-las automaticamente.],
  [A3], [Em vídeos com música de fundo, é possível dar prioridade às frequências da voz na análise; os casos em que isto não chega são corrigidos pelo utilizador na revisão manual.],
  [A4], [A análise do áudio é rápida o suficiente para o utilizador aguardar pelo resultado, acompanhando o progresso em tempo real.],
  [A5], [O utilizador acompanha o progresso da análise e do processamento através de uma ligação em tempo real (_WebSocket_).],
  [A6], [Os ficheiros temporários criados durante o processamento são apagados quando este termina, é cancelado ou falha.],
  [A7], [Os limites de duração (2 e 30 minutos) e de análises diárias (15) foram fixados a partir da duração típica de excertos de redes sociais (free) e de uma aula ou reunião curta (premium); serão revistos após testes com vídeos reais.],
  [A8], [Os limites de resolução e tamanho (RN9) assumem vídeos gravados com telemóvel ou ecrã, onde 1080p é o caso mais comum; 200 MB cobrem 2 minutos em 1080p com folga.],
  [A9], [Os alvos de desempenho do MVP assumem execução local em Docker, num computador da equipa, apenas com CPU (sem placa gráfica).],
  [A10], [Um desfasamento entre som e imagem até 40 ms (um fotograma a 25 fps) não é percetível pelo utilizador.],
  [A11], [Os valores sugeridos para as opções de deteção (perfis Suave, Equilibrado e Agressivo) funcionam razoavelmente para voz gravada em condições normais; foram escolhidos com base em testes iniciais e ajustam-se na revisão manual.],
  [A12], [Uma revisão não aplicada pode ser descartada ao fim de 7 dias sem prejuízo para o utilizador, já que pode sempre voltar a analisar o vídeo.],
)

=== Questões em Aberto

#tabela(
  colunas: (1.4cm, 1fr, 5cm),
  [ID], [Questão], [Resolução],
  [Q1], [O perfil anónimo deve ter acesso à remoção de silêncios?], [Decidida: não tem acesso no MVP; exclusiva de utilizadores registados (free e premium) → ator principal, secção 4.1.3 e REQ-VID-SIL-001.],
  [Q2], [Em projetos partilhados, a operação deve ser descontada ao dono do projeto ou ao utilizador que aplicou os cortes?], [Decidida: é descontada a quem executa a operação (decisão comum aos casos de uso de vídeo) → RN1.],
  [Q3], [Durante quanto tempo é guardada uma revisão não aplicada?], [Decidida: 7 dias sem utilização, depois é eliminada → A12 e REQ-VID-SIL-013.],
  [Q4], [O vídeo resultante deve poder ser usado diretamente noutras ferramentas de vídeo (por exemplo, gerar legendas depois de remover os silêncios)?], [Adiada para fase posterior: o encadeamento de ferramentas de vídeo não faz parte do MVP; o resultado já fica guardado no projeto como vídeo MP4 normal.],
  [Q5], [Deve ser possível, no futuro, remover também hesitações como "hum" ou "ah", e não apenas silêncios?], [Adiada para fase posterior: exige reconhecimento de fala, fora do âmbito do MVP.],
  [Q6], [Deve ser possível exportar a lista de cortes para usar noutro editor de vídeo?], [Adiada para fase posterior: não é necessária para validar o fluxo do MVP.],
  [Q7], [Os limites fixados nas assunções A7 e A8 são adequados, ou devem ser ajustados depois de testes com vídeos reais?], [Adiada até aos testes com vídeos reais; até lá valem os limites de RN2 e RN9 → A7, A8.],
)
