#import "../template.typ": *

== UC-VID-004 — Gerar Legendas Automáticas para um Vídeo

=== Cabeçalho

#tab([Caso de uso UC-VID-004 — Gerar Legendas Automáticas para um Vídeo],
  tabela-campos(
    [ID do Caso de Uso], [UC-VID-004],
    [Nome], [Gerar Legendas Automáticas para um Vídeo],
    [Versão], [v1.6],
    [Autor], [Bruno Vale],
    [Data], [2026-10-21],
    [Objetivo], [Permitir ao utilizador gerar automaticamente legendas sincronizadas a partir da faixa de áudio de um vídeo.],
    [Âmbito], [Módulo de vídeo do PictuRAS: análise de áudio, reconhecimento de fala, geração de legendas e disponibilização do resultado.],
    [Ator Principal], [Utilizador registado (gratuito) ou utilizador premium.],
    [_Stakeholders_ e Interesses], [
      - *Utilizador (criador de conteúdo)*: pretende obter legendas de forma automática, reduzindo o trabalho manual e melhorando a acessibilidade do vídeo.
      - *Proprietário do Sistema*: pretende disponibilizar uma funcionalidade de valor acrescentado sem comprometer excessivamente os recursos computacionais.
      - *Equipa de Desenvolvimento*: pretende validar a integração de processamento de áudio e reconhecimento de fala no suporte a vídeo do PictuRAS.
    ],
    [Pré-condições], [
      - O utilizador tem sessão iniciada.
      - O vídeo foi submetido com sucesso e encontra-se acessível ao sistema.
      - O vídeo possui uma faixa de áudio utilizável.
      - O formato do vídeo e o codec de áudio são suportados.
      - O utilizador tem permissão para executar a operação.
    ],
    [_Trigger_], [O utilizador seleciona um vídeo e escolhe a opção #strong[Gerar legendas automaticamente].],
  ),
)

=== Fluxo Principal

#tab([UC-VID-004 — Fluxo principal],
  tabela(
    colunas: (1.2cm, 1fr, 1fr),
    [Passo], [Ação do Ator], [Resposta do Sistema],
    [1], [O utilizador seleciona um vídeo disponível.], [O sistema apresenta o vídeo e as operações de processamento disponíveis.],
    [2], [O utilizador escolhe #strong[Gerar legendas automaticamente].], [O sistema verifica se o vídeo contém uma faixa de áudio utilizável.],
    [3], [O utilizador indica o idioma do conteúdo falado.], [O sistema verifica se o idioma indicado é suportado e prepara o processamento.],
    [4], [O utilizador confirma a operação.], [O sistema valida o vídeo, o áudio, o perfil do utilizador e as restrições aplicáveis.],
    [5], [—], [O sistema extrai ou acede à faixa de áudio necessária ao processamento.],
    [6], [—], [O sistema processa o áudio através do componente responsável pelo reconhecimento de fala.],
    [7], [—], [O sistema obtém os segmentos de texto reconhecido e os respetivos intervalos temporais.],
    [8], [—], [O sistema constrói as legendas sincronizadas com base no texto e nas marcas temporais obtidas.],
    [9], [—], [O sistema apresenta uma pré-visualização das legendas associadas ao vídeo.],
    [10], [O utilizador revê as legendas e confirma o resultado.], [O sistema valida a confirmação e prepara o resultado final.],
    [11], [—], [O sistema gera o ficheiro final de legendas em formato SRT.],
    [12], [O utilizador visualiza ou obtém o ficheiro de legendas.], [O sistema disponibiliza o resultado, mantendo o vídeo original inalterado.],
  ),
)

=== Fluxos Alternativos

#tab([UC-VID-004 — Fluxos alternativos],
  tabela(
    colunas: (4cm, 1fr),
    [Fluxo], [Descrição (passo de origem: condição → comportamento → retorno)],
    [FA1 – Alterar o idioma], [No passo 3, o utilizador altera o idioma indicado antes de confirmar a operação → O sistema valida o novo idioma e mantém o vídeo selecionado.],
    [FA2 – Repetir a geração], [No passo 10, o utilizador considera o resultado insatisfatório → O sistema permite regressar ao passo 3 para alterar o idioma e iniciar uma nova geração de legendas.],
    [FA3 – Cancelar antes do processamento], [Antes do passo 4, o utilizador cancela a operação → O sistema termina o caso de uso sem iniciar o reconhecimento de fala nem gerar um ficheiro de legendas.],
    [FA4 – Cancelar durante o processamento], [Entre os passos 5 e 8, o utilizador solicita o cancelamento → O sistema interrompe o processamento quando tecnicamente possível, descarta resultados incompletos e mantém o vídeo original inalterado.],
    [FA5 – Não confirmar o resultado], [No passo 10, o utilizador decide não confirmar as legendas geradas → O sistema termina o caso de uso sem disponibilizar o resultado como versão final.],
  ),
)

