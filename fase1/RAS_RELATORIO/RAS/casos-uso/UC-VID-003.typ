#import "../template.typ": *

== UC-VID-003 — Anonimizar rostos e matrículas num vídeo

=== Cabeçalho

#tab([Caso de uso UC-VID-003 — Anonimizar rostos e matrículas num vídeo],
  tabela-campos(
    [ID do Caso de Uso], [UC-VID-003],
    [Nome], [Anonimizar rostos e matrículas num vídeo],
    [Versão], [v1.3],
    [Autor], [Diogo Macedo],
    [Data], [2026-10-15],
    [Objetivo], [Permitir ao utilizador detetar automaticamente elementos sensíveis (rostos de pessoas e matrículas de veículos) ao longo de todo o vídeo e aplicar-lhes uma desfocagem ou um mosaico, obtendo uma nova versão anonimizada do vídeo, em conformidade com o RGPD.],
    [Âmbito], [Módulo de processamento avançado de vídeo do PictuRAS: deteção e seguimento de alvos, aplicação da máscara, preservação do áudio, quota e fila de processamento, progresso em tempo real e armazenamento do resultado.],
    [Ator Principal], [Utilizador registado (plano free ou premium), incluindo o colaborador autenticado com permissão de edição num projeto partilhado.],
    [_Stakeholders_ e Interesses], [
      - *Utilizador (criador de conteúdo)*: quer partilhar ou arquivar vídeos sem expor dados pessoais de terceiros, de forma automática e sem editar fotograma a fotograma.
      - *Convidado com permissão de edição*: quer aplicar a ferramenta num projeto partilhado e acompanhar o progresso na sua própria sessão.
      - *Proprietário do Sistema*: pretende oferecer uma funcionalidade avançada com forte apelo comercial e em conformidade com o RGPD, mantendo o custo de processamento controlado através de quotas e limites de duração.
      - *Equipa de Desenvolvimento*: valida a robustez do processamento de IA sobre vídeo, o isolamento do novo serviço, o cancelamento e a recuperação de falhas no processamento assíncrono.
    ],
    [Pré-condições], [
      - O utilizador tem sessão iniciada e permissão de edição no projeto.
      - O vídeo foi carregado com sucesso no projeto e está acessível no armazenamento.
      - No plano free, o utilizador tem operações avançadas disponíveis na quota diária.
    ],
    [_Trigger_], [O utilizador, com um vídeo selecionado no editor, escolhe a ferramenta *Anonimização de Privacidade (Blur)*, define os parâmetros e escolhe *Aplicar*.],
  ),
)

=== Fluxo Principal

#tab([UC-VID-003 — Fluxo principal],
  tabela(
    colunas: (1.2cm, 1fr, 1fr),
    [Passo], [Ação do Ator], [Resposta do Sistema],
    [1], [O utilizador abre o projeto e seleciona um vídeo.], [Apresenta o editor com o leitor de vídeo, a duração, a resolução, o formato, as operações diárias ainda disponíveis e a barra de ferramentas de vídeo.],
    [2], [O utilizador seleciona a ferramenta *Anonimização de Privacidade (Blur)*.], [Apresenta as opções: elementos a detetar (rostos, matrículas ou ambos), estilo de ocultação (desfocagem gaussiana ou mosaico) e intensidade (baixa, média ou alta).],
    [3], [O utilizador define os parâmetros e escolhe *Aplicar*.], [Valida o formato e o _codec_ do vídeo (MP4 ou MOV com H.264), a duração e a resolução face ao perfil do utilizador, verifica se os parâmetros mudaram desde o último processamento e confirma que existe quota disponível.],
    [4], [—], [Aceita o pedido, reserva uma operação na quota do utilizador e coloca o processamento na fila.],
    [5], [—], [Apresenta o painel de processamento com o estado ("Em fila" / "A processar"), a percentagem de progresso e a opção *Cancelar* sempre visível.],
    [6], [—], [Analisa o vídeo fotograma a fotograma, deteta e segue os alvos escolhidos com o limiar de confiança mínimo (RN4) e aplica-lhes a máscara selecionada, enviando atualizações periódicas de progresso.],
    [7], [—], [Junta os fotogramas processados à faixa de áudio original, sem perda de sincronização, gera o novo vídeo em MP4 e guarda-o no projeto.],
    [8], [—], [Confirma a conclusão, consolida o débito da operação na quota e notifica a interface em tempo real.],
    [9], [O utilizador consulta o resultado.], [Fecha o painel de processamento, apresenta uma mensagem de sucesso e disponibiliza o vídeo anonimizado para reprodução e transferência. O vídeo original mantém-se inalterado.],
  ),
)
#pagebreak()
=== Fluxos Alternativos

#tab([UC-VID-003 — Fluxos alternativos],
  tabela(
    colunas: (4cm, 1fr),
    [Fluxo], [Descrição (passo de origem: condição → comportamento → retorno)],
    [FA1 – Utilizador premium], [No passo 3, o sistema verifica que o utilizador é premium → o processamento é colocado na fila com prioridade e não é descontada nenhuma operação da quota → o fluxo segue para o passo 5.],
    [FA2 – Nenhum elemento sensível detetado], [No passo 6, a análise termina sem nenhum rosto ou matrícula detetado com a confiança mínima → o sistema informa o utilizador ("Nenhum rosto ou matrícula detetado no vídeo; o ficheiro resultante é idêntico ao original"), devolve a operação à quota e termina.],
    [FA3 – Cancelar a anonimização], [Durante os passos 5 ou 6, o utilizador escolhe *Cancelar* → o sistema interrompe o processamento, descarta os ficheiros parciais, devolve a operação à quota e repõe o editor no estado anterior em menos de 1 s.],
    [FA4 – Aplicar sem alterações], [No passo 3, os parâmetros coincidem exatamente com os do último processamento concluído → o sistema apresenta de imediato o resultado já existente, sem novo processamento nem consumo de quota.],
  ),
)

