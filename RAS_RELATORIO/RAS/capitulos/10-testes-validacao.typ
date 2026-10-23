#import "../template.typ": *

= Testes e Validação do MVP

#orientacao[
  Os critérios de aceitação da ERS (_Dado… Quando… Então…_) são a base dos testes. Cada requisito implementado
  deve ter pelo menos um teste (automático ou manual) com resultado registado. Para os requisitos não
  funcionais, registem o valor medido face ao *Alvo*, sempre que aplicável.
]

== Estratégia e ambiente de testes

Os testes foram derivados dos critérios de aceitação da ERS e organizados em quatro níveis:

- *Unitários* (Python `unittest`): lógica pura de cada serviço, sem RabbitMQ nem base de dados — cálculo e
  validação dos troços da remoção de silêncios, perfis de qualidade, limites e autorização da compressão.
- *Integração e contrato* (Node.js `node:test`, com os serviços externos simulados): rotas do `projects`,
  regras de quota e de propriedade, estados dos trabalhos e módulos do _frontend_ (pedidos REST, transferência
  do resultado, pré-visualização das legendas), transpilados com o compilador de TypeScript.
- *Ponta a ponta sobre vídeo real*: execução da ferramenta sobre vídeos de teste, medindo o resultado com
  `ffprobe` (codecs, duração, desfasamento entre som e imagem), a integridade do original (SHA-256), o progresso
  enviado e o tempo de processamento. A remoção de silêncios inclui ainda _scripts_ que percorrem toda a API com o
  sistema a correr (`e2e_api.py`, `e2e_robustness.py`), e `e2e_video_requirements.py` verifica pela API os requisitos
  sem teste anterior das restantes ferramentas.
- *Manuais*: fluxos completos na interface, com o sistema iniciado por `docker compose up --build`.

*Ambiente.* Os testes automáticos registados abaixo foram executados a 21 e 22-10-2026 num computador da equipa
(Windows 11, Node.js 24, Python 3.15), sem placa gráfica, de acordo com a assunção de execução só em CPU dos alvos
do MVP. Os testes que precisam do FFmpeg ou das dependências dos serviços (TST-SIL-01 e 02, TST-COMP-01) foram
executados dentro das imagens Docker dos serviços, com o código atual montado
(`docker run --rm -v <pasta do serviço>:/app -w /app <imagem> python -m unittest discover -s tests -v`).
Os testes do _frontend_ precisam do pacote `typescript` (`npm install` no _frontend_, ou `TYPESCRIPT_PATH` /
`NODE_PATH` a apontar para uma instalação existente); sem ele falham por erro de ambiente e não do código.

*Vídeos de teste.* Gerados com FFmpeg, para serem reprodutíveis: um vídeo de 20 s a 1280×720 e 25 fps com pausas
conhecidas (3–4,5 s, 7–7,5 s e 11–13 s), criado por `cli.py demo`; um vídeo de 20 s a 1280×720 e 30 fps, H.264 com
áudio AAC (tom de 440 Hz); e um vídeo de 10 s a 1920×1080 e 30 fps, H.264 sem áudio. Os testes da compressão geram
os seus próprios vídeos curtos, com e sem áudio, e um ficheiro inválido.



== Testes realizados