=== Exceções

#tab([UC-VID-004 — Exceções],
  tabela(
    colunas: (1fr, 1fr),
    [Condição], [Comportamento do Sistema],
    [O vídeo não possui faixa de áudio.], [O sistema informa que não é possível gerar legendas automaticamente porque o vídeo não contém áudio.],
    [O formato do vídeo ou codec de áudio não é suportado.], [O sistema rejeita o pedido e informa o utilizador sobre a incompatibilidade.],
    [O áudio possui qualidade insuficiente para reconhecimento de fala.], [O sistema informa que a qualidade do áudio pode impedir a geração fiável das legendas e não apresenta resultados inválidos como concluídos.],
    [O idioma selecionado não é suportado pelo componente de reconhecimento de fala.], [O sistema informa o utilizador e solicita a escolha de um idioma suportado.],
    [O vídeo excede 100 MB ou 10 minutos de duração.], [O sistema informa qual a restrição excedida e não inicia o processamento.],
    [O utilizador não possui quota suficiente para executar a operação.], [O sistema informa o utilizador e não cria o pedido de processamento.],
    [O reconhecimento de fala falha durante o processamento.], [O sistema marca a operação como falhada, mantém o vídeo original inalterado e informa o utilizador.],
    [Apenas parte do áudio pode ser processada corretamente.], [O sistema assinala o resultado como parcial e informa o utilizador sobre os segmentos que não puderam ser reconhecidos.],
  ),
)

=== Pós-condições

#tabela(
  colunas: (4cm, 1fr),
  [Tipo], [Resultado],
  [Garantia de Sucesso], [É gerado um conjunto de legendas sincronizadas com o conteúdo falado do vídeo, ficando o respetivo ficheiro disponível ao utilizador. O vídeo original permanece inalterado.],
    [Garantia Mínima], [O vídeo original permanece inalterado. Em caso de falha, nenhum ficheiro parcial ou inválido é apresentado como resultado concluído com sucesso.],
)

=== Regras de Negócio e Restrições

#tabela(
  colunas: (1.4cm, 1fr),
  [ID], [Regra],
    [RN1], [A geração automática de legendas requer que o vídeo possua uma faixa de áudio utilizável.],
    [RN2], [São aceites vídeos MP4 e MOV com vídeo H.264 e áudio AAC (RNG-02); no MVP, os idiomas disponibilizados para reconhecimento são Português (PT) e Inglês (EN).],
    [RN3], [O vídeo original não deve ser modificado pela operação de geração de legendas.],
    [RN4], [Cada segmento de legenda deve ficar associado a um intervalo temporal válido do vídeo.],
    [RN5], [O processamento só pode iniciar depois de o vídeo, a faixa de áudio e os parâmetros da operação terem sido validados.],
    [RN6], [No MVP, o tamanho máximo é 100 MB e a duração máxima é 10 minutos por vídeo para utilizadores registados e premium. O utilizador registado está sujeito à quota diária existente de 5 operações; o utilizador premium não é bloqueado por limite diário.],
    [RN7], [Um resultado só pode ser apresentado como concluído depois de o sistema validar a geração do ficheiro de legendas.],
    [RN8], [Resultados parciais devem ser identificados explicitamente como tal e não podem ser apresentados como transcrições completas.],
    [RN9], [A operação de geração automática de legendas deve possuir um estado identificável durante o seu ciclo de vida: em fila, a processar, pronta para revisão, concluída, falhada ou cancelada (RNG-06).],
    [RN10], [O ficheiro de legendas gerado deve permanecer associado ao vídeo de origem e seguir a política de persistência e eliminação aplicada aos restantes resultados do projeto.],
    [RN11], [As gerações de legendas concluídas com sucesso devem ser contabilizadas segundo as regras de utilização aplicáveis ao perfil do utilizador.],
    [RN12], [Os pedidos de utilizadores premium são processados com prioridade na fila (RNG-07).],
    [RN13], [Num projeto partilhado, quem tem um link com permissão de edição pode gerar legendas; a operação é descontada a quem as gera (RNG-05).],
)
#pagebreak()
=== Assunções

