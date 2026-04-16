import { callOpenRouter } from "./openrouter.js";
import { truncateText } from "./text.js";

function hasText(value) {
  return String(value || "").trim().length > 0;
}

function postToSummaryLine(post) {
  const title = post.name || post.title || "Post sem titulo";
  const body = post.body || post.content || post.description || "";
  const comments = Array.isArray(post.comments)
    ? post.comments.map((comment) => comment.body || comment.content || comment.text || "").filter(hasText)
    : [];

  return [`- ${title}: ${body}`, ...comments.map((comment) => `  Comentario: ${comment}`)]
    .filter(hasText)
    .join("\n");
}

// Consolida os principais topicos do Circle e das mensagens recentes recebidas do WhatsApp.
export async function summarizeHotTopics({ circlePosts = [], whatsappMessages = [] } = {}) {
  const hasCircleContext = circlePosts.some((post) =>
    hasText(post.name || post.title || post.body || post.content || post.description),
  );
  const hasWhatsappContext = whatsappMessages.some(hasText);

  if (!hasCircleContext && !hasWhatsappContext) {
    return [
      "Ainda nao tenho dados suficientes da comunidade para gerar um resumo confiavel.",
      "Nenhum post/comentario do Circle ou mensagem de grupo autorizado do WhatsApp foi encontrado no contexto atual.",
      "Proxima acao: confirme CIRCLE_API_TOKEN, COMMUNITY_ID, EVOLUTION_API_URL, EVOLUTION_API_KEY e ALLOWED_GROUPS; depois envie novas mensagens nos grupos permitidos ou rode novamente a coleta do Circle.",
    ].join("\n");
  }

  const circleContext = circlePosts
    .slice(0, 20)
    .map(postToSummaryLine)
    .filter(hasText)
    .join("\n");
  const whatsappContext = whatsappMessages.slice(-50).map((message) => `- ${message}`).join("\n");

  const result = await callOpenRouter([
    {
      role: "system",
      content:
        [
          "Voce e um Community Manager da comunidade do usuario.",
          "Use somente as evidencias fornecidas em Circle e WhatsApp.",
          "Nao invente tendencias, dores, noticias, recursos ou exemplos externos.",
          "Se a evidencia for fraca, diga explicitamente que a confianca e baixa.",
          "Responda em portugues com secoes curtas: Topicos quentes, Dores reais, Tarefas recomendadas, Evidencias usadas.",
        ].join(" "),
    },
    {
      role: "user",
      content: truncateText(
        `Contexto real coletado.\n\nCircle:\n${circleContext || "Sem dados do Circle."}\n\nWhatsApp:\n${
          whatsappContext || "Sem mensagens de grupos autorizados."
        }`,
        5000,
      ),
    },
  ]);

  return result || "Resumo indisponivel: OpenRouter nao configurado ou sem contexto suficiente.";
}
