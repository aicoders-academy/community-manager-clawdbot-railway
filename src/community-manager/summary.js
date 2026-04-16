import { callOpenRouter } from "./openrouter.js";
import { truncateText } from "./text.js";

// Consolida os principais topicos do Circle e das mensagens recentes recebidas do WhatsApp.
export async function summarizeHotTopics({ circlePosts = [], whatsappMessages = [] } = {}) {
  const circleContext = circlePosts
    .slice(0, 20)
    .map((post) => `- ${post.name || post.title || "Post"}: ${post.body || post.content || ""}`)
    .join("\n");
  const whatsappContext = whatsappMessages.slice(-50).map((message) => `- ${message}`).join("\n");

  const result = await callOpenRouter([
    {
      role: "system",
      content:
        "Voce e um Community Manager. Gere um resumo objetivo em portugues com topicos quentes, dores recorrentes e oportunidades de resposta.",
    },
    {
      role: "user",
      content: truncateText(`Circle:\n${circleContext}\n\nWhatsApp:\n${whatsappContext}`, 5000),
    },
  ]);

  return result || "Resumo indisponivel: OpenRouter nao configurado ou sem contexto suficiente.";
}
