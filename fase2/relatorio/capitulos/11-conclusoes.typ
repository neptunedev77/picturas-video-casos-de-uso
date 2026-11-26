#import "../template.typ": *

= Conclusões e Recomendações

#orientacao[
  *Origem:* Exercício 6, Bloco 2, secção 6 do _template_.

  Sintetizem os contributos do relatório, sem repetir o conteúdo dos capítulos anteriores: o que o diagnóstico concluiu
  sobre a adequação do padrão atual, que otimizações sugerem e que considerações ficam para a evolução futura.

  Terminem com o que ficou por fazer e porquê (e.g., valores-alvo não atingidos, hipóteses por confirmar) e com a
  ligação à Fase 3: de que forma o _refactoring_ facilita, ou não, a integração de novas funcionalidades. Sejam realistas e honestos quanto às limitações da
  análise e às hipóteses que ficaram por confirmar.
]

== Adequação do padrão atual (global e do vídeo)

O *padrão global* (microsserviços que comunicam por filas de mensagens) mostrou-se adequado e foi mantido: cada
ferramenta já corria isolada num contentor que podia ter mais réplicas, e quem pede já estava separado de quem
processa. Os problemas estavam em decisões tomadas dentro dele: réplicas fixas e sem limites, mensagens que podiam
perder-se e trabalhos sem prazo. O *padrão do vídeo*, um único _worker_ que faz todo o _pipeline_, funcionava bem para
um vídeo isolado, mas deixava os vídeos curtos presos atrás dos longos e trabalhos pendurados sem aviso.

A medição final confirma este diagnóstico. Mantendo o padrão global e mudando apenas essas decisões (ALT-1),
atingimos 12 dos 14 alvos, e a suite de regressão deu os mesmos resultados da versão original. Os dois alvos não
atingidos dizem respeito à mesma rajada: a espera dos vídeos ficou dentro do mínimo aceitável e o tempo total, uma
métrica secundária, ficou acima do alvo. Ambos resultam de uma escolha consciente (poupar memória sem carga) e do
calendário do cenário, e não de um limite do padrão.

== Sugestões de otimização

- *Ter uma réplica de legendagem pronta quando há procura.* Num ensaio, uma réplica sempre ligada reduziu a espera do
  S2 de 8,1 s para 5,2 s. Retirar essa réplica só depois de um período maior sem legendagens daria quase o mesmo
  ganho com menos memória.
- *Arrancar as réplicas de vídeo mais depressa.* Uma réplica nova demora cerca de 10 s a começar a trabalhar, contra
  4,8 s na base; vale a pena perceber a diferença.
- *Reduzir o tempo entre o pedido e o envio do vídeo para a fila* (7 a 8 s, H-05).
- *Carregar os ficheiros por partes*, em vez de os guardar inteiros em memória em três serviços (QS-05).
- *Aplicar o mesmo ajuste de réplicas às ferramentas de imagem com IA*, que são as mais lentas e continuam com uma
  réplica fixa.

== Considerações para evolução futura

- *Segurança do _autoscaler_.* Hoje tem acesso total ao Docker. Seria melhor corrê-lo num contentor com permissões
  limitadas aos dois serviços de vídeo.
- *Várias máquinas.* As regras do _autoscaler_ não dependem do Docker Compose. Se o PictuRAS precisar de mais do que
  uma máquina, podem passar para Kubernetes com KEDA (ALT-3), que nessa altura compensaria o custo da migração.
- *Organização do orquestrador.* O `projects` continua a ter quase toda a lógica num ficheiro com mais de 2700 linhas.
  Separar o fluxo do vídeo (QS-06) facilitaria as próximas alterações.
- *Serviços externos.* A ferramenta de marca d'água depende de um serviço externo e não ficou protegida.
- *Monitorização.* O _autoscaler_ já regista todas as decisões; mostrá-las num painel, junto com o estado das filas,
  ajudaria a afinar as regras em uso real.

== Trabalho futuro

=== O que ficou por fazer
- O alvo do E-2 não foi atingido (8,1 s, dentro do mínimo aceitável). A alternativa que o resolve foi testada num
  ensaio; falta medi-la com 5 repetições, incluindo o efeito na memória.
- O alvo do tempo total da rajada (≤ 33 s) não foi atingido, e é muito difícil de atingir neste cenário (capítulo 10).
- Ficaram por confirmar as hipóteses H-03, H-04 e H-05.
- As falhas F1–F6 e a criação e remoção de réplicas foram medidas, mas não são testes automáticos. Transformá-las em
  testes ajudaria a proteger futuras alterações.
- Usámos uma só máquina, e a memória sem carga depende do historial dos contentores (capítulo 10).

=== Ligação à fase seguinte As mudanças facilitam acrescentar funcionalidades de vídeo pesadas, como as que a equipa
especificou na Fase 1 (remoção de silêncios, compressão, anonimização de rostos e matrículas, legendas automáticas e
remoção de fundo). Um efeito pesado só precisa de ser encaminhado para a fila dos trabalhos pesados, onde já tem réplicas
próprias, limites de recursos e entrega garantida, sem atrasar os cortes rápidos. E qualquer ferramenta nova que use a
biblioteca comum passa a ter as mesmas garantias de fiabilidade. Por outro lado, alterar o orquestrador continua a ser
difícil, e cada nova ferramenta precisa de um prazo adequado à sua duração.
