#import "../template.typ": *

= Manutenção Corretiva da Solução de Base

#orientacao[
  Problemas encontrados na solução de base durante o estudo e a integração do vídeo (erros, incoerências com o
  documento de requisitos, dificuldades de execução). Indiquem se foram corrigidos nesta fase. Capítulo
  recomendado; removam-no se não houver nada a registar.
]

Os problemas abaixo foram encontrados ao comparar o código atual com a solução de base e
durante a integração do vídeo. Os que impediam o suporte a vídeo foram corrigidos nesta fase; os restantes ficam
registados para a Fase 2.

#tab([Tarefas de manutenção corretiva],
  tabela(
    colunas: (1.2cm, 1fr, 2.4cm, 1.6cm, 2cm, 1.8cm),
    tamanho: 8.5pt,
    [ID], [Descrição do problema], [Impacto], [Prioridade], [Rel. Req.], [Estado],
    [T-01], [A procura do utilizador por email no início de sessão devolvia o objeto já convertido para JSON, sem o _hash_ da palavra-passe, pelo que a verificação da palavra-passe podia falhar e impedir o login. Passou a devolver o documento completo (_commit_ `a5e7a86`).], [Funcional], [Alta], [Autenticação (base)], [Corrigido],
    [T-02], [O Nginx não definia `client_max_body_size`, ficando com o limite por omissão de 1 MB: qualquer upload maior (imagens grandes ou vídeos) era recusado com erro 413 antes de chegar aos serviços. Limite aumentado para 100 MB.], [Funcional], [Alta], [REQ-VID-SIL-025; REQ-VID-OUTPUT-001], [Corrigido],
    [T-03], [O upload no Image Storage Service não verificava se tinha sido enviado um ficheiro nem o seu tipo: um pedido sem ficheiro provocava um erro interno e era aceite qualquer tipo de ficheiro. Passou a recusar com 400 os pedidos sem ficheiro e os tipos não permitidos.], [Fiabilidade / Segurança], [Média], [REQ-VID-SIL-003; REQ-VID-COMP-016], [Corrigido],
    [T-04], [A extensão do ficheiro guardado era deduzida do tipo MIME (e.g., `video/quicktime` dava `.quicktime` e `image/svg+xml` dava `.svg+xml`), produzindo ficheiros com extensões inválidas. Passou a manter a extensão original do ficheiro.], [Funcional], [Média], [REQ-VID-SIL-022; REQ-VID-BG-015], [Corrigido],
    [T-05], [A grelha do projeto não era atualizada quando um ficheiro era acrescentado ou apagado por outra sessão ou por uma ferramenta, sendo preciso recarregar a página. Foram criados os eventos `IMAGE_ADDED` e `IMAGE_REMOVED`.], [Usabilidade], [Média], [REQ-VID-SIL-025; REQ-VID-BLUR-008], [Corrigido],
    [T-06], [O ficheiro `projects/routes/projects.js` já tinha 2565 linhas na base e chega agora a 2896, misturando rotas, regras de quota, orquestração das ferramentas e temporizadores. Dificulta a manutenção e os testes e contribuiu para haver duas formas de integrar as ferramentas de vídeo (DA-03).], [Manutenibilidade], [Média], [REQ-VID-ARCH-001], [Pendente (Fase 2)],
    [T-07], [As mensagens de erro das ferramentas que respondem pela fila do `projects` (`Tools/utils/tool_msg.py`) trocavam o identificador do pedido com o da resposta e punham o texto em `error.message`, enquanto o `projects` procura o pedido pelo `correlationId` e lia `error.msg`: o erro era ignorado sem aviso e a interface ficava à espera, sem mostrar "Falhada". Afetava as ferramentas de imagem, a anonimização e a remoção de fundo. Encontrado no teste manual de 21-10-2026; corrigido e testado (TST-FAIL-01).], [Fiabilidade / Usabilidade], [Alta], [REQ-VID-FAIL-001], [Corrigido],
  ),
)