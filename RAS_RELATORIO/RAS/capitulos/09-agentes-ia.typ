#import "../template.typ": *

= Implementação Assistida por Agentes de IA

#orientacao[
  Obrigatório (enunciado): documentar as ferramentas e _skills_ utilizadas, enumerar as tarefas apoiadas e
  comprovar a validação realizada — tanto na especificação como no código
  e nos testes. A equipa é responsável por todo o conteúdo entregue, incluindo o gerado por IA.
  Valoriza-se evidência concreta (_commits_, _pull requests_, ficheiros de configuração dos agentes) e
  reflexão crítica (onde a IA errou e como isso foi detetado).
]

== Ferramentas, modelos e configuração

#tab([Ferramentas de IA, modelos e configuração],
  tabela(
  colunas: (3.5cm, 1fr),
  [Ferramenta / modelo], [Configuração e utilização (_skills_, instruções de projeto, MCP, …)],
  [Claude Code (Claude Opus 5.5, Anthropic)], [Assistente usado no repositório para apoiar a implementação e os testes. Não foram criadas _skills_, instruções de projeto (`CLAUDE.md`) nem servidores MCP próprios. A equipa definiu o que fazer em cada tarefa, deu as instruções e reviu e aprovou cada alteração antes de a integrar.],
  [Claude (chat)], [Usado em conversa, sem configuração adicional, para discutir alternativas, rever texto e propor uma estrutura inicial para algumas secções da especificação, que a equipa depois adaptou e completou.],
  [Claude (aplicação Claude, Claude Opus 5.5)], [Usado por Diogo Macedo, sem _skills_ nem instruções de projeto, como apoio na elaboração dos diagramas, na formatação dos casos de uso em Typst e na revisão de texto do relatório. Não fez _commits_.],
  [ChatGPT (OpenAI)], [Usado em conversa, sem configuração adicional, por Bruno Sousa (UC-VID-002) e Bruno Vale (UC-VID-004) na especificação dos respetivos casos de uso.],
  [Gemini 4 Argon (Google)], [Usado em conversa, sem configuração adicional, por Diogo Macedo na especificação do UC-VID-003.],
  [Antigravity (Google DeepMind)], [Usado por Sérgio Vieira como apoio na especificação do UC-VID-005, sem _skills_ nem instruções de projeto próprias.],
  ),
)

Cada caso de uso tem ainda, na secção 3 do respetivo documento em `casos-de-uso/`, a declaração de uso de IA
feita pelo seu autor.

Os prompts mais relevantes de cada elemento estão na pasta `evidencias-ia/` da solução entregue.

== Tarefas apoiadas e validação

