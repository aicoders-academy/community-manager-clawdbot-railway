import { fetchAiNews } from "./news.js";
import { callOpenRouter } from "./openrouter.js";
import { suggestPosts } from "./suggestions.js";
import { summarizeHotTopics } from "./summary.js";
import { truncateText } from "./text.js";

function hasText(value) {
  return String(value || "").trim().length > 0;
}

function toDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function sinceDate(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function postDate(post) {
  return toDate(post.created_at || post.createdAt || post.published_at || post.updated_at || post.updatedAt);
}

function postScore(post) {
  const fields = [
    post.likes_count,
    post.like_count,
    post.reactions_count,
    post.comments_count,
    post.comment_count,
    post.views_count,
  ];

  return fields.reduce((total, value) => total + (Number.parseInt(String(value ?? "0"), 10) || 0), 0);
}

function postTitle(post) {
  return post.name || post.title || "Post sem titulo";
}

function postBody(post) {
  return post.body || post.content || post.description || "";
}

function postUrl(post) {
  return post.url || post.web_url || post.absolute_url || post.slug || "";
}

function recentCirclePosts(circlePosts, days) {
  const cutoff = sinceDate(days);
  return circlePosts.filter((post) => {
    const date = postDate(post);
    return !date || date >= cutoff;
  });
}

function whatsappLines(whatsappMessages, limit = 80) {
  return whatsappMessages.slice(-limit).filter(hasText).map((message) => `- ${message}`).join("\n");
}

function circleLines(circlePosts, limit = 20) {
  return circlePosts
    .slice(0, limit)
    .map((post) => {
      const pieces = [`- ${postTitle(post)}`];
      const score = postScore(post);
      if (score) pieces.push(`engajamento=${score}`);
      const url = postUrl(post);
      if (url) pieces.push(`link=${url}`);
      const body = truncateText(postBody(post), 280);
      if (body) pieces.push(`texto=${body}`);
      return pieces.join(" | ");
    })
    .join("\n");
}

// Identifica destaques da semana usando sinais de engajamento do Circle e conversas recentes.
export async function getWeeklyHighlights({ circlePosts = [], whatsappMessages = [] } = {}) {
  const posts = recentCirclePosts(circlePosts, 7)
    .sort((a, b) => postScore(b) - postScore(a))
    .slice(0, 5);
  const circleContext = circleLines(posts);
  const whatsappContext = whatsappLines(whatsappMessages, 60);

  if (!circleContext && !whatsappContext) {
    return "Ainda nao tenho dados suficientes para apontar destaques da semana.";
  }

  const result = await callOpenRouter([
    {
      role: "system",
      content:
        "Liste destaques da semana da comunidade em portugues. Use apenas as evidencias recebidas. Inclua posts, comentarios ou temas recorrentes quando houver. Nao invente.",
    },
    {
      role: "user",
      content: truncateText(`Circle:\n${circleContext || "Sem posts recentes."}\n\nWhatsApp:\n${whatsappContext || "Sem mensagens."}`, 5000),
    },
  ]);

  return result || "Destaques indisponiveis: OpenRouter nao configurado ou sem contexto suficiente.";
}

// Gera alerta de moderacao consolidado para mensagens recentes da comunidade.
export async function getModerationAlerts({ whatsappMessages = [] } = {}) {
  const context = whatsappLines(whatsappMessages, 80);
  if (!context) return "Nenhuma mensagem recente de grupos autorizados para revisar moderacao.";

  const result = await callOpenRouter([
    {
      role: "system",
      content:
        "Voce revisa diretrizes de comunidade. Aponte apenas possiveis quebras presentes nas mensagens. Responda com risco, evidencia, motivo e acao recomendada. Se nao houver quebra, diga isso claramente.",
    },
    {
      role: "user",
      content: truncateText(context, 5000),
    },
  ]);

  return result || "Alertas de moderacao indisponiveis: OpenRouter nao configurado.";
}

// Gera um resumo diario curto do que aconteceu nos grupos e no Circle.
export async function getDailySummary({ circlePosts = [], whatsappMessages = [] } = {}) {
  const todayPosts = recentCirclePosts(circlePosts, 1);
  return summarizeHotTopics({ circlePosts: todayPosts, whatsappMessages });
}

// Propoe posts com base no que a comunidade esta falando.
export async function getCommunityPostIdeas({ circlePosts = [], whatsappMessages = [] } = {}) {
  return suggestPosts({ circlePosts, whatsappMessages });
}

// Propoe posts usando noticias recentes de IA, mas pede conexao clara com dores reais quando existirem.
export async function getAiNewsPostIdeas({ circlePosts = [], whatsappMessages = [] } = {}) {
  const news = await fetchAiNews();
  const newsText = news.map((item) => `- ${item.title} (${item.link})`).join("\n");
  const communityContext = await summarizeHotTopics({ circlePosts, whatsappMessages });

  const result = await callOpenRouter([
    {
      role: "system",
      content:
        "Proponha posts baseados em noticias recentes de IA. Priorize conexao com dores reais da comunidade. Se nao houver dores reais, marque as ideias como inspiracoes gerais, nao como demandas da comunidade.",
    },
    {
      role: "user",
      content: truncateText(`Noticias:\n${newsText || "Sem noticias disponiveis."}\n\nContexto da comunidade:\n${communityContext}`, 5000),
    },
  ]);

  return result || "Ideias baseadas em noticias indisponiveis: OpenRouter ou RSS indisponivel.";
}

// Responde conversa livre mantendo os limites de evidencias da comunidade.
export async function answerCommunityManagerChat({ prompt, circlePosts = [], whatsappMessages = [] } = {}) {
  const circleContext = circleLines(circlePosts, 10);
  const whatsappContext = whatsappLines(whatsappMessages, 30);

  const result = await callOpenRouter([
    {
      role: "system",
      content:
        [
          "Voce e um Community Manager conversando com o operador da comunidade.",
          "Responda em portugues, de forma direta e util.",
          "Pode conversar normalmente, mas nao invente dados factuais sobre a comunidade.",
          "Quando usar informacoes da comunidade, cite que vieram do Circle ou WhatsApp.",
          "Se nao houver dados suficientes para uma pergunta operacional, diga o que falta.",
        ].join(" "),
    },
    {
      role: "user",
      content: truncateText(
        `Pergunta:\n${prompt || "Como voce pode me ajudar hoje?"}\n\nCircle disponivel:\n${
          circleContext || "Sem dados do Circle."
        }\n\nWhatsApp disponivel:\n${whatsappContext || "Sem mensagens de grupos autorizados."}`,
        5000,
      ),
    },
  ]);

  return result || "Nao consegui responder agora porque o OpenRouter nao esta configurado ou esta indisponivel.";
}

// Classifica a intencao do pedido feito no Slack.
export function detectTaskIntent(text) {
  const prompt = String(text || "").toLowerCase();
  if (/\b(o que voce faz|o que você faz|o que voce sabe fazer|o que você sabe fazer|ajuda|help|comandos|capacidades|o que pode fazer|o que vc faz|como voce pode ajudar|como você pode ajudar)\b/.test(prompt)) {
    return "capabilities";
  }
  if (/\b(destaque|destaques|semana|semanal|mais curtido|mais comentado|top post|topico quente)\b/.test(prompt)) {
    return "weekly_highlights";
  }
  if (/\b(diretriz|diretrizes|moderacao|moderação|quebrando|violacao|violação|alerta|risco)\b/.test(prompt)) {
    return "moderation_alerts";
  }
  if (/\b(resumo diario|resumo diário|hoje|dia|diario|diário|grupos?)\b/.test(prompt)) {
    return "daily_summary";
  }
  if (/\b(noticia|notícias|noticias|mundo da ia|novidade|tendencia|tendência)\b/.test(prompt)) {
    return "ai_news_posts";
  }
  if (/\b(conteudo|conteúdo|postar|posts?|pauta|pautas|ideia|ideias)\b/.test(prompt)) {
    return "community_post_ideas";
  }
  if (/\b(tarefa|tarefas|digest)\b/.test(prompt)) {
    return "task_digest";
  }
  return "chat";
}

// Explica as capacidades do agente e exemplos de comandos.
export function describeCapabilities() {
  return [
    "*Eu posso te ajudar como Community Manager da comunidade.*",
    "",
    "*Tarefas que consigo executar:*",
    "- Pegar os destaques da semana: posts, comentarios ou temas com mais sinal de engajamento.",
    "- Avisar possiveis quebras de diretrizes nas mensagens recentes dos grupos autorizados.",
    "- Propor conteudos com base no que as pessoas estao falando.",
    "- Fazer resumo diario do que aconteceu nos grupos e no Circle.",
    "- Propor posts com base em noticias recentes do mundo da IA.",
    "- Conversar com voce sobre a comunidade, sem inventar dados quando faltar contexto.",
    "",
    "*Exemplos de pedidos:*",
    "- `quais foram os destaques da semana?`",
    "- `tem alguem quebrando as diretrizes?`",
    "- `me faz um resumo diario dos grupos`",
    "- `proponha posts com base no que as pessoas estao falando`",
    "- `sugira posts com noticias de IA`",
    "- `qual foi o post mais curtido do dia?`",
    "",
    "*O que preciso para responder bem:*",
    "- Circle configurado com `CIRCLE_API_TOKEN` e `COMMUNITY_ID`.",
    "- WhatsApp/Evolution configurado e grupos liberados em `ALLOWED_GROUPS`.",
    "- OpenRouter configurado com `OPENROUTER_API_KEY`.",
    "- Slack configurado com `SLACK_BOT_TOKEN` e `SLACK_SIGNING_SECRET`.",
  ].join("\n");
}

// Executa a tarefa solicitada pelo operador.
export async function runCommunityTask({ intent, prompt, circlePosts = [], whatsappMessages = [] } = {}) {
  switch (intent) {
    case "capabilities":
      return describeCapabilities();
    case "weekly_highlights":
      return getWeeklyHighlights({ circlePosts, whatsappMessages });
    case "moderation_alerts":
      return getModerationAlerts({ whatsappMessages });
    case "daily_summary":
      return getDailySummary({ circlePosts, whatsappMessages });
    case "community_post_ideas":
      return getCommunityPostIdeas({ circlePosts, whatsappMessages });
    case "ai_news_posts":
      return getAiNewsPostIdeas({ circlePosts, whatsappMessages });
    case "task_digest": {
      const summary = await getDailySummary({ circlePosts, whatsappMessages });
      const suggestions = await getCommunityPostIdeas({ circlePosts, whatsappMessages });
      return [`*Resumo*`, summary, "", "*Proximas pautas*", suggestions].join("\n");
    }
    default:
      return answerCommunityManagerChat({ prompt, circlePosts, whatsappMessages });
  }
}
