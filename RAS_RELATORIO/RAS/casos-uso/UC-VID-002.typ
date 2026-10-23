#import "../template.typ": *

== UC-VID-002 — Comprimir/Otimizar vídeo

=== Cabeçalho

#tab([Caso de uso UC-VID-002 — Comprimir/Otimizar vídeo],
  tabela-campos(
    [ID do Caso de Uso], [UC-VID-002],
    [Nome], [Comprimir/Otimizar vídeo],
    [Versão], [v1.0],
    [Autor], [Bruno Sousa],
    [Data], [2026-10-05],
    [Objetivo], [Permitir ao utilizador reduzir o tamanho de um vídeo através da escolha de um nível de qualidade, obtendo uma nova versão otimizada do ficheiro.],
    [Âmbito], [Módulo de processamento de vídeo do PictuRAS],
    [Ator Principal], [Utilizador registado ou premium],
    [_Stakeholders_ e Interesses], [
      - *Utilizador (criador de conteúdo)*: pretende reduzir o tamanho do vídeo mantendo um nível de qualidade adequado e obter um ficheiro utilizável após o processamento.
      - *Proprietário do Sistema*: pretende garantir que apenas ficheiros válidos são processados, respeitando os limites definidos e evitando resultados incompletos ou inválidos.
    ],
    [Pré-condições], [
      - O utilizador encontra-se autenticado.
      - O utilizador possui acesso à funcionalidade de otimização de vídeo.
      - O sistema encontra-se disponível para receber e processar ficheiros de vídeo.
    ],
    [_Trigger_], [O utilizador seleciona a opção de comprimir/otimizar vídeo],
  ),
)

=== Fluxo Principal

#tab([UC-VID-002 — Fluxo principal],
  tabela(
    colunas: (1.2cm, 1fr, 1fr),
    [Passo], [Ação do Ator], [Resposta do Sistema],
    [1], [Seleciona a opção de comprimir/otimizar vídeo], [Apresenta a interface da funcionalidade],
    [2], [Seleciona um ficheiro de vídeo], [Recebe o ficheiro e inicia sua validação],
    [3], [—], [Verifica o formato do vídeo e obtém informação relevante, como tamanho e duração],
    [4], [—], [Apresenta as opções de qualidade/otimização disponíveis],
    [5], [Seleciona o nível de qualidade pretendido], [Apresenta a opção selecionada e os parâmetros associados],
    [6], [Confirma a operação], [Valida o vídeo, o perfil do utilizador e os parâmetros escolhidos],
    [7], [—], [Inicia o processamento do vídeo],
    [8], [—], [Gera uma nova versão otimizada do vídeo de acordo com a qualidade escolhida],
    [9], [—], [Guarda o resultado do processamento e informa o utilizador de que a operação foi concluída],
    [10], [Solicita o acesso ao resultado], [Disponibiliza o vídeo otimizado ao utilizador],
  ),
)

=== Fluxos Alternativos

#tab([UC-VID-002 — Fluxos alternativos],
  tabela(
    colunas: (4cm, 1fr),
    [Fluxo], [Descrição (passo de origem: condição → comportamento → retorno)],
    [FA1 – Alterar nível de qualidade], [Antes de confirmar a operação, o utilizador decide escolher outro nível de qualidade. O sistema atualiza a opção selecionada e apresenta os parâmetros correspondentes, regressando depois ao passo de confirmação],
    [FA2 – Cancelar operação], [Antes ou durante o processamento, o utilizador seleciona a opção de cancelar. O sistema interrompe a operação, não disponibiliza nenhum resultado incompleto e mantém o ficheiro original inalterado. A operação reservada é devolvida à quota diária: só é descontada quando a compressão termina com sucesso],
    [FA3 – Selecionar outro vídeo], [Antes de confirmar o processamento, o utilizador decide substituir o vídeo selecionado. O sistema descarta a seleção atual e permite escolher um novo ficheiro, repetindo posteriormente a respetiva validação],
    [FA4 – Resultado otimizado maior do que o original], [Após a compressão, o sistema verifica que o ficheiro resultante possui um tamanho superior ao vídeo original. O sistema informa o utilizador de que não foi obtida redução de tamanho, mantém o vídeo original inalterado e permite ao utilizador optar por conservar ou descarregar o resultado gerado.],
  ),
)

=== Exceções

#tab([UC-VID-002 — Exceções],
  tabela(
    colunas: (1fr, 1fr),
    [Condição], [Comportamento do Sistema],
    [O formato ou codec do vídeo não é suportado.], [O sistema rejeita o ficheiro, informa o utilizador de que o vídeo não pode ser processado e apresenta, quando aplicável, os formatos suportados],
    [O ficheiro excede os limites permitidos para o perfil do utilizador], [O sistema impede o início do processamento e informa o utilizador de que o vídeo ultrapassa os limites definidos para o seu perfil],
    [Ocorre uma falha durante o processamento do vídeo.], [O sistema interrompe a operação, não disponibiliza resultados incompletos e mantém o vídeo original inalterado],
    [Não existe espaço ou capacidade suficiente para concluir o processamento.], [O sistema cancela a operação e informa o utilizador de que não foi possível concluir a otimização],
    [O utilizador registado não possui quota diária disponível.], [O sistema recusa o pedido de compressão/otimização antes do início do processamento e informa o utilizador de que não possui quota disponível.],
  ),
)
#pagebreak()

