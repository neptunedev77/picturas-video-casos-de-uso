#import "../template.typ": *

= Visão Geral da Extensão de Vídeo

== Funcionalidades de vídeo do MVP

#orientacao[
  Listem *todas* as funcionalidades de vídeo tratadas no relatório, cada uma com o respetivo caso de uso.
  A especificação detalhada está na Parte II, organizada por artefacto (casos de uso, ERS, impacto, …).
  Não há um número mínimo: valoriza-se a *profundidade, coerência e complexidade adequada* de cada funcionalidade.
  Operações triviais (e.g., gerar uma miniatura a partir de um único fotograma) não são suficientes.
  Requisitos partilhados por várias funcionalidades (e.g., submeter vídeo, acompanhar o estado do processamento)
  devem ser especificados *uma só vez* (e.g., `REQ-VID-SUBMIT-001`, com origem em vários casos de uso).
]

O MVP acrescenta ao PictuRAS cinco funcionalidades de vídeo, cada uma com o seu caso de uso, o seu prefixo de
requisitos e um serviço de processamento próprio. Todas partilham a base de suporte a vídeo (carregamento de
vídeos até 100 MB, reprodução no editor e barra de ferramentas de vídeo) e os mecanismos de quota, fila de
processamento e notificações em tempo real descritos nas regras transversais (secção 3.4).

#tab([Funcionalidades de vídeo do MVP],
  tabela(
    colunas: (1fr, 2.1cm, 2.3cm, 2cm, 2.4cm, 2.4cm),
    [Funcionalidade], [Caso de uso], [Prefixo(s) REQ], [Perfis], [Dependências], [Estado de implementação],
    [Remover silêncios e pausas de um vídeo, com revisão manual dos cortes], [UC-VID-001], [REQ-VID-SIL], [Reg., Prem.], [Carregar vídeo; quota diária; RNG-01 a RNG-08], [Implementada],
    [Comprimir e otimizar um vídeo com escolha do nível de qualidade], [UC-VID-002], [REQ-VID-COMP], [Reg., Prem.], [Carregar vídeo; quota diária; RNG-01 a RNG-08], [Implementada],
    [Anonimizar rostos e matrículas num vídeo], [UC-VID-003], [REQ-VID-BLUR], [Reg., Prem.], [Carregar vídeo; quota de operações avançadas; RNG-01 a RNG-08], [Implementada (limiar de confiança parcial)],
    [Gerar legendas automáticas a partir do áudio], [UC-VID-004], [REQ-VID-LEG], [Reg., Prem.], [Carregar vídeo; quota diária; RNG-01 a RNG-08], [Implementada],
    [Remover e substituir o fundo de um vídeo por IA], [UC-VID-005], [REQ-VID-BG], [Reg., Prem. (modo Bokeh só Prem.)], [Carregar vídeo; quota de operações avançadas; RNG-01 a RNG-08], [Implementada],
  ),
)



- *UC-VID-001 — Remover silêncios e pausas*: é uma das operações mais pedidas por quem grava aulas, podcasts,
  tutoriais e reuniões, e poupa muito trabalho manual. Valida o processamento do áudio, a apresentação de um
  resultado intermédio para revisão pelo utilizador e a manutenção da sincronização entre som e imagem depois dos
  cortes. Como a análise não gasta quota, o utilizador só paga por um resultado que confirmou.
- *UC-VID-002 — Comprimir e otimizar vídeo*: reduz o tamanho dos ficheiros mantendo uma qualidade adequada, o que
  é útil para partilhar vídeos. É a funcionalidade mais simples e valida o fluxo completo de base: carregamento,
  análise das propriedades do vídeo, escolha de parâmetros, processamento assíncrono e geração de um novo ficheiro.