#tab([Testes e resultados],
  tabela(
    colunas: (1.9cm, 1.8cm, 1fr, 3.3cm, 2.7cm),
    tamanho: 8.5pt,
    [ID], [Tipo], [Descrição (Dado… Quando… Então…)], [Requisito(s)], [Resultado],

    [TST-SIL-01], [Automático (unitário)], [12 testes da lógica dos troços: dados os valores do perfil Equilibrado, opções fora dos intervalos, troços sobrepostos, fora da duração ou vazios, um áudio > 95% silencioso e o exemplo de poupança 120 s / 30 s, então as opções, a margem de 150 ms, as recusas, a sugestão de perfil e a poupança de 25 s correspondem ao especificado.], [REQ-VID-SIL-001, 002, 008, 011, 012, 015, 016, 021], [Passa (12/12)],
    [TST-SIL-02], [Automático (ponta a ponta)], [Ficheiro: `cli.py demo`. Dado o vídeo sintético com pausas conhecidas, quando é analisado e cortado, então são encontradas as 2 pausas longas e ignorada a de 0,5 s (erro dos limites: 0 ms), o novo vídeo dura 17,12 s, o desfasamento som/imagem é 0,0 ms, o original mantém o SHA-256, o cancelamento a meio demora 0,02 s sem deixar ficheiros e um vídeo sem som é recusado. Análise em 0,006× e processamento em 0,08× a duração.], [REQ-VID-SIL-005, 007, 020, 021, 022, 023, 028, 029; REQ-VID-CANCEL-001; REQ-VID-SYNC-001; REQ-VID-ORIG-001; REQ-VID-CLEAN-001], [Passa],
    [TST-SIL-03], [Automático (API)], [Ficheiro: `e2e_api.py`. Fluxo completo pela API com o sistema a correr: analisar, rever, aplicar, cancelar, quota e estado.], [REQ-VID-SIL-006, 009, 013, 014, 016; REQ-VID-QUOTA-001, 002; REQ-VID-STATUS-001], [Passa (todos os passos, 22-10-2026)],
    [TST-SIL-04], [Automático (robustez)], [Ficheiro: `e2e_robustness.py`. Revisão com 300 troços, serviço parado a meio, apagar o vídeo e limpeza dos ficheiros temporários.], [REQ-VID-SIL-013, 035; REQ-VID-FAIL-001; REQ-VID-STORE-001; REQ-VID-TIMEOUT-001], [Passa: 300 pausas analisadas em 1,6 s; serviço parado a meio deixa o pedido Falhada ao fim de 99 s, com a operação devolvida e sem repetição; revisão apagada com o vídeo; sem ficheiros temporários],
    [TST-SIL-05], [Manual (interface)], [Com o sistema a correr, no browser: dado um vídeo falado, quando o utilizador analisa, revê os troços na linha temporal (ajusta, desmarca, acrescenta) e aplica, então é criado o novo vídeo no projeto sem pausas e o original fica intacto; troços sobrepostos ou fora da duração são recusados no diálogo.], [REQ-VID-SIL-011, 013, 035; REQ-VID-ORIG-001], [Passa (21-10-2026); a fluidez com 300 troços não foi medida],

    [TST-COMP-01], [Automático (unitário e integração)], [Ficheiros: `test_compressor.py`, `test_authorization.py`, `test_worker.py`. 37 testes, incluindo codificações reais com FFmpeg: perfis Alta/Equilibrada/Tamanho reduzido com e sem áudio, resolução e proporção do Tamanho reduzido, qualidade desconhecida recusada, mesma entrada e saída recusada, resultado existente nunca reescrito, quota recusada sem lançar o FFmpeg, falha ao lançar com a operação libertada uma só vez, vídeo inválido sem resultado, falta de espaço recusada antes de arrancar, tempo máximo de 3× a duração + 60 s com o FFmpeg terminado e sem resultado parcial, cancelamento a meio com limpeza e sem publicação, e mensagens repetidas sem nova codificação.], [REQ-VID-COMP-005, 006, 008, 016, 019, 033; REQ-VID-QUOTA-001, 002; REQ-VID-CANCEL-001; REQ-VID-FAIL-001; REQ-VID-TIMEOUT-001; REQ-VID-ORIG-001; REQ-VID-CLEAN-001], [Passa (37/37)],
    [TST-COMP-02], [Automático (contrato da API)], [Ficheiro: `test_api.cjs`. 33 testes das rotas: todas exigem JWT; o dono e um link de edição podem criar e cancelar, um link de leitura só consulta e um link revogado é recusado; quem executa é verificado e paga a operação; um free sem operações é recusado antes de entrar na fila; um pedido válido coloca na fila uma cópia de trabalho sem alterar o original; o progresso e cada mudança de estado são enviados em tempo real; falha, tempo máximo, cancelamento e falta de espaço devolvem a operação; o resultado é acrescentado ao projeto (`IMAGE_ADDED`) e transferido do armazenamento; enquanto é acrescentado, o cancelamento é recusado; se não puder ser guardado, o pedido falha e a operação é devolvida.], [REQ-VID-AUTH-001; REQ-VID-SUBMIT-001; REQ-VID-QUOTA-001, 002, 003; REQ-VID-STATUS-001; REQ-VID-CANCEL-001; REQ-VID-FAIL-001; REQ-VID-TIMEOUT-001; REQ-VID-STORE-001; REQ-VID-SEC-001; REQ-VID-ORIG-001; REQ-VID-CLEAN-001; REQ-VID-COMP-012, 019], [Passa (33/33)],
    [TST-COMP-03], [Automático (contrato da quota)], [Ficheiro: `test_quota.cjs`. 20 testes: limites exatos por plano; não MP4/H.264, anónimo e metadados inválidos recusados; o plano free reserva exatamente uma operação, mesmo com pedidos simultâneos; sem quota não arranca; o premium não desconta; uma descida de plano em fila aplica os limites free; falha, tempo máximo e cancelamento confirmado devolvem a operação uma só vez; o serviço não consegue devolver a operação enquanto o FFmpeg corre; um trabalho concluído nunca é devolvido; num projeto partilhado é verificado e descontado quem executa.], [REQ-VID-COMP-007, 016, 017, 021, 022, 023, 024; REQ-VID-INPUT-001; REQ-VID-QUOTA-001, 002, 003; REQ-VID-CANCEL-001], [Passa (20/20)],
    [TST-COMP-04], [Automático (_frontend_)], [Ficheiro: `compression.test.cjs`. 25 testes do diálogo e dos pedidos: escolha das três qualidades, estado em tempo real pelo evento `compression-update` (com consulta a cada 5 s só como alternativa e reposição ao voltar a ligação), os cinco estados comuns, projetos partilhados enviados ao projeto do dono com o link, mensagens de erro em português com causa e ação, transferência autenticada sem o JWT no endereço, aviso quando o resultado é maior do que o original, e cancelamento em fila e em processamento sem cliques repetidos.], [REQ-VID-COMP-005, 006, 012, 013; REQ-VID-STATUS-001, 002; REQ-VID-CANCEL-001; REQ-VID-QUOTA-001; REQ-VID-SEC-001], [Passa (25/25)],

    [TST-BLUR-01], [Automático (ponta a ponta, ferramenta)], [Dado um vídeo de 20 s a 720p com áudio, quando é anonimizado (desfocagem gaussiana), então o resultado é H.264/AAC com 20,0 s, o desfasamento som/imagem é 8 ms, o original mantém o SHA-256, não ficam ficheiros temporários e o progresso é enviado 21 vezes (no máximo a cada 0,53 s, até 100%). Tempo: 18,4 s (0,92× a duração; alvo MVP ≤ 3×).], [REQ-VID-STATUS-001, 002; REQ-VID-BLUR-008, 016; REQ-VID-ORIG-001; REQ-VID-CLEAN-001; REQ-VID-OUTPUT-001], [Passa],
    [TST-BLUR-02], [Automático (ponta a ponta, ferramenta)], [Dado um vídeo de 10 s a 1080p sem áudio, quando é anonimizado em mosaico, então o resultado é H.264 com 10,0 s e sem faixa de áudio. Tempo: 17,5 s (1,75× a duração; alvo MVP ≤ 3×, definido a 720p).], [REQ-VID-BLUR-016; REQ-VID-OUTPUT-001], [Passa],
    [TST-BLUR-03], [Automático (ponta a ponta, ferramenta)], [Dado um vídeo sintético sem rostos nem matrículas, quando é anonimizado, então devia haver 0 deteções e o utilizador ser avisado (FA2). Foram contadas 1294 deteções falsas em 600 fotogramas, porque os classificadores Haar não aplicam o limiar de confiança de 0,65.], [REQ-VID-BLUR-007, 009], [Falha],
    [TST-BLUR-04], [Manual (interface)], [Com o sistema a correr: vídeo de 70 s e vídeo 4K numa conta free, ficheiro corrompido, quota esgotada, utilizador premium, cancelamento a meio e reaplicação sem alterações.], [REQ-VID-BLUR-002, 010, 011; REQ-VID-QUOTA-001, 002, 003; REQ-VID-CANCEL-001], [Passa no fluxo principal e, pela API (TST-VID-01), nos limites free, premium sem desconto, cancelamento e reaplicação. Ficheiro corrompido: sem resultado],

    [TST-LEG-01], [Automático (_frontend_ e `projects`)], [18 testes: os pedidos REST mantêm quem executa, o dono e o idioma; confirmar, rejeitar e cancelar usam as rotas existentes; respostas de outro trabalho, projeto ou vídeo são rejeitadas; a transferência obtém um URL novo sem enviar o JWT ao armazenamento; os tempos usam HH:MM:SS,mmm com arredondamento correto; a pré-visualização segue o tempo do vídeo; a devolução da quota só é assumida quando o servidor a confirma; os estados usam os nomes comuns; o `projects` recusa outros idiomas e vídeos com mais de 10 minutos antes de criar o pedido; todas as ferramentas de vídeo (compressão, legendas, remoção de silêncios e o painel genérico da anonimização e da remoção de fundo) usam os cinco nomes de estado comuns.], [REQ-VID-LEG-004, 007; REQ-VID-STATUS-001; REQ-VID-LEG-011, 012, 013, 014, 015, 020, 025; REQ-VID-CANCEL-001; REQ-VID-FAIL-001; REQ-VID-QUOTA-002; REQ-VID-SEC-001], [Passa (18/18)],
    [TST-LEG-03], [Automático (unitário)], [Ficheiro: `Tools/subtitle_generation/tests/test_limits.py`. 7 testes: o tempo máximo é 3× a duração + 60 s; na geração do SRT é conhecido logo, na transcrição é calculado quando o serviço lê a duração (até lá vale o limite de reserva); um tempo excedido não é repetido automaticamente; 10 minutos e 100 MB são aceites no limite exato e recusados acima, no ficheiro real.], [REQ-VID-TIMEOUT-001; REQ-VID-LEG-006, 007], [Passa (7/7)],
    [TST-LEG-04], [Automático (unitário)], [Ficheiro: `Tools/subtitle_generation/tests/test_stt_timeline.py`. 5 testes: dado um vídeo de 10,5186 s e um último segmento reconhecido até 10,56 s (o caso do teste manual, que falhava), o fim é ajustado a 10,5186 s; um segmento que começa depois do fim é descartado; uma pequena sobreposição começa no fim do anterior; segmentos dentro do vídeo não mudam; segmentos editados pelo utilizador continuam a ser recusados.], [REQ-VID-LEG-010, 011, 012], [Passa (5/5)],
    [TST-LEG-02], [Manual (interface)], [Com o sistema a correr: vídeo falado em PT e em EN até 10 min, vídeo sem áudio, vídeo acima de 100 MB, rejeição e nova geração, cancelamento e transferência do SRT.], [REQ-VID-LEG-002, 003, 006, 007, 010, 016, 019, 020], [Na primeira execução (21-10-2026), um vídeo de 10 s em inglês ficou Falhada: o último segmento acabava depois do fim do vídeo (corrigido; TST-LEG-04). Depois da correção, passa (transcrição, revisão e SRT). PT, vídeo sem áudio e cancelamento na interface: não verificados],

    [TST-BG-01], [Manual (interface)], [Com o sistema a correr: os três modos (chroma key, cor sólida, Bokeh), intervalo temporal, Bokeh bloqueado numa conta free, vídeo acima de 30 s ou 720p numa conta free, cancelamento e sincronização do áudio.], [REQ-VID-BG-003, 004, 005, 006, 013, 030; REQ-VID-CANCEL-001; REQ-VID-SYNC-001], [Na primeira execução (21-10-2026), cada vídeo esgotava o tempo máximo e a interface não mostrava o erro (corrigido; TST-BG-02 e TST-FAIL-01). Depois da correção, passa; os restantes cenários estão em TST-VID-01],
    [TST-BG-02], [Automático (unitário e medição)], [Ficheiro: `Tools/video_bg_remove/tests/test_keyframes.py`. 4 testes: a IA corre num fotograma em cada três e todos os fotogramas são escritos; as máscaras intermédias são a interpolação das máscaras-chave (0; 0,3; 0,6; 0,9); fora do intervalo não há inferência; ao exceder o tempo máximo, o FFmpeg é terminado sem ficar processo zombie e o resultado parcial é apagado. Medição: vídeo de 10,5 s (315 fotogramas, 854×480) processado em 20 s, para um limite de 91,5 s.], [REQ-VID-BG-011, 031], [Passa (4/4)],

    [TST-QUOTA-01], [Automático (contrato)], [Ficheiro: `projects/tests/priority_queues.test.cjs`. 5 testes: dado um pedido de anonimização ou de remoção de fundo, então vai para a fila própria da ferramenta, com prioridade 5 se for Premium e 0 se for Free, e nunca para a `high_priority_queue`; as ferramentas de imagem mantêm a fila e o formato; a fila é declarada com prioridade e ligada antes de publicar; as definições do RabbitMQ têm as duas filas novas e já não têm filas sem consumidor.], [REQ-VID-QUOTA-003], [Passa (5/5)],
    [TST-QUOTA-02], [Automático (unitário e RabbitMQ real)], [Ficheiro: `Tools/utils/tests/test_priority_queues.py`. 6 testes: os serviços de anonimização e de remoção de fundo leem a sua fila com prioridade, um pedido de cada vez e com confirmação manual; o pedido só é confirmado depois de tratado, mesmo que falhe; o envio de resultados volta a declarar a fila com os mesmos argumentos; as ferramentas de imagem não mudam. No RabbitMQ real: dados dois pedidos Free e depois um Premium, o Premium é o primeiro a ser processado.], [REQ-VID-QUOTA-003], [Passa (6/6)],
    [TST-FAIL-01], [Automático (unitário)], [Ficheiro: `Tools/utils/tests/test_tool_errors.py`. 2 testes: a mensagem de erro de uma ferramenta tem o identificador do pedido no mesmo campo que uma mensagem de sucesso, para o `projects` a encontrar, e leva o código e o texto do erro.], [REQ-VID-FAIL-001], [Passa (2/2)],
    [TST-VID-01], [Automático (API)], [Ficheiro: `Tools/silence_removal/tests/e2e_video_requirements.py`. Com o sistema a correr, cria contas free, premium e anónima e verifica: anónimo recusado nas cinco ferramentas; AVI, vídeo de 130 s (free) e vídeo sem som recusados na remoção de silêncios; limites free da anonimização e da remoção de fundo, Bokeh bloqueado no free; premium sem desconto; cancelamento e reaplicação sem alterações; sem quota, pedido recusado; conflito de versão (409); SHA-256 do original e desfasamento som/imagem; tempo de aceitação e de compressão.], [REQ-VID-AUTH-001; REQ-VID-SUBMIT-002; REQ-VID-ORIG-001; REQ-VID-SYNC-001; REQ-VID-SIL-003, 004, 005; REQ-VID-COMP-035; REQ-VID-BLUR-002, 010, 011; REQ-VID-BG-003, 005, 006, 013, 015, 029, 030], [Passa, exceto: os limites só são recusados com os metadados enviados pela interface, o intervalo da remoção de fundo não é validado no servidor e o resultado não tem o sufixo `_sem_fundo`],
  ),
)