=== Pós-condições

#tabela(
  colunas: (4cm, 1fr),
  [Tipo], [Resultado],
  [Garantia de Sucesso], [É criada uma nova versão otimizada do vídeo de acordo com o nível de qualidade escolhido. O ficheiro resultante fica disponível ao utilizador e o vídeo original permanece inalterado.],
    [Garantia Mínima], [Em caso de falha, o vídeo original permanece inalterado e nenhum ficheiro incompleto ou inválido é disponibilizado como resultado da operação],
)

=== Regras de Negócio e Restrições

#tabela(
  colunas: (1.4cm, 1fr),
  [ID], [Regra],
    [RN1], [Apenas vídeos em formatos e codecs suportados pelo sistema podem ser processados.],
    [RN2], [O vídeo original não deve ser alterado ou substituído durante o processo de otimização.],
    [RN3], [Utilizadores registados podem processar vídeos até 500 MB e 10 minutos; utilizadores premium podem processar vídeos até 2 GB e 60 minutos.],
    [RN4], [São aceites vídeos MP4 e MOV com vídeo H.264 e áudio AAC (o áudio é opcional); o resultado é sempre MP4 (RNG-02).],
    [RN5], [Os níveis de qualidade disponíveis são Alta, Equilibrada e Tamanho reduzido. Alta utiliza H.264 com CRF 23 e mantém a resolução original; Equilibrada utiliza H.264 com CRF 28 e mantém a resolução original; Tamanho reduzido utiliza H.264 com CRF 32 e limita a resolução máxima a 720p.],
    [RN6], [Apenas vídeos cujo processamento tenha sido concluído com sucesso podem ser disponibilizados ao utilizador como resultado final.],
    [RN7], [Cada compressão/otimização concluída com sucesso conta como uma operação na quota diária do utilizador registado que a executa. A operação é reservada ao iniciar o processamento e devolvida se o pedido for recusado, cancelado, falhar ou exceder o tempo máximo (RNG-04, RNG-05).],
    [RN8], [Os pedidos de utilizadores premium são processados com prioridade na fila (RNG-07).],
    [RN9], [Num projeto partilhado, a compressão pode ser executada por quem tem um link com permissão de edição; a operação é descontada a quem a executa (RNG-05).],
)

=== Assunções

#tabela(
  colunas: (1.4cm, 1fr),
  [ID], [Assunção],
    [A1], [Assume-se que o PictuRAS já possui um mecanismo de carregamento de ficheiros de vídeo.],
    [A2], [Assume-se que o sistema consegue identificar informação básica do vídeo, nomeadamente o seu formato, codec, duração e tamanho.],
    [A3], [Assume-se que o processo de otimização gera um novo ficheiro e não substitui o vídeo original.],
    [A4], [Assume-se que existem três níveis de qualidade disponíveis para escolha do utilizador: Alta, Equilibrada e Tamanho reduzido.],
    [A5], [Assume-se que o sistema consegue verificar os limites aplicáveis ao perfil do utilizador antes de iniciar o processamento.],
    [A6], [Assume-se, para o MVP, que o processamento de vídeo será realizado de forma assíncrona, permitindo ao utilizador continuar a utilizar a aplicação.],
    [A7], [Assume-se que os estados mínimos de uma operação de processamento são: em fila, a processar, concluída, falhada e cancelada.],
    [A8], [Assume-se que, no MVP, a indicação de progresso será atualizada pelo menos a cada 5 segundos.],
    [A9], [Assume-se que só o proprietário do projeto e quem tem um link de partilha válido podem aceder ao ficheiro original e ao respetivo resultado otimizado.],
    [A10], [Assume-se que o vídeo otimizado fica guardado no projeto enquanto o projeto e o ficheiro existirem.],
    [A11], [Assume-se que os limites de RN3 podem ser mais altos do que nas ferramentas com IA porque a compressão é uma recodificação sem modelo de IA, que no MVP demora até 1,5 vezes a duração do vídeo; na prática ficam limitados pelo carregamento de ficheiros (100 MB).],
)

=== Questões em Aberto

#tabela(
  colunas: (1.4cm, 1fr, 5cm),
  [ID], [Questão], [Resolução],
  [Q1], [O sistema deverá apresentar ao utilizador uma estimativa do tamanho final do vídeo antes de iniciar o processamento?], [Adiada para fase posterior: no MVP o utilizador vê o tamanho final e a redução no fim e é avisado quando o resultado fica maior do que o original → FA4.],
  [Q2], [Em produção, qual deverá ser o período de retenção dos vídeos otimizados para cada perfil de utilizador?], [Decidida: o vídeo otimizado fica no projeto enquanto o projeto e o ficheiro existirem, em todos os planos → A10, RNG-03 e REQ-VID-STORE-001.],
  [Q3], [Em produção, que tipos de falha deverão permitir retoma ou repetição automática do processamento?], [Adiada para a Fase 2: no MVP não há repetição automática; em produção prevê-se 1 repetição para falhas transitórias e tempo excedido → REQ-VID-TIMEOUT-001.],
  [Q4], [Numa evolução futura, a compressão/otimização de vídeo deverá integrar o encadeamento de ferramentas e o processamento em lote existentes no PictuRAS?], [Adiada para fase posterior: no MVP as ferramentas de vídeo aplicam-se a um vídeo de cada vez.],
)
