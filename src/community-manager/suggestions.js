import { fetchAiNews } from "./news.js";
import { callOpenRouter } from "./openrouter.js";
import { summarizeHotTopics } from "./summary.js";
import { truncateText } from "./text.js";

function hasCommunityContext({ circlePosts = [], whatsappMessages = [] } = {}) {
  return (
    circlePosts.some((post) =>
      String(post.name || post.title || post.body || post.content || post.description || "").trim(),
    ) || whatsappMessages.some((message) => String(message || "").trim())
  );
}

// Cruza noticias de IA com dores da comunidade para sugerir pautas de posts.
export async function suggestPosts({ circlePosts = [], whatsappMessages = [] } = {}) {
  if (!hasCommunityContext({ circlePosts, whatsappMessages })) {
    return [
      "Ainda nao tenho dores reais da comunidade suficientes para sugerir posts com qualidade.",
      "Para evitar sugestoes genericas, aguarde dados do Circle ou mensagens de grupos autorizados do WhatsApp.",
    ].join("\n");
  }

  const news = await fetchAiNews();
  const pains = await summarizeHotTopics({ circlePosts, whatsappMessages });
  const newsText = news
    .map((item) => {
      const parts = [`- [${item.source}] ${item.title}`];
      if (item.developerImpact) parts.push(`impacto=${item.developerImpact}`);
      if (item.summary) parts.push(`contexto=${truncateText(item.summary, 180)}`);
      if (item.link) parts.push(`link=${item.link}`);
      return parts.join(" | ");
    })
    .join("\n");

  const result = await callOpenRouter([
    {
      role: "system",
      content:
        [
          "Voce sugere posts para uma comunidade de IA com base em dores reais da comunidade.",
          "Use as dores fornecidas como fonte primaria.",
          "Use noticias apenas quando elas conectarem claramente com uma dor real ou com desenvolvimento pratico.",
          "Priorize assuntos uteis para devs: releases de modelos, APIs, SDKs, agentes, coding tools, seguranca, benchmarks, custos e limites.",
          "Nao invente dores, estatisticas, tendencias ou funcionalidades.",
          "Se uma ideia nao tiver evidencia, nao inclua.",
          "Gere no maximo 3 ideias curtas para Slack, cada uma com: titulo, gancho, dor atendida, evidencia usada e proximo passo.",
        ].join(" "),
    },
    {
      role: "user",
      content: truncateText(
        `Dores reais da comunidade:\n${pains}\n\nNoticias recentes opcionais:\n${newsText || "Sem noticias disponiveis."}`,
        5000,
      ),
    },
  ]);

  return result || "Sugestoes indisponiveis: OpenRouter nao configurado ou noticias indisponiveis.";
}