- *UC-VID-003 — Anonimizar rostos e matrículas*: responde a uma necessidade de privacidade e de conformidade com o
  RGPD na partilha de vídeos. Estende para o domínio temporal os modelos de visão por computador que o PictuRAS já
  usa em imagem, validando a deteção e o seguimento de alvos ao longo dos fotogramas, a preservação do áudio e o
  acompanhamento do progresso em tempo real.
- *UC-VID-004 — Gerar legendas automáticas*: melhora a acessibilidade e permite consultar em texto o que é dito no
  vídeo. Valida um fluxo diferente dos restantes, porque o resultado não é um novo vídeo mas um ficheiro de legendas
  sincronizado, obtido por reconhecimento de fala sobre a faixa de áudio.
- *UC-VID-005 — Remover e substituir o fundo por IA*: é a extensão para vídeo da ferramenta de imagem
  `bg_remove_ai` e a funcionalidade com maior impacto visual. Valida a inferência pesada de IA ao longo do vídeo
  sem sobrecarregar o servidor e a diferenciação entre planos (o modo Bokeh é exclusivo do Premium).

== Diagrama de casos de uso 

#orientacao[
  *Ponto crítico a atualizar.* O diagrama de base (Figura abaixo) só contém casos de uso de imagem.
  O diagrama atualizado deve:
  - incluir todos os casos de uso UC-VID-nnn (e distinguir visualmente os novos — por exemplo, cor diferente);
  - indicar que perfil (ator) acede a cada um — coerente com as regras de negócio e com a tabela de perfis.
  Podem manter os casos de uso de imagem a cinzento, para dar contexto.
]

#figure(
  image("../images/projeto/diagrama_casos_uso.png", width: 100%),
  caption: [Diagrama de casos de uso atualizado (Fase 1 — vídeo)],
)

O diagrama separa, dentro do sistema PictuRAS, os casos de uso de imagem da solução de base, a cinzento e apenas
para contexto, dos casos de uso de vídeo introduzidos nesta fase, a laranja. Acrescentou-se o caso de uso
*Carregar vídeo*, comum a todas as funcionalidades, e os cinco casos de uso UC-VID-001 a UC-VID-005.

Como todas as funcionalidades de vídeo são assíncronas e permitem acompanhar e cancelar o processamento, esse
comportamento comum foi modelado uma única vez, no caso de uso *Acompanhar e cancelar processamento de vídeo*,
incluído («include») pelos cinco. A revisão dos troços a remover é incluída apenas pelo UC-VID-001, porque faz parte
do seu fluxo principal. A desfocagem de profundidade (Bokeh) foi modelada como extensão («extend») do UC-VID-005,
por ser um comportamento opcional e exclusivo do plano Premium.

Quanto aos atores, o *Utilizador Registado* (plano Free) acede a todos os casos de uso de vídeo, sujeito à quota
diária e aos limites de cada funcionalidade. O *Premium* e o *Utilizador Convidado* (com permissão de edição num
projeto partilhado) são especializações do Utilizador Registado e herdam os seus casos de uso; o Premium tem ainda
acesso ao assistente IA e ao modo Bokeh. O *Anónimo* mantém apenas os casos de uso de imagem e não está associado a
nenhum caso de uso de vídeo (RNG-01). A nota do diagrama resume os limites de cada funcionalidade por plano.

== Modelo de domínio

#orientacao[
  *Ponto crítico a atualizar.* O modelo de base é centrado em `Imagem`. Com vídeo, pensem (pelo menos) em:
  - Como se relaciona `Vídeo` com `Imagem`? Especialização de um conceito comum (e.g., ficheiro de média),
    ou conceito independente? Que atributos de domínio são relevantes (duração, resolução, formato, …)?
  - Um `Projeto` passa a conter vídeos? Imagens e vídeos misturados?
  - O processamento de vídeo é demorado: há um conceito de *trabalho/pedido de processamento* com estado
    (em fila, a processar, concluída, falhada, cancelada)? Qual o seu resultado?
  - Que `Ferramenta`s se aplicam a vídeo? As ferramentas de imagem aplicam-se a fotogramas?
  - Como se representam quotas/limites por perfil?
  O modelo de domínio descreve *conceitos do problema*, não classes, tabelas nem microserviços.
  Usem os mesmos termos que nos casos de uso e requisitos (se é "biblioteca", não passa a "galeria").
]

