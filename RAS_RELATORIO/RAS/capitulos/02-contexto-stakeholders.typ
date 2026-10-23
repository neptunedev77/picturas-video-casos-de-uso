#import "../template.typ": *

= Contexto, Perfis e _Stakeholders_

#orientacao[
  Capítulo de *revisão*: só registam o que muda com o vídeo. Não copiem o documento de base.
  - Os *perfis de utilização* (anónimo, registado, premium) continuam válidos? Que limites passam a
    existir para vídeo (duração, tamanho, resolução, nº de operações)? Um vídeo conta como uma operação?
  - Surgem *novos _stakeholders_* ou *interesses novos* nos existentes (e.g., custo de processamento e armazenamento
    para o proprietário do sistema; equipa de operações)?
  - Os _stakeholders_ aqui listados devem ser os mesmos que aparecem na secção "_Stakeholders_ e Interesses"
    de cada caso de uso — usem os mesmos nomes.
]

== Perfis de utilização e vídeo

Os três perfis da solução de base mantêm-se. O que muda é que as ferramentas de vídeo passam a ter limites
próprios por perfil e que cada execução de uma ferramenta de vídeo sobre um vídeo conta como *uma operação*,
independentemente da duração do vídeo; não se conta por minuto nem por fotograma. A remoção de silêncios tem
ainda uma contagem à parte para as análises, que não gastam operações. Em todos os perfis, o _upload_ está
limitado a 100 MB pelo Nginx.

Este limite técnico de upload sobrepõe-se, no MVP, aos limites de tamanho mais altos
definidos nalguns casos de uso (200 MB e 2 GB na remoção de silêncios; 500 MB e 2 GB na
compressão): esses valores são o alvo para produção e só passam a ser atingíveis quando o
limite de upload for aumentado na Fase 2. Manteve-se o limite de 100 MB no MVP porque os
testes correm em CPU nas máquinas da equipa e vídeos maiores tornariam o processamento e o
armazenamento demasiado pesados. Assim, no MVP, a diferença entre planos está na duração,
na resolução, na quota diária e na prioridade na fila.

#tab([Perfis de utilização e respetivo acesso a vídeo],
  tabela(
    colunas: (2.6cm, 4.2cm, 1fr, 2.6cm),
    [Perfil], [Situação na _baseline_], [Alteração introduzida para vídeo], [Regras / requisitos],
    [Anónimo], [Operações limitadas, imagens pequenas], [Sem acesso às ferramentas de vídeo, por causa do custo de processamento e por não haver quota associada a uma sessão anónima; o pedido é recusado (403).], [UC-VID-001/Q1; UC-VID-003/RN2; UC-VID-005/RN0; REQ-VID-SIL-001; REQ-VID-BLUR-002; REQ-VID-BG-001; REQ-VID-AUTH-001],
    [Registado], [Gratuito, até 5 operações/dia], [Mantém as 5 operações/dia, partilhadas entre imagem e vídeo; cada execução de uma ferramenta de vídeo conta como 1 operação. Limites por ferramenta: silêncios até 2 min, 1080p e 200 MB, com até 15 análises/dia que não gastam operações; compressão até 10 min e 500 MB; anonimização até 60 s e 1080p; legendas até 10 min e 100 MB; remoção de fundo até 30 s e 720p, sem o modo _bokeh_.], [UC-VID-001/RN1, RN2, RN6, RN9; UC-VID-002/RN3, RN7; UC-VID-003/RN1, RN2; UC-VID-004/RN6; UC-VID-005/RN3, RN4; REQ-VID-SIL-004, 006; REQ-VID-QUOTA-001, 002; REQ-VID-COMP-007; REQ-VID-BLUR-002; REQ-VID-LEG-006, 007; REQ-VID-BG-003, 006],
    [Premium], [Pago, uso ilimitado], [Mantém o uso ilimitado, sem desconto de operações. Limites maiores: silêncios até 30 min, 4K e 2 GB; compressão até 60 min e 2 GB; anonimização até 300 s e 4K; legendas iguais ao registado (10 min e 100 MB); remoção de fundo até 180 s e 1080p, com todos os modos. Prioridade na fila de processamento em todas as ferramentas de vídeo (RNG-07).], [UC-VID-001/RN1, RN2, RN9; UC-VID-002/RN3; UC-VID-003/RN1, RN2; UC-VID-004/RN6; UC-VID-005/RN3; REQ-VID-QUOTA-003; REQ-VID-BG-030],
  ),
)