#tab([Tarefas apoiadas por agentes de IA e validação],
  tabela(
    colunas: (2.6cm, 2cm, 1fr, 1fr, 2.4cm),
    tamanho: 8.5pt,
    [Ferramenta / _skill_], [Caso de uso], [Tarefa apoiada], [Validação realizada pela equipa], [Evidência],

    // ---------------------------------------------------------------- UC-VID-001
    [Claude (chat)], [UC-VID-001], [Apoio na estruturação do caso de uso (cabeçalho, fluxos, exceções, regras, assunções e questões em aberto).], [Revisão manual integral; confronto com o README e o código da solução de base; comportamentos não confirmados registados como assunções ou questões em aberto.], [_Commit_ `4fa02c4`],
    [Claude (chat)], [UC-VID-001], [Apoio na derivação da ERS: requisitos funcionais e não funcionais, alvos MVP/produção, DQ, impacto e matriz de rastreabilidade.], [Revisão de cada requisito face ao caso de uso e ao enunciado; verificação de que cada requisito tem origem e critério de aceitação verificável; valores assinalados como assunções a validar com testes (A7–A10).], [_Commit_ `4fa02c4`],
    [Claude Code], [UC-VID-001], [Apoio na implementação do serviço `silence_removal_tool`, das rotas e do modelo de trabalho no `projects`, da contagem de análises no `users`, dos eventos no WS Gateway e da interface de revisão.], [Revisão do código por um elemento da equipa antes de cada _commit_; execução dos testes; teste manual do fluxo completo no browser.], [_Commit_ `5478fc9` ],
    [Claude Code], [UC-VID-001], [Apoio na escrita dos testes: unitários da lógica dos troços, demonstração com vídeo sintético, fluxo completo pela API e robustez (300 troços, serviço parado a meio, apagar vídeo, ficheiros temporários).], [Confronto de cada teste com o critério de aceitação do requisito correspondente; execução pela equipa e registo dos resultados (TST-SIL-01 a 05).], [_Commit_ `5478fc9`; Cap. 10],

    // ---------------------------------------------------------------- UC-VID-002
    [ChatGPT], [UC-VID-002], [Apoio na interpretação dos _templates_ e na escolha e estruturação da funcionalidade de compressão e otimização de vídeo.], [Confronto com os _templates_ e exemplos fornecidos pelos docentes; adaptação ao contexto do PictuRAS.], [Secção 3 do UC-VID-002],
    [ChatGPT], [UC-VID-002], [Apoio na derivação dos requisitos funcionais a partir do caso de uso, das regras de negócio, dos fluxos alternativos e das exceções; classificação dos requisitos não funcionais segundo a ISO/IEC 25010, com alvos MVP e de produção.], [Verificação de que cada requisito tem origem no caso de uso e mantém os IDs do Exercício 1; revisão dos valores dos alvos e registo das decisões em DQ.], [Secção 3 do UC-VID-002],
    [ChatGPT], [UC-VID-002], [Apoio na análise de impacto, matriz de rastreabilidade, decisões de qualidade, assunções e questões em aberto.], [Verificação de que todos os requisitos têm origem e de que o que fica fora do âmbito está justificado.], [Secção 3 do UC-VID-002],

    // ---------------------------------------------------------------- UC-VID-003
    [Gemini 4 Argon], [UC-VID-003], [Apoio na estruturação do caso de uso, na expansão para a ERS completa (Exercício 2), classificação ISO/IEC 25010, alvos MVP e de produção e alinhamento com a arquitetura do `picturas-27`.], [Revisão manual face às filas do RabbitMQ, aos _tokens_ de execução (`activeToken`), ao controlo de concorrência (`X-Project-Version`), ao armazenamento (SeaweedFS) e aos documentos de requisitos e arquitetura de base.], [Secção 3 do UC-VID-003],
    [Gemini 4 Argon], [UC-VID-003], [Apoio na revisão de consistência do caso de uso e da ERS face ao relatório de auditoria interna do grupo.], [Cada ponto foi analisado pelo autor, que decidiu se o aplicava.], [Secção 3 do UC-VID-003],
    [Claude (aplicação)], [UC-VID-003 e todos], [Apoio na formatação dos casos de uso em Typst, na elaboração dos diagramas (casos de uso, modelo de domínio, componentes e sequência), nos testes da anonimização com vídeos sintéticos e na revisão de texto dos capítulos 3, 8, 10, 11 e 12.], [Revisão visual dos diagramas e correção de erros (atores em falta, linhas sobrepostas); confronto com o código em `origin/main`; afirmações sem confirmação no código retiradas; os falsos positivos da anonimização ficaram registados (TST-BLUR-03).], [Cap. 3, 8 e 10],

    // ---------------------------------------------------------------- UC-VID-004
    [ChatGPT], [UC-VID-004], [Apoio na criação e revisão do caso de uso e na evolução para a ERS completa, com separação RF/RNF, classificação ISO/IEC 25010 e critérios de aceitação.], [Confronto com o enunciado e com os _templates_ e guias dos Exercícios 1 e 2; revisão dos IDs, da atomicidade e da verificabilidade de cada requisito e das marcas NOVO/ALT e Mantido/Refinado/Novo.], [Secção 3 do UC-VID-004],
    [ChatGPT], [UC-VID-004], [Apoio na revisão de completude, decisões de qualidade, análise de impacto e rastreabilidade; confronto da ERS com a arquitetura do `picturas-27`.], [Confronto com os serviços reais (API Gateway, `users`, `projects`, subscrições, armazenamento de imagens, RabbitMQ, WS Gateway, SeaweedFS e ferramentas) e verificação da rastreabilidade entre UC, RN e DQ.], [Secção 3 do UC-VID-004],

    // ---------------------------------------------------------------- UC-VID-005
    [Antigravity], [UC-VID-005], [Apoio no desenho do caso de uso, modos de fundo (_chroma key_, cor sólida, desfoque de retrato), arquitetura assíncrona com RabbitMQ e conformidade com os guias dos Exercícios 1 e 2.], [Confronto com a arquitetura real; foram rejeitadas as APIs pagas propostas (Stability, OpenAI) e escolhidos modelos locais leves de visão por computador, dentro do Docker.], [Secção 3 do UC-VID-005],
    [Antigravity], [UC-VID-005], [Apoio na ERS (secção 4), decisões de qualidade DQ-001 a DQ-008, análise de impacto e matrizes de rastreabilidade, com critérios Dado/Quando/Então.], [Revisão da atomicidade e da ambiguidade dos requisitos e das restrições de quota.], [Secção 3 do UC-VID-005],

    // ---------------------------------------------------------------- todos os casos de uso
    [Claude Code], [Todos], [Apoio na revisão cruzada dos cinco casos de uso: incoerências entre documentos (quota, estados, limites, formatos) e critérios não verificáveis.], [Cada ponto foi analisado pelo autor do caso de uso, que decidiu se o aplicava; os pontos comuns foram decididos em conjunto pelo grupo.], [Documento de revisão; _commits_ `eaea9c7`, `587783b`, `132efe3`],
    [Claude Code], [Todos], [Apoio no alinhamento das cinco ferramentas com os requisitos comuns: quota reservada no pedido, descontada só no sucesso e devolvida na falha ou cancelamento; os mesmos estados; tempo máximo; prioridade Premium com uma fila de pedidos com prioridade por ferramenta; mensagens de erro iguais.], [Revisão do código por um elemento da equipa; execução dos testes automáticos; confirmação num RabbitMQ real de que os pedidos Premium saem primeiro; teste manual no browser.], [_Commit_ `e134a50`; Cap. 10],
    [Claude Code], [UC-VID-003, 004 e 005], [Apoio nas três correções dos problemas encontrados pela equipa no teste manual: a remoção de fundo esgotava o tempo máximo e o erro não chegava à interface; as mensagens de erro da fila do `projects` traziam o identificador do pedido no campo errado, pelo que a interface nunca mostrava "Falhada"; as legendas falhavam quando o último segmento acabava depois do fim do vídeo.], [Os três problemas foram encontrados pela equipa no teste manual de 21-10-2026; depois da correção, os casos foram testados de novo e cada correção ficou coberta por um teste automático.], [_Commit_ `e134a50`; TST-BG-02, TST-FAIL-01, TST-LEG-04],
    [Claude Code], [Todos], [Apoio na escrita dos testes novos: TST-QUOTA-01 e TST-QUOTA-02 (prioridade Premium no `projects` e nas ferramentas), TST-FAIL-01 (mensagens de erro), TST-BG-02 (fotogramas-chave e tempo da remoção de fundo), TST-LEG-04 (fim do último segmento) e TST-VID-01 (fluxo completo das ferramentas pela API).], [Confronto de cada teste com o requisito comum ou com o critério de aceitação correspondente; execução pela equipa e registo dos resultados no Cap. 10.], [_Commit_ `e134a50`; Cap. 10],
    [Claude Code], [Todos], [Apoio na passagem para o relatório dos capítulos de casos de uso, ERS, impacto, rastreabilidade e arquitetura, a partir dos documentos escritos pela equipa.], [Leitura e correção pela equipa; a arquitetura foi confrontada com o diagrama de componentes feito pela equipa; IDs da solução de base e resultados de testes preenchidos pela equipa.], [Histórico de versões do relatório],
  ),
)

== Análise crítica

No balanço geral, os agentes de IA foram mais úteis nas tarefas de volume e de consistência do que nas
decisões. Ajudaram a dar estrutura a documentos longos com a estrutura pedida, a derivar
requisitos com origem e critério de aceitação e no código repetitivo, como rotas, mensagens entre
serviços e validações. Onde fizeram mais diferença foi a ajudar a cruzar documentos e código à procura de
incoerências: com cinco casos de uso escritos em paralelo e vários serviços, seria um trabalho lento de fazer
à mão. Também foi útil poder pedir ao assistente que confirmasse no código e no histórico do git o que afirmava,
em vez de o supor.

Isso não quer dizer que tenha acertado sempre, e foi na revisão da equipa que os erros apareceram. Alguns
critérios de aceitação saíram vagos: a primeira versão de um requisito da remoção de silêncios falava em
"sem desfasamento visível", o que não se consegue testar, e passou a "desfasamento ≤ 40 ms"; o requisito de
integridade do vídeo original estava também classificado numa característica da ISO/IEC 25010 que não lhe
correspondia.

Houve também afirmações que não resistiram a uma verificação no código. O texto dizia que o progresso era
enviado "pelo menos a cada 5 s", mas o serviço só garante um intervalo mínimo de 2 s entre mensagens, por
isso a frase foi corrigida e o requisito ficou dependente do teste. Noutros casos, o agente decidiu coisas
que cabiam à equipa: ao converter um caso de uso para o relatório, deu como decidida uma questão que ainda
estava em aberto (quem paga a operação num projeto partilhado) e atribuiu prioridades aos requisitos não
funcionais. Ambas foram revistas por nós. Nos testes, foi a execução real que corrigiu as expectativas: a
anonimização com vídeos sintéticos mostrou que os classificadores usados não têm um valor de confiança e
geram falsos positivos, algo que a especificação dava como garantido. Do mesmo modo, os testes automáticos
do código gerado passavam, mas foi o teste manual no browser que mostrou que a remoção de fundo esgotava o
tempo máximo, que a interface nunca chegava a mostrar "Falhada" e que as legendas falhavam num vídeo curto.
Na especificação, uma das ferramentas propôs APIs pagas para a remoção de fundo, que foram rejeitadas a
favor de modelos locais.

Do outro lado, a IA ajudou-nos a encontrar problemas que não tínhamos visto. A revisão cruzada mostrou que o
tempo máximo previsto para a anonimização (180 s) era menor do que o tempo que o próprio processamento podia
demorar (até 900 s), que cada caso de uso descontava a quota num momento diferente e que os nomes dos
estados e os formatos aceites não coincidiam. A análise da arquitetura revelou ainda que o Nginx limita os
uploads a 100 MB, abaixo dos limites Premium de alguns casos de uso, e que os pedidos Premium de duas
ferramentas iam para uma fila que nenhum serviço consumia. Em todos estes pontos, a decisão foi tomada pelo
grupo e não pelo agente.

Ficou-nos uma forma de trabalhar que pretendemos manter na Fase 2: nada do que a IA produz entra no projeto
sem ser lido, cada requisito é confrontado com o caso de uso e com o código, os valores sem origem confirmada
ficam como assunções a validar e os resultados de testes só são registados depois de executados. Com
agentes, o tempo poupado a escrever passa em boa parte para a revisão, e é essa revisão que garante a
qualidade do que entregamos.