Num teste manual com o sistema completo a correr (21-10-2026), as cinco ferramentas concluíram o fluxo principal com
um vídeo de 10 s. A remoção de silêncios, a compressão e a anonimização funcionaram à primeira; a remoção de fundo e
as legendas falharam e foram corrigidas (ver as limitações abaixo).

No total, os 174 testes automáticos existentes no repositório passam: 12 da remoção de silêncios (mais a
demonstração ponta a ponta), 115 da compressão (37 em Python, 33 da API, 20 da quota e 25 do _frontend_), 30 das
legendas (18 do _frontend_ e do `projects` e 12 do serviço), 4 da remoção de fundo, 11 da prioridade Premium (5 do
`projects` e 6 dos serviços) e 2 das mensagens de erro das ferramentas. Dos três testes de ponta a ponta da anonimização, registados na execução anterior, dois passam e um falha.
Os valores medidos dos requisitos de desempenho ficam abaixo dos alvos do MVP: análise de silêncios a 0,006× (alvo
≤ 0,1×), cortes a 0,08× (alvo ≤ 1,5×) anonimização a 0,92× em 720p e 1,75× em 1080p (alvo ≤ 3×) e compressão a 0,10× (alvo ≤ 1,5×). A remoção de fundo processou um vídeo de
10,5 s em 20 s, cerca de 1,9× a duração (alvo MVP ≤ 3×). O desfasamento
entre som e imagem foi de 0 ms na remoção de silêncios, 8 ms na anonimização e 15 ms na remoção de fundo (alvo ≤ 40 ms).



