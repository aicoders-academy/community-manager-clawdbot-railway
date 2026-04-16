import { fetchAiNews } from "./news.js";
import { callOpenRouter } from "./openrouter.js";
import { summarizeHotTopics } from "./summary.js";
import { truncateText } from "./text.js";

// Cruza noticias de IA com dores da comunidade para sugerir pautas de posts.
export async function suggestPosts({ circlePosts = [], whatsappMessages = [] } = {}) {
  const news = await fetchAiNews();
  const pains = await summarizeHotTopics({ circlePosts, whatsappMessages });
  const newsText = news.map((item) => `- ${item.title} (${item.link})`).join("\n");

  const result = await callOpenRouter([
    {
      role: "system",
      content:
        "Voce sugere posts para uma comunidade de IA. Gere 5 ideias com titulo, gancho e por que atende uma dor da comunidade.",
    },
    {
      role: "user",
      content: truncateText(`Dores da comunidade:\n${pains}\n\nNoticias recentes:\n${newsText}`, 5000),
    },
  ]);

  return result || "Sugestoes indisponiveis: OpenRouter nao configurado ou noticias indisponiveis.";
}
