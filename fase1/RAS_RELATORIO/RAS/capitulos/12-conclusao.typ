#import "../template.typ": *

= Conclusão

#orientacao[
  Sintetizem os contributos (não repitam o conteúdo): o que o MVP de vídeo valida, o que ficou por fazer e
  porquê, e que lições tiram do processo. Terminem com a ligação à Fase 2: que requisitos não funcionais
  consideram prioritários para melhoria por _refactoring_.
]

Este incremento mostrou que o PictuRAS consegue suportar vídeo sem abandonar a sua organização em microsserviços.
As cinco funcionalidades escolhidas (remover silêncios, comprimir, anonimizar rostos e matrículas, gerar legendas e
remover o fundo) exercitam tipos de processamento bastante diferentes: trabalho sobre o áudio e sobre a imagem,
com e sem modelos de IA, com um novo vídeo ou um ficheiro de legendas como resultado. Todas assentam no mesmo
padrão: o pedido é aceite de imediato, o processamento corre numa fila em segundo plano, o utilizador acompanha o
estado em tempo real e pode cancelar, e o vídeo original nunca é alterado. Os testes, automáticos e com o sistema
completo a correr, confirmam este comportamento com valores dentro dos alvos do MVP, como um desfasamento entre som
e imagem de no máximo 15 ms e tempos de processamento bem abaixo do tempo máximo.

Nem tudo ficou cumprido. A anonimização usa um detetor que não devolve uma pontuação de confiança, o que provoca
falsos positivos e deixa o UC-VID-003/RN4 por cumprir. Na anonimização e na remoção de fundo, os limites por plano
são validados com a duração e a resolução enviadas pela interface, e não com o ficheiro lido no servidor. A
aceitação de vídeos MOV ainda depende de alterar o carregamento de ficheiros. A exatidão da deteção de pausas, de
rostos e do reconhecimento de fala também não foi medida, por não existirem vídeos anotados à mão. Ficaram fora do
âmbito, por decisão, o encadeamento de ferramentas, o processamento em lote, a execução com GPU e a repetição
automática de pedidos falhados: não eram necessários para validar o fluxo de ponta a ponta e aumentariam muito o
esforço desta fase.

Do processo, a principal lição é que as regras transversais devem ser fixadas no início. Cada elemento da equipa
especificou e implementou uma funcionalidade em paralelo, o que acelerou o trabalho mas fez surgir divergências que
só a revisão cruzada revelou: o momento do desconto da quota, os nomes dos estados, os formatos aceites, o tempo
máximo, a forma de dar prioridade ao Premium (numa das versões, os pedidos iam para uma fila que nenhum serviço
lia) e a forma de integrar as ferramentas. Estas regras acabaram por ser definidas como requisitos comuns e
alinhadas no código, mas teria sido mais barato decidi-las antes. O teste manual com o sistema completo foi
igualmente decisivo: encontrou três defeitos que os testes automáticos não apanhavam, entre os quais um erro
antigo da solução de base que impedia a interface de mostrar as falhas das ferramentas. A rastreabilidade entre
casos de uso, requisitos, componentes e testes ajudou a encontrar estas incoerências e os requisitos sem
verificação.

Para a Fase 2, os requisitos não funcionais que consideramos prioritários para melhoria por _refactoring_ são os
seguintes:

+ Manutenibilidade: dividir o `projects/routes/projects.js` (T-06) e integrar todas as ferramentas de vídeo num só
  circuito, com o mesmo modelo de trabalho e o mesmo tratamento da quota (DA-03, RNG-04; REQ-VID-ARCH-001;
  REQ-VID-COMP-033).
+ Fiabilidade: validar os limites no servidor a partir do próprio ficheiro e retomar ou repetir automaticamente os
  pedidos com falhas transitórias, com o tempo máximo de produção já previsto (1,5× a duração + 30 s)
  (REQ-VID-TIMEOUT-001; REQ-VID-FAIL-001; REQ-VID-BLUR-002; REQ-VID-BG-006, 021).
+ Eficiência de desempenho: execução com GPU e várias instâncias por ferramenta, para atingir os alvos de produção
  com vários pedidos em simultâneo (REQ-VID-SIL-030; REQ-VID-BLUR-016; REQ-VID-COMP-035).
+ Adequação funcional (exatidão): substituir os classificadores Haar por um detetor com pontuação de confiança e
  medir a exatidão com vídeos anotados (REQ-VID-BLUR-007, 022; REQ-VID-SIL-033; REQ-VID-LEG-045).