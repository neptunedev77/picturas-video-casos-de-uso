#import "../template.typ": *

= Introdução

#orientacao[
  Uma a duas páginas, no máximo. Devem responder a:
  - *Propósito do incremento*: que suporte a vídeo foi acrescentado ao PictuRAS e porquê (lógica de MVP).
  - *_Baseline_*: em que versão do sistema se basearam — documento de requisitos, documento de solução
    arquitetural e repositório base (indicar _commit_ de partida).
    Este relatório *estende* esses documentos; não os reescreve.
  - *Resumo do que foi feito*: funcionalidades especificadas e implementadas (remeter para a Tabela do Capítulo 3).
  - *Organização do documento*: Parte I (transversal), Parte II (especificação: casos de uso, ERS, impacto,
    rastreabilidade), Parte III (arquitetura, IA, testes).
]

== Propósito do incremento
O objetivo da Fase 1 consiste em estender o PictuRAS, originalmente orientado para o processamento de imagens, com suporte a novas funcionalidades de processamento de vídeo digital. Esta extensão foi desenvolvida segundo uma lógica de Produto Mínimo Viável (MVP), privilegiando a validação funcional das funcionalidades propostas e a sua integração com a arquitetura existente, sem exigir nesta fase o mesmo nível de robustez, desempenho e maturidade esperado numa solução de produção.

Neste contexto, o incremento desenvolvido procura:
- acrescentar ao PictuRAS cinco novas funcionalidades de processamento de vídeo;
- integrar essas funcionalidades nos mecanismos e serviços já existentes na aplicação;
- validar o processamento assíncrono de operações de vídeo potencialmente demoradas;
- permitir o acompanhamento do estado das operações e a disponibilização dos respetivos resultados;
- reutilizar os mecanismos existentes de autenticação, gestão de perfis de utilização, quotas e armazenamento;
- validar o funcionamento do MVP através de testes automáticos e manuais.
== Resumo do que foi feito
Nesta fase foram especificadas, implementadas e integradas cinco funcionalidades de processamento de vídeo no PictuRAS. O trabalho incluiu a definição e o refinamento dos respetivos casos de uso e requisitos, a identificação do impacto no sistema existente, a introdução das alterações arquiteturais necessárias, a implementação assistida por agentes de Inteligência Artificial e a validação da solução através de testes automáticos e manuais. As funcionalidades desenvolvidas e o respetivo estado de implementação são apresentados de forma consolidada no Capítulo 3.
== _Baseline_ e repositório
#tab([_Baseline_ e versão entregue],
  tabela(
  colunas: (5cm, 1fr),
  [Artefacto], [Versão / referência],
  [Documento de requisitos de base], [doc-ext-requisitos.pdf],
  [Documento de solução arquitetural de base], [doc-sol-arquitetural.pdf],
  [Repositório de partida], [https://github.com/neptunedev77/picturas-video-casos-de-uso (_commit_ de partida `f3cad52`, base PictuRAS de 29-09-2026)],
  [Solução entregue], [`solucao-ext-mvp.zip`, gerado a partir do _commit_ `0622df5`],
  ),
)

\

== Organização do documento

O documento estende os documentos de base (requisitos e solução arquitetural) sem os reescrever e está
organizado em três partes:

*Parte I — Enquadramento e visão transversal*
- *Capítulo 1 — Introdução*: propósito do incremento, _baseline_ usada e versão entregue.
- *Capítulo 2 — Contexto, perfis e _stakeholders_*: o que muda com o vídeo nos limites de cada perfil e nos
  interesses dos _stakeholders_, e como foram elicitadas as funcionalidades, as regras e os valores-alvo.
- *Capítulo 3 — Visão geral da extensão de vídeo*: as cinco funcionalidades do MVP e o seu estado, os
  diagramas de casos de uso e de domínio atualizados, as regras de negócio transversais (RNG) e as
  convenções de identificação.

*Parte II — Especificação das funcionalidades de vídeo*
- *Capítulo 4 — Casos de uso*: um caso de uso (UC-VID-001 a 005) por funcionalidade, com fluxos, exceções,
  regras de negócio, assunções e questões resolvidas.
- *Capítulo 5 — ERS*: requisitos funcionais com critérios de aceitação _Dado… Quando… Então…_, requisitos não
  funcionais segundo a ISO/IEC 25010 e verificação da completude e do âmbito de cada caso de uso.
- *Capítulo 6 — Impacto no sistema existente*: elementos do PictuRAS e do documento de requisitos afetados e
  conflitos entre funcionalidades resolvidos.
- *Capítulo 7 — Rastreabilidade*: ligação dos casos de uso aos requisitos, decisões de qualidade (DQ) e, para
  cada requisito, componentes, estado de implementação, testes e resultado.

*Parte III — Arquitetura, IA e validação*
- *Capítulo 8 — Alterações arquiteturais*: o delta face à solução de base, com componentes, decisões
  arquiteturais (DA) e o fluxo de processamento de um vídeo.
- *Capítulo 9 — Implementação assistida por agentes de IA*: ferramentas usadas, tarefas apoiadas, validação
  feita pela equipa e análise crítica.
- *Capítulo 10 — Testes e validação do MVP*: estratégia, testes realizados e resultados, limitações e
  defeitos conhecidos.
- *Capítulo 11 — Manutenção corretiva*: problemas encontrados na solução de base e o seu estado.
- *Capítulo 12 — Conclusão*: contributos, o que ficou por fazer, lições aprendidas e ligação à Fase 2.

Os anexos reúnem as instruções de execução da solução e dos testes e o glossário.