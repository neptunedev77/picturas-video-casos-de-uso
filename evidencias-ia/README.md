# Evidências de uso de agentes de IA

Entregável "Evidências de uso de IA" da Fase 1: configuração dos agentes e _prompts_ relevantes. É referido no
capítulo 9 do relatório (`doc-ext-requisitos.pdf`).

## Configuração dos agentes

| Ferramenta | Usada em | Configuração |
|---|---|---|
| Claude (chat) e Claude Code (Claude Opus 5.5, Anthropic) | UC-VID-001; alinhamento comum, testes e relatório | Sem _skills_, sem instruções de projeto (`CLAUDE.md`) e sem servidores MCP próprios. O Claude Code trabalhou no repositório com o contexto do código, dos casos de uso e dos documentos de base; cada alteração e cada _commit_ foi aprovado por um elemento da equipa. |
| ChatGPT (OpenAI) | UC-VID-002, UC-VID-004 | Conversa, sem configuração adicional. |
| Gemini (Google) | UC-VID-003 | Conversa, sem configuração adicional. |
| Antigravity (Google DeepMind) | UC-VID-005 | Agente no repositório, sem regras ou _workflows_ próprios. |

Nenhum elemento criou _skills_ (`.claude/skills/<skill-name>/SKILL.md`) nem instruções de projeto, pelo que
essa parte do entregável não se aplica. A evidência são os _prompts_ e os _commits_ que deles resultaram.


## Ficheiros

| Ficheiro | Elemento | Caso de uso | Ferramenta |
|---|---|---|---|
| [`UC-VID-001-antonio-sousa.md`](UC-VID-001-antonio-sousa.md) | António Sousa | Remover silêncios; tarefas transversais | Claude, Claude Code |
| [`UC-VID-002-bruno-sousa.md`](UC-VID-002-bruno-sousa.md) | Bruno Sousa | Comprimir/otimizar vídeo | ChatGPT |
| [`UC-VID-003-diogo-macedo.md`](UC-VID-003-diogo-macedo.md) | Diogo Macedo | Anonimizar rostos e matrículas | Gemini |
| [`UC-VID-004-bruno-vale.md`](UC-VID-004-bruno-vale.md) | Bruno Vale | Gerar legendas automáticas | ChatGPT |
| [`UC-VID-005-sergio-vieira.md`](UC-VID-005-sergio-vieira.md) | Sérgio Vieira | Remover o fundo por IA | Antigravity |