== Limitações e defeitos conhecidos

Na anonimização, os classificadores Haar do OpenCV não devolvem um valor de confiança, por isso o limiar de
0,65 previsto na regra RN4 do UC-VID-003 não chega a ser aplicado. Em imagens com padrões regulares aparecem
deteções falsas (TST-BLUR-03) e o fluxo alternativo "nenhum elemento detetado" (FA2) quase nunca acontece. Os
requisitos REQ-VID-BLUR-007 e 009 ficam, por isso, parcialmente cumpridos; a correção prevista é passar a usar
um detetor com pontuação de confiança, como o DNN do OpenCV. Também o áudio não é tratado como a regra RN3 pede:
em vez de ser copiado sem alteração, é recodificado em AAC, e se a junção com o FFmpeg falhar o resultado é
guardado sem áudio e com o _codec_ `mp4v` em vez de H.264.

O teste manual revelou três defeitos, que já foram corrigidos. A remoção de fundo corria a IA em todos os
fotogramas, com 0,3 a 0,4 s por fotograma em CPU, e esgotava o tempo máximo até num vídeo de 10 s; passou a usar
o modelo `u2netp` num fotograma em cada três, com interpolação entre eles (TST-BG-02). As mensagens de erro das
ferramentas que respondem pela fila do `projects` traziam o identificador do pedido no campo errado e eram
ignoradas, pelo que a interface nunca mostrava o estado "Falhada" (T-07; TST-FAIL-01). Por fim, as legendas
falhavam quando o reconhecimento fazia acabar o último segmento depois do fim do vídeo, e esse fim passou a ser
ajustado à duração (TST-LEG-04).