#figure(
  image("../images/projeto/modelo_dominio.png", width: 100%),
  caption: [Modelo de domínio (Fase 1 — vídeo)],
)

O modelo de base, centrado em `Imagem`, foi generalizado com o conceito abstrato `Ficheiro de Média` (nome,
formato, tamanho, resolução e data de carregamento), especializado em `Imagem` e `Vídeo`. O `Vídeo` acrescenta a
duração, os fotogramas por segundo e a indicação de ter áudio. Desta forma, um `Projeto` passa a conter imagens e
vídeos misturados e o `Utilizador` carrega ficheiros de média, mantendo-se as restantes relações da base.

Como o processamento de vídeo é demorado e assíncrono, introduziu-se o `Pedido de Processamento`, com o seu
`Estado do Pedido` (em fila, a processar, concluída, falhada, cancelada), o progresso, os parâmetros, o
intervalo temporal e a prioridade na fila. Cada pedido aplica uma `Ferramenta de Vídeo` a um vídeo original e
gera um novo vídeo como resultado (edição não destrutiva) ou, no caso do UC-VID-004, `Legenda`s associadas ao
vídeo. As ferramentas de imagem continuam a alterar apenas imagens; não se aplicam a fotogramas de vídeo no MVP.

As quotas e os limites por plano são representados pela `Quota Diária` do utilizador Gratuito, descontada apenas
pelos pedidos concluídos (RNG-04), e pelos `Limite de Vídeo` que cada ferramenta define para os planos Gratuito e
Premium (duração, resolução e tamanho máximos). O `Troço de Silêncio` suporta a revisão manual dos cortes do
UC-VID-001. As cores distinguem os conceitos da base inalterados, os alterados (`Projeto` e `Imagem`) e os novos.
#pagebreak()

== Regras de negócio transversais

#orientacao[
  Regras que se aplicam a *várias* funcionalidades ficam aqui, com ID global `RNG-nn`
  (e.g., formatos aceites, como o vídeo conta para a quota diária, tempo de retenção de ficheiros).
  As regras específicas de uma funcionalidade ficam no respetivo caso de uso (RN1, RN2, …) e, nas tabelas
  partilhadas por todas as funcionalidades (ERS, impacto, rastreabilidade), escrevem-se qualificadas
  (`UC-VID-001/RN2`). As decisões de qualidade (`DQ-nnn`) estão reunidas no capítulo de Rastreabilidade.
]