#tabela(
  colunas: (1.4cm, 1fr),
  [ID], [Assunção],
    [A1], [O sistema dispõe de um componente ou serviço capaz de realizar reconhecimento automático de fala.],
    [A2], [O serviço de processamento consegue extrair ou aceder à faixa de áudio dos formatos de vídeo suportados.],
    [A3], [O componente de reconhecimento de fala devolve texto associado a informação temporal suficiente para gerar legendas sincronizadas.],
    [A4], [No contexto do MVP, não é necessária a identificação automática de diferentes oradores.],
    [A5], [No contexto do MVP, as legendas são geradas no mesmo idioma do conteúdo falado, sem tradução automática.],
    [A6], [O utilizador pode rever o resultado antes de considerar a operação concluída.],
    [A7], [A infraestrutura utilizada no MVP possui recursos suficientes para processar os vídeos considerados nos testes.],
    [A8], [Os limites de RN6 são iguais nos dois planos porque o reconhecimento de fala em CPU é o passo mais demorado e 10 minutos (100 MB) mantêm o tempo de espera aceitável; o plano premium distingue-se pela ausência de limite diário e pela prioridade na fila.],
)

=== Questões em Aberto

#tabela(
  colunas: (1.4cm, 1fr, 5cm),
  [ID], [Questão], [Resolução],
  [Q1], [Que idiomas serão suportados pelo MVP?], [Decidida: No MVP, são suportados Português (PT) e Inglês (EN).],
  [Q2], [O sistema deverá detetar automaticamente o idioma ou apenas permitir seleção manual?], [Decidida: No MVP, o idioma é indicado manualmente pelo utilizador, conforme o passo 3 do fluxo principal. A deteção automática do idioma não é requisito do MVP.],
  [Q3], [Que formato de legendas deve ser disponibilizado: SRT, WebVTT ou ambos?], [Decidida: No MVP, o formato final disponibilizado ao utilizador é SRT. O WebVTT pode ser usado temporariamente no frontend para pré-visualização/fullscreen, mas não constitui um formato final disponibilizado pelo UC.],
  [Q4], [O utilizador poderá editar manualmente as legendas antes de guardar o resultado?], [Adiada para fase posterior: no MVP o utilizador revê a transcrição e pode confirmá-la ou rejeitá-la e gerar de novo (FA2); a edição manual fica para a Fase 2.],
  [Q5], [As legendas deverão poder ser incorporadas diretamente no vídeo ou apenas disponibilizadas como ficheiro separado?], [Decidida: No MVP, as legendas são disponibilizadas como ficheiro separado. A incorporação direta das legendas no vídeo fica fora do âmbito desta funcionalidade.],
  [Q6], [Qual será o tamanho máximo permitido para o vídeo?], [Decidida: No MVP, o tamanho máximo permitido é 100 MB por vídeo.],
  [Q7], [Qual será a duração máxima permitida para o vídeo?], [Decidida: No MVP, a duração máxima permitida é 10 minutos por vídeo.],
  [Q8], [O utilizador registado (gratuito) e o utilizador premium terão limites diferentes para esta operação?], [Decidida: No MVP, utilizadores registados e premium têm o mesmo limite técnico de 100 MB e 10 minutos por vídeo. A diferença está na utilização: o utilizador registado está sujeito à quota diária existente de 5 operações e o premium não é bloqueado por limite diário.],
  [Q9], [O perfil anónimo deverá ter acesso à geração automática de legendas?], [Decidida: No MVP, a geração automática de legendas está disponível apenas para utilizadores autenticados com perfil registado ou premium; o perfil anónimo fica excluído.],
  [Q10], [Uma operação que falha durante o reconhecimento de fala deve consumir quota?], [Decidida: Apenas gerações concluídas com sucesso consomem definitivamente quota. Em caso de falha, cancelamento ou rejeição, a quota reservada é devolvida ou a operação não é contabilizada definitivamente.],
  [Q11], [Como devem ser distinguidos e apresentados os segmentos de áudio sem fala dos segmentos com fala impossível de reconhecer?], [Adiada para fase posterior: depende da marcação de resultados parciais (REQ-VID-LEG-022), ainda não implementada.],
  [Q12], [O utilizador deve conseguir acompanhar o progresso do reconhecimento de fala em tempo real?], [Decidida: No MVP, não é exigido progresso percentual em tempo real. O acompanhamento é realizado através do estado da operação, com atualização segundo REQ-VID-STATUS-001 e DQ-038.],
)
