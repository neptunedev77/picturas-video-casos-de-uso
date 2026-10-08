// frontend/lib/error-messages.ts
import axios from "axios";

type ErrorContext =
  | "auth-login"
  | "auth-register"
  | "project-create"
  | "project-delete"
  | "project-update"
  | "project-upload"
  | "project-download"
  | "project-process"
  | "project-cancel-process"
  | "project-load"           
  | "billing"
  | "upgrade"
  | "ai"
  | "account-profile"     
  | "account-password" 
  | "generic"
  | "assistant-suggest"
  | "project-reorder";


type ErrorInfo = {
  title: string;
  description: string;
};

/**
 * Sanitiza mensagens vindas do backend para evitar a fuga de stack traces,
 * caminhos de ficheiros internos do servidor ou blocos de código/HTML.
 */
export function sanitizeBackendMessage(msg?: string): string | undefined {
  if (!msg || typeof msg !== "string") return undefined;

  const trimmed = msg.trim();

  // 1. Rejeitar tags HTML (ex: páginas de erro 502/504 do Nginx)
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return undefined;

  // 2. Rejeitar stack traces e menções a erros de runtime Node.js
  if (/\b(at\s+|Error:|\.js:\d+|node_modules|\/app\/|\/usr\/)/i.test(trimmed)) {
    return undefined;
  }

  // 3. Rejeitar caminhos absolutos de ficheiros
  if (/([A-Z]:\\|\/var\/|\/etc\/|\/tmp\/)/i.test(trimmed)) {
    return undefined;
  }

  // 4. Rejeitar mensagens desmesuradamente longas (típicas de dumps de exceção não formatados)
  if (trimmed.length > 200) return undefined;

  return trimmed;
}

export function getErrorMessage(
  context: ErrorContext,
  error?: unknown,
): ErrorInfo {
  // 1) Erros de rede (sem resposta)
  if (axios.isAxiosError(error) && !error.response) {
    return {
      title: "Sem ligação à internet",
      description:
        "Não foi possível comunicar com o servidor. Verifica a tua ligação e tenta novamente.",
    };
  }

  // 2) Mensagem vinda do backend (string ou objeto)
  const backendMsg =
    axios.isAxiosError(error)
      ? typeof error.response?.data === "string"
        ? error.response?.data
        : typeof error.response?.data?.message === "string"
        ? error.response?.data?.message
        : typeof error.response?.data?.error === "string"
        ? error.response?.data?.error
        : undefined
      : undefined;

  // Versão sanitizada para uso seguro em fallbacks
  const safeMsg = sanitizeBackendMessage(backendMsg);

  // Mapeamentos específicos de mensagens do backend para mensagens claras e amigáveis:
  if (backendMsg) {
    // 1. Registo e Autenticação
    if (
      backendMsg === "The given email is already in use." ||
      backendMsg.includes("already in use")
    ) {
      return {
        title: "Email já registado",
        description:
          "Este endereço de email já se encontra em uso. Inicia sessão na tua conta ou utiliza outro email.",
      };
    }

    if (backendMsg === "The provided credentials are incorrect") {
      return {
        title: "Credenciais incorretas",
        description:
          "O email ou a palavra-passe inserida não estão corretos. Verifica os dados e tenta novamente.",
      };
    }

    if (
      backendMsg === "Invalid token." ||
      backendMsg === "Missing or invalid Authorization header." ||
      backendMsg === "Authentication required"
    ) {
      return {
        title: "Sessão expirada",
        description:
          "A tua sessão expirou ou não é válida. Por favor, inicia sessão novamente.",
      };
    }

    // 2. Quotas e Limites
    if (backendMsg === "No more daily_operations available") {
      return {
        title: "Limite diário atingido",
        description:
          "Atingiste o limite diário de operações gratuitas. Volta a tentar amanhã ou subscreve o plano Premium.",
      };
    }

    if (backendMsg === "User type can't use this tool") {
      return {
        title: "Funcionalidade exclusiva Premium",
        description:
          "Esta ferramenta requer uma subscrição Premium ativa. Faz upgrade na tua conta para a utilizar.",
      };
    }

    // 3. Ficheiros (Imagens e Vídeos)
    if (backendMsg === "This project already has an image with that name.") {
      return {
        title: "Imagem já existente",
        description:
          "Já existe uma imagem com este nome no projeto. Renomeia o ficheiro ou escolhe outro.",
      };
    }

    if (backendMsg === "This project already has a video with that name.") {
      return {
        title: "Vídeo já existente",
        description:
          "Já existe um vídeo com este nome no projeto. Renomeia o ficheiro ou escolhe outro.",
      };
    }

    if (backendMsg.includes("Unsupported video format")) {
      return {
        title: "Formato de vídeo não suportado",
        description:
          "O formato do vídeo não é suportado. Por favor, envia um ficheiro nos formatos .mp4 ou .webm.",
      };
    }

    if (backendMsg === "No file found" || backendMsg === "No video file found") {
      return {
        title: "Nenhum ficheiro selecionado",
        description:
          "Não foi detetado nenhum ficheiro para envio. Seleciona o ficheiro novamente.",
      };
    }

    if (backendMsg === "Video not found." || backendMsg === "No image with such id.") {
      return {
        title: "Ficheiro não encontrado",
        description:
          "O recurso multimédia solicitado já não existe ou foi removido do projeto.",
      };
    }

    // 4. Projetos e Conflitos
    if (backendMsg === "Project version conflict") {
      return {
        title: "Conflito de alterações",
        description:
          "O projeto foi atualizado por outro colaborador ou noutra sessão. Recarrega a página para ver a versão mais recente.",
      };
    }

    if (backendMsg === "No tools selected") {
      return {
        title: "Nenhuma ferramenta selecionada",
        description:
          "Adiciona pelo menos uma ferramenta ao pipeline antes de iniciar o processamento.",
      };
    }

    if (backendMsg === "Project has no images") {
      return {
        title: "Projeto sem imagens",
        description:
          "O projeto precisa de ter pelo menos uma imagem para que as ferramentas possam ser aplicadas.",
      };
    }

    if (backendMsg === "Error storing image" || backendMsg === "Error storing video") {
      return {
        title: "Erro no armazenamento",
        description:
          "Não foi possível transferir o ficheiro para o repositório de armazenamento. Tenta novamente.",
      };
    }

    if (backendMsg === "Updating project information") {
      return {
        title: "Erro ao atualizar projeto",
        description:
          "O ficheiro foi transferido, mas ocorreu um problema ao associá-lo ao projeto. Recarrega a página.",
      };
    }

    if (backendMsg === "Error acquiring user's project") {
      return {
        title: "Projeto indisponível",
        description:
          "Não foi possível aceder aos dados do projeto. Verifica se tens permissão de edição.",
      };
    }
  }

  // 3) Contextos específicos
  switch (context) {
    case "auth-login":
      return {
        title: "Erro no login",
        description:
          safeMsg ??
          "Não foi possível iniciar sessão. Verifica as credenciais e tenta novamente.",
      };

    case "auth-register":
      return {
        title: "Erro no registo",
        description:
          safeMsg ??
          "Não foi possível concluir o registo. Verifica os dados inseridos e tenta novamente.",
      };

    case "project-create":
      return {
        title: "Erro ao criar projeto",
        description:
          safeMsg ??
          "Ocorreu um problema ao criar o projeto. Verifica a tua ligação e tenta novamente.",
      };

    case "project-upload":
      return {
        title: "Erro ao carregar ficheiros",
        description:
          safeMsg ??
          "Não foi possível carregar o ficheiro. Confirma se é uma imagem (.png, .jpg, .jfif, .webp, .heic) ou vídeo (.mp4, .webm) até 500 MB e tenta novamente.",
      };

    case "project-download":
      return {
        title: "Erro no download",
        description:
          safeMsg ??
          "Não foi possível fazer o download do projeto. Tenta novamente mais tarde.",
      };

    case "project-process":
      return {
        title: "Falha no processamento",
        description:
          safeMsg ??
          "Ocorreu um erro ao processar o projeto. Tenta novamente. Se o problema persistir, verifica a tua ligação ou volta a tentar mais tarde.",
      };

    case "project-cancel-process":
      return {
        title: "Não foi possível cancelar o processamento",
        description:
          safeMsg ??
          "O cancelamento do processamento falhou. Verifica a tua ligação e tenta novamente.",
      };

    case "account-profile":
      return {
        title: "Erro ao atualizar perfil",
        description:
          safeMsg ??
          "Não foi possível atualizar os dados do perfil. Verifica a informação inserida e tenta novamente.",
      };

    case "account-password":
      return {
        title: "Erro ao atualizar password",
        description:
          safeMsg ??
          "Não foi possível atualizar a password. Confirma a password atual e tenta novamente.",
      };


    case "upgrade":
      return {
        title: "Erro ao atualizar o plano",
        description:
          safeMsg ??
          "Ocorreu um erro ao alterar o plano de subscrição. Tenta novamente.",
      };
    
    case "billing":
      return {
        title: "Erro na faturação",
        description:
          safeMsg ??
          "Ocorreu um erro ao gerir a tua subscrição ou método de pagamento. Verifica os dados e tenta novamente.",
      };

    case "ai":
      return {
        title: "Falha na IA",
        description:
          safeMsg ??
          "Não foi possível gerar sugestões da IA. Tenta novamente. Se o problema continuar, verifica a tua ligação à internet.",
      };

    case "project-load":
      return {
        title: "Erro ao carregar projeto",
        description:
          safeMsg ??
          "Não foi possível carregar o projeto. Verifica a tua ligação e tenta novamente.",
      };

    case "assistant-suggest":
      return {
        title: "Falha no processamento",
        description: "Falha no processamento. Tente novamente.",

      };

    case "project-reorder":
      return {
        title: "Erro ao aplicar sugestão",
        description:
          safeMsg ??
          "Não foi possível atualizar a sequência de ferramentas. Tenta novamente.",
      };

    default:
      return {
        title: "Ocorreu um erro",
        description:
          safeMsg ??
          "Algo correu mal. Tenta novamente ou volta a tentar mais tarde.",
      };
  }
}