#tab([Regras de negócio transversais],
  tabela(
    colunas: (1.6cm, 1fr, 3cm, 3cm),
    [ID], [Regra], [Origem / justificação], [Requisitos],
    [RNG-01], [As funcionalidades de vídeo estão disponíveis apenas para utilizadores autenticados (planos Free e Premium); o perfil anónimo não tem acesso.], [Q1 do UC-VID-001 e Q9 do UC-VID-004; RN2 do UC-VID-003; RN0 do UC-VID-005; custo de processamento.], [REQ-VID-SIL-001; REQ-VID-BLUR-002; REQ-VID-AUTH-001],
    [RNG-02], [Todas as funcionalidades aceitam vídeos MP4 e MOV com vídeo H.264 e áudio AAC; o resultado é sempre um MP4 H.264/AAC.], [Reprodução nativa nos browsers atuais; RN9 do UC-VID-001, RN4 do UC-VID-002, RN3 do UC-VID-003.], [REQ-VID-SIL-003; REQ-VID-OUTPUT-001; REQ-VID-INPUT-001; REQ-VID-LEG-031],
    [RNG-03], [O processamento nunca altera o vídeo original: o resultado é sempre guardado como um novo ficheiro no projeto.], [Edição não destrutiva, comum aos cinco casos de uso.], [REQ-VID-SIL-022; REQ-VID-ORIG-001],
    [RNG-04], [No plano Free, cada processamento de vídeo conta como uma operação na quota diária: a operação é reservada quando o pedido é aceite e só fica descontada se o processamento terminar com sucesso; é devolvida em caso de falha, cancelamento ou timeout. O plano Premium não tem limite diário.], [Decisão comum da equipa; UC-VID-001/RN1 e RN7, UC-VID-003/RN1, UC-VID-004/Q10, UC-VID-005/RN4.], [REQ-VID-QUOTA-001, 002; REQ-VID-BLUR-009],
    [RNG-05], [Em projetos partilhados, a operação é descontada a quem executa o processamento, e não ao dono do projeto.], [Decisão comum da equipa (Q2 do UC-VID-001 e do UC-VID-003).], [REQ-VID-QUOTA-001, 002],
    [RNG-06], [O processamento de vídeo é assíncrono: o pedido é validado e colocado na fila, o utilizador acompanha o estado (em fila, a processar, concluída, falhada, cancelada) em tempo real e pode cancelá-lo a qualquer momento.], [Um vídeo pode demorar minutos a processar; DQ-001.], [REQ-VID-STATUS-001; REQ-VID-SIL-020; REQ-VID-CANCEL-001; REQ-VID-SUBMIT-002, 001],
    [RNG-07], [Os limites de duração, resolução e tamanho dependem da funcionalidade e do plano e são verificados antes de o pedido ser colocado na fila; cada caso de uso justifica os seus limites (as ferramentas com IA têm limites mais baixos por serem mais pesadas). Os pedidos Premium têm prioridade na fila em todas as ferramentas.], [Custo de processamento de cada funcionalidade; limites indicados em cada caso de uso.], [REQ-VID-SIL-004; REQ-VID-QUOTA-003; REQ-VID-COMP-017; REQ-VID-BLUR-002; REQ-VID-BG-006],
    [RNG-08], [Um processamento que exceda o tempo máximo da funcionalidade é interrompido automaticamente, fica com o estado "falhada" e os ficheiros temporários são apagados.], [Evita pedidos bloqueados indefinidamente e o esgotamento do espaço dos serviços.], [REQ-VID-TIMEOUT-001; REQ-VID-BLUR-012; REQ-VID-CLEAN-001; REQ-VID-BG-031],
  ),
)
#pagebreak()
== Convenções de identificação

#tab([Convenções de identificação],
  tabela(
  colunas: (4.2cm, 1fr),
  [Identificador], [Utilização],
  [UC-VID-nnn], [Caso de uso de vídeo (numeração única no relatório, a partir de UC-VID-001)],
  [REQ-VID-{FUNC}-nnn], [Requisito (funcional ou não funcional); {FUNC} identifica a funcionalidade: SIL (remover silêncios), COMP (comprimir), BLUR (anonimizar), LEG (legendas) e BG (remover fundo); IDs nunca se reutilizam],
  [RN#emph[k], A#emph[k], Q#emph[k], FA#emph[k]], [Regra, assunção, questão em aberto e fluxo alternativo de um caso de uso (locais ao caso de uso; qualificados, e.g. `UC-VID-001/RN2`, nas tabelas partilhadas)],
  [RNG-nn / DQ-nnn], [Regra de negócio transversal / decisão de qualidade (globais)],
  [DA-nn], [Decisão arquitetural (Capítulo de Arquitetura)],
  [TST-{FUNC}-nn], [Teste (automático ou manual)],
  [T-nn], [Tarefa de manutenção corretiva da solução de base],
  [UCnn, RFnn, RNFnn], [Elementos do documento de requisitos de base (referidos quando são alterados — ALT)],
  ),
)