A solução adotada na remoção de fundo tem um custo: nos dois fotogramas entre máscaras-chave, um movimento muito
rápido pode deixar o contorno ligeiramente atrasado, e o modelo `u2netp` deixa ainda um halo claro e fino em
alguns contornos. Nesta ferramenta e na anonimização, a validação dos limites depende dos dados enviados pela
interface (TST-VID-01): a duração e a resolução do vídeo vêm do _browser_, o servidor não lê o ficheiro e aceita
um pedido sem esses dados. O intervalo da remoção de fundo também só é validado na interface, e o resultado fica
com o nome do original em vez de `<nome>_sem_fundo.mp4`. Por estes motivos, os requisitos REQ-VID-BLUR-002 e
010 e REQ-VID-BG-005, 006 e 015 ficam parciais.

Há também aspetos que ainda não foram verificados. Como não existe um conjunto de vídeos anotados à mão, a
exatidão pedida em REQ-VID-BLUR-022, REQ-VID-SIL-033 e REQ-VID-LEG-045 não foi medida com o critério completo.
Ficaram igualmente por testar cinco pedidos de remoção de silêncios em simultâneo (REQ-VID-SIL-030), o aviso aos
60 s da anonimização (REQ-VID-BLUR-012), as legendas em português e de vídeos sem áudio e a reprodução em
Firefox e Safari. Os testes ponta a ponta da anonimização (TST-BLUR-01 a 03) foram executados, mas não estão
guardados no repositório. Os tempos de processamento indicados foram medidos com vídeos sintéticos curtos, num
único computador e sem pedidos simultâneos, pelo que a capacidade com vários pedidos não foi avaliada.

Por último, o MVP assume algumas limitações de forma consciente: o processamento corre apenas em CPU, os pedidos
que falham não são repetidos automaticamente e os _uploads_ estão limitados a 100 MB pelo Nginx.