*Momento do desconto.* Em todas as ferramentas de vídeo, a operação de um utilizador Registado é verificada antes de o pedido entrar na fila e só fica descontada quando o processamento termina com sucesso; recusas, cancelamentos, falhas e tempo excedido não descontam operações (RNG-04, REQ-VID-QUOTA-001 e 002). Num projeto partilhado, a operação é descontada a quem executa o pedido e não ao dono do projeto (RNG-05). Os casos de uso tinham inicialmente regras diferentes (ao entrar na fila, ao arrancar ou só no sucesso); a regra comum e o seu alinhamento na implementação estão no Cap. 6 ("Conflitos entre funcionalidades").

== _Stakeholders_ e interesses

#tab([_Stakeholders_ e interesses],
  tabela(
    colunas: (3cm, 2cm, 1fr, 2cm, 2.6cm),
    [_Stakeholder_], [Estado], [Interesse(s) relativamente ao vídeo], [Influência], [UC / requisitos],
    [Utilizador (registado ou premium)], [Revisto], [Editar vídeos sem trabalho manual nem ferramentas externas: encurtar (silêncios), reduzir o tamanho (compressão), proteger dados de terceiros (anonimização), tornar acessível (legendas) e trocar o fundo sem estúdio (remoção de fundo). Quer resultados fiáveis (som sincronizado, original intacto), acompanhar o progresso e não pagar por operações que falham.], [Alta], [UC-VID-001 a UC-VID-005],
    [Convidado por link (com permissão de edição)], [Revisto], [Aplicar ferramentas de vídeo num projeto partilhado e acompanhar o progresso na sua sessão; a operação é descontada a quem a executa.], [Média], [UC-VID-003],
    [Proprietário do sistema], [Revisto], [Oferecer funcionalidades de vídeo com apelo comercial, que incentivem o registo e o plano premium, mantendo controlados os custos de processamento (CPU e modelos de IA) e de armazenamento através de quotas e limites por perfil; cumprir o RGPD (anonimização).], [Alta], [UC-VID-001 a UC-VID-005],
    [Equipa de desenvolvimento e operações], [Novo], [Integrar processamento de vídeo e de IA (FFmpeg, reconhecimento de fala, deteção, segmentação) sem alterar as ferramentas de imagem; garantir processamento assíncrono, isolamento em contentores, tolerância a falhas, limpeza de ficheiros temporários e sincronização entre som e imagem.], [Média], [UC-VID-001 a UC-VID-005; Cap. 8],
  ),
)



== Elicitação de requisitos

#orientacao[
  Um parágrafo: como chegaram às funcionalidades, regras e valores-alvo (e.g., análise da solução existente,
  _benchmarking_, entrevistas, assunções registadas), com quem, e que resultados concretos produziu (IDs).
  Os valores numéricos dos requisitos (limites, tempos) devem ter origem identificável.
]

A elicitação dos requisitos da extensão de vídeo foi feita pela equipa, sem entrevistas a utilizadores
externos, a partir de três fontes.

A primeira foi a análise da documentação de requisitos e de arquitetura e
do código da solução de base, que identificou os mecanismos a reutilizar ou estender (perfis e quota de 5
operações diárias, autenticação, partilha de projetos, armazenamento, fila de mensagens e notificações em tempo
real) e originou os requisitos ALT (e.g., REQ-VID-SIL-006; REQ-VID-QUOTA-001, 002; REQ-VID-STATUS-001). 

A segunda foi a análise de ferramentas
e bibliotecas de referência para cada funcionalidade (editores de vídeo com remoção de silêncios, FFmpeg,
reconhecimento de fala, deteção de rostos e segmentação de pessoas), que definiu as opções oferecidas ao
utilizador e os parâmetros técnicos, como os perfis de deteção de silêncios (REQ-VID-SIL-002) e os níveis de
compressão por CRF (UC-VID-002/RN5).

A terceira foi a prototipagem e o teste das funcionalidades durante a
implementação do MVP, que refinou fluxos, estados, erros e critérios de aceitação e permitiu medir os alvos
de desempenho e qualidade nas máquinas da equipa (e.g., REQ-VID-SIL-028 e 033, REQ-VID-TIMEOUT-001 e REQ-VID-LEG-045; resultados
no Cap. 10). Os valores
numéricos têm origem registada: os herdados da solução de base mantêm-se; os limites por perfil e os alvos de
desempenho e qualidade do MVP são decisões da equipa, registados como assunções ou decisões de qualidade e
justificados no caso de uso respetivo (e.g., UC-VID-001/A7 a A10 para os limites e a tolerância de
sincronização de 40 ms; UC-VID-004/RN6 para os limites de tamanho e duração, REQ-VID-LEG-006 e 007).

Uma
revisão cruzada dos cinco casos de uso identificou divergências entre eles (momento do desconto da quota,
nomes dos estados, formatos aceites), a resolver em conjunto como regras transversais (Cap. 3.4).