// Códigos de erro que vêm das tools de IA (bg_remove_ai, cut_ai, upgrade_ai, obj_ai, people_ai, text_ai)
// Por agora podes ter mensagens genéricas e depois refinas se o prof pedir algo mais específico
export function getAiErrorMessage(
  code?: number,
  backendMsg?: string,
): ErrorInfo {
  if (code != null) {
    switch (code) {
      case 1100: // bg_remove_ai wrong_procedure
      case 1101: // bg_remove_ai error_processing
        return {
          title: "Erro na remoção de fundo",
          description:
            "Não foi possível remover o fundo desta imagem. Tenta novamente ou experimenta outra imagem.",
        };

      case 1800: // upgrade_ai wrong_procedure
      case 1801: // upgrade_ai error_processing
        return {
          title: "Erro na melhoria da imagem",
          description:
            "Não foi possível melhorar esta imagem. Verifica o formato/tamanho e tenta novamente.",
        };

      case 2000: // cut_ai wrong_procedure
      case 2001: // cut_ai error_processing
        return {
          title: "Erro no corte inteligente",
          description:
            "Não foi possível calcular o corte inteligente para esta imagem. Tenta novamente ou ajusta a imagem original.",
        };

      case 2100: // obj_ai wrong_procedure
      case 2101: // obj_ai error_processing
        return {
          title: "Erro na deteção de objetos",
          description:
            "Não foi possível detetar objetos na imagem. Tenta novamente ou usa outra imagem com mais contraste.",
        };

      // Se tiveres códigos extra dos outros serviços (people_ai, text_ai), vais só acrescentando aqui.
    }
  }

  // fallback genérico
  return {
    title: "Falha na IA",
    description:
      backendMsg ??
      "Não foi possível aplicar a ferramenta de IA. Tenta novamente. Se o problema continuar, verifica a tua ligação à internet ou volta a tentar mais tarde.",
  };
}