=== Exceções

#tab([UC-VID-003 — Exceções],
  tabela(
    colunas: (1fr, 1fr),
    [Condição], [Comportamento do Sistema],
    [No passo 3, o utilizador do plano free já usou as 5 operações avançadas do dia (RN1).], [Não executa o processamento e apresenta a mensagem "Limite diário de operações avançadas atingido. Efetue upgrade para a conta Premium para processar sem limites".],
    [No passo 3, o vídeo excede a duração ou a resolução permitidas para o perfil do utilizador (RN2).], [Não executa o processamento e indica o limite excedido: "A ferramenta de anonimização em contas Gratuitas está limitada a vídeos de até 60 segundos (1080p). O vídeo atual excede este limite".],
    [No passo 3, o ficheiro não é um MP4 ou MOV válido (H.264/AAC) ou está corrompido.], [Rejeita o pedido no momento da submissão, não desconta quota e apresenta a mensagem "Formato ou codec de vídeo inválido. Certifique-se de que o ficheiro utiliza um formato suportado (MP4 ou MOV com vídeo H.264)".],
    [No passo 6, o processamento demora mais de 60 s.], [Apresenta um aviso informativo de demora, sem interromper o processamento.],
    [No passo 6, o processamento excede o tempo máximo (3 × duração do vídeo + 60 s) ou o serviço falha.], [Interrompe o processamento, marca-o como falhado, liberta os recursos, devolve a operação à quota, mantém o vídeo original e apresenta a mensagem "O processamento excedeu o tempo máximo e foi interrompido. A operação não foi descontada".],
  ),
)

=== Pós-condições

#tabela(
  colunas: (4cm, 1fr),
  [Tipo], [Resultado],
  [Garantia de Sucesso], [É criado um novo vídeo em que todos os rostos e matrículas detetados estão desfocados ou pixelizados de forma contínua, com o áudio original sincronizado; o novo vídeo fica guardado no projeto, a quota e o contador da interface são atualizados e o vídeo original mantém-se inalterado.],
  [Garantia Mínima], [O vídeo original mantém-se inalterado; o projeto regressa ao último estado confirmado, sem ficheiros parciais ou corrompidos; qualquer operação reservada é devolvida à quota e é apresentada uma mensagem de erro clara.],
)

=== Regras de Negócio e Restrições

#tabela(
  colunas: (1.4cm, 1fr),
  [ID], [Regra],
  [RN1], [A anonimização é uma ferramenta avançada (IA): cada nova execução conta como uma operação avançada na quota diária do plano free (limite de 5 por dia); no plano premium não há limite. A operação é reservada ao aceitar o pedido e só fica descontada quando o processamento termina com sucesso (RNG-04).],
  [RN2], [No plano free, o vídeo não pode exceder 60 s nem 1080p; no plano premium, o limite é de 300 s e 4K. Os utilizadores anónimos não têm acesso a ferramentas avançadas de vídeo.],
  [RN3], [O vídeo resultante é um MP4 (H.264) e mantém a faixa de áudio original, copiada sem alteração e sem perda de sincronização.],
  [RN4], [A deteção usa um limiar de confiança mínimo de 0,65, para evitar falsos positivos sobre texturas ou objetos de fundo.],
  [RN5], [O processamento é não destrutivo: o vídeo original nunca é substituído pelo resultado, o que permite repor o estado anterior sem perda de qualidade.],
  [RN6], [O progresso e a conclusão são comunicados ao utilizador que iniciou a operação de forma assíncrona e em tempo real; o pedido inicial limita-se a validar e aceitar o processamento.],
)

=== Assunções

#tabela(
  colunas: (1.4cm, 1fr),
  [ID], [Assunção],
  [A1], [O vídeo tem iluminação e contraste suficientes para distinguir as características faciais e os caracteres das matrículas.],
  [A2], [O serviço de processamento dispõe de CPU e memória suficientes para que, no MVP, o processamento demore em média 2 a 3 vezes a duração do vídeo, dentro do tempo máximo de 3 × duração + 60 s.],
  [A3], [O armazenamento tem espaço para guardar ao mesmo tempo o vídeo original, os ficheiros temporários e o vídeo resultante, com encriptação em repouso.],
  [A4], [O seguimento dos alvos entre fotogramas garante que a máscara acompanha o movimento sem intermitências (_flickering_) visíveis.],
  [A5], [Os ficheiros temporários criados durante o processamento são apagados logo que o resultado é guardado ou o processamento é interrompido.],
  [A6], [Os limites de RN2 (60 s/1080p e 300 s/4K) foram fixados a partir do tempo de processamento esperado em CPU (A2), para que um vídeo free termine em poucos minutos; serão revistos após testes com vídeos reais.],
)

=== Questões em Aberto

#tabela(
  colunas: (1.4cm, 1fr, 5cm),
  [ID], [Questão], [Resolução],
  [Q1], [Deve existir uma opção manual para o utilizador marcar zonas a anonimizar, caso a deteção automática falhe algum rosto em ângulos extremos?], [Adiada para fase posterior: não é necessária para validar o fluxo automático do MVP.],
  [Q2], [Em projetos partilhados com permissão de edição, a operação deve ser descontada ao dono do projeto ou a quem executa a anonimização?], [Decidida: é descontada a quem executa a operação (decisão comum aos casos de uso de vídeo) → RN1.],
  [Q3], [Quando são apagados os ficheiros temporários do processamento?], [Decidida: logo após a conclusão, o cancelamento ou a falha → A5 e REQ-VID-CLEAN-001.],
)
