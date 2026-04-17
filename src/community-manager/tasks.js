import { fetchAiNews } from "./news.js";
import { callOpenRouter } from "./openrouter.js";
import { getServiceStatus } from "./config.js";
import { suggestPosts } from "./suggestions.js";
import { summarizeHotTopics } from "./summary.js";
import { compactPlainText, truncateText } from "./text.js";

function hasText(value) {
  return String(value || "").trim().length > 0;
}

function friendlyMissingData({ task, missing, nextStep }) {
  return [
    `Eu ate consigo te ajudar com ${task}, mas agora nao tenho dados suficientes pra fazer isso com seguranca.`,
    "",
    missing ? `O que faltou: ${missing}` : "",
    nextStep ? `Como resolver: ${nextStep}` : "",
  ]
    .filter(hasText)
    .join("\n");
}

function sourceStatusMessage({ circlePosts = [], whatsappMessages = [] } = {}) {
  const services = getServiceStatus();
  const parts = [];

  if (services.circle) {
    parts.push(
      circlePosts.length > 0
        ? `Circle esta configurado e retornou ${circlePosts.length} post(s), mas nenhum entrou neste criterio.`
        : "Circle esta configurado, mas nao retornou posts para esta consulta.",
    );
  } else {
    parts.push("Circle nao esta configurado: falta CIRCLE_API_TOKEN.");
  }

  if (services.whatsapp) {
    parts.push(
      whatsappMessages.length > 0
        ? `WhatsApp esta configurado e tenho ${whatsappMessages.length} mensagem(ns) dos grupos permitidos.`
        : "WhatsApp esta configurado, mas ainda nao tenho mensagens dos grupos permitidos.",
    );
  } else {
    parts.push("WhatsApp nao esta configurado; vou trabalhar sem ele por enquanto.");
  }

  return parts.join(" ");
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

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function postDate(post) {
  return toDate(post.created_at || post.createdAt || post.published_at || post.updated_at || post.updatedAt);
}

function postLikes(post) {
  const fields = [post.likes_count, post.like_count, post.likes, post.reactions_count, post.reaction_count];
  for (const value of fields) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function numberFromFields(post, fields) {
  for (const field of fields) {
    const parsed = Number.parseInt(String(post[field] ?? ""), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function postMetrics(post) {
  return {
    likes: numberFromFields(post, ["likes_count", "like_count", "likes"]),
    reactions: numberFromFields(post, ["reactions_count", "reaction_count"]),
    comments: numberFromFields(post, ["comments_count", "comment_count", "comments"]),
    views: numberFromFields(post, ["views_count", "view_count", "views"]),
  };
}

function postScore(post) {
  const metrics = postMetrics(post);
  const reactions = metrics.reactions && !metrics.likes ? metrics.reactions : 0;
  return metrics.likes + reactions + metrics.comments + metrics.views;
}

function postMetricSummary(post) {
  const metrics = postMetrics(post);
  const pieces = [];
  if (metrics.likes) pieces.push(`${metrics.likes} ${metrics.likes === 1 ? "curtida" : "curtidas"}`);
  if (metrics.reactions && !metrics.likes) pieces.push(`${metrics.reactions} ${metrics.reactions === 1 ? "reacao" : "reacoes"}`);
  if (metrics.comments) pieces.push(`${metrics.comments} ${metrics.comments === 1 ? "comentario" : "comentarios"}`);
  if (metrics.views) pieces.push(`${metrics.views} ${metrics.views === 1 ? "visualizacao" : "visualizacoes"}`);
  return pieces.join(", ");
}

function postTitle(post) {
  return post.name || post.title || "Post sem titulo";
}

function postBody(post) {
  return compactPlainText(post.body || post.content || post.description || "", 900);
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

function todayCirclePosts(circlePosts) {
  const start = startOfToday();
  return circlePosts.filter((post) => {
    const date = postDate(post);
    return date && date >= start;
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
      const metrics = postMetricSummary(post);
      if (metrics) pieces.push(`metricas=${metrics}`);
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
    return friendlyMissingData({
      task: "os destaques da semana",
      missing: sourceStatusMessage({ circlePosts, whatsappMessages }),
      nextStep: "se o Circle ja esta configurado, confira se a API esta retornando posts recentes e quais campos de data/engajamento vem no payload.",
    });
  }

  const result = await callOpenRouter([
    {
      role: "system",
      content:
        [
          "Liste destaques da semana da comunidade em portugues do Brasil.",
          "Use apenas as evidencias recebidas. Inclua posts, comentarios ou temas recorrentes quando houver. Nao invente.",
          "A resposta sera enviada no Slack: use *negrito do Slack*, bullets simples com -, frases curtas e espacos entre blocos.",
          "Nao use Markdown de WhatsApp ou GitHub: nao use **negrito**, ### titulos, bullets aninhados profundos ou espacos de indentacao.",
          "Quando citar numeros, explique o que eles representam: curtidas, comentarios, reacoes ou visualizacoes. Nunca escreva apenas 'engajamento 7'.",
          "Se houver uma soma aproximada, diga que e um sinal combinado e mostre os componentes disponiveis.",
        ].join(" "),
    },
    {
      role: "user",
      content: truncateText(`Circle:\n${circleContext || "Sem posts recentes."}\n\nWhatsApp:\n${whatsappContext || "Sem mensagens."}`, 5000),
    },
  ]);

  return result || friendlyMissingData({
    task: "os destaques da semana",
    missing: "o OpenRouter nao respondeu ou OPENROUTER_API_KEY nao esta configurada.",
    nextStep: "confira OPENROUTER_API_KEY no Railway e tente de novo.",
  });
}

// Retorna o post do Circle com mais curtidas no dia atual.
export async function getTopLikedPostToday({ circlePosts = [] } = {}) {
  const posts = todayCirclePosts(circlePosts)
    .map((post) => ({ post, likes: postLikes(post) }))
    .filter((item) => item.likes !== null)
    .sort((a, b) => b.likes - a.likes);

  if (posts.length === 0) {
    return friendlyMissingData({
      task: "o post mais curtido de hoje",
      missing:
        "nao encontrei posts do Circle criados hoje com campos de curtidas/reacoes como likes_count, like_count, likes ou reactions_count.",
      nextStep: "confira se o Circle esta retornando posts de hoje e se esses campos existem no payload.",
    });
  }

  const top = posts[0];
  const url = postUrl(top.post);
  const body = postBody(top.post);
  return [
    "*Post mais curtido de hoje*",
    `- *Titulo:* ${postTitle(top.post)}`,
    `- *Curtidas/reacoes:* ${top.likes}`,
    url ? `- *Link:* <${url}|Abrir post no Circle>` : "- *Link:* nao informado pela API",
    body ? `- *Resumo:* ${truncateText(body, 420)}` : "- *Resumo:* sem texto retornado pela API",
  ].join("\n");
}

// Gera alerta de moderacao consolidado para mensagens recentes da comunidade.
export async function getModerationAlerts({ whatsappMessages = [] } = {}) {
  const context = whatsappLines(whatsappMessages, 80);
  if (!context) {
    return friendlyMissingData({
      task: "alertas de moderacao",
      missing: "nao recebi mensagens recentes dos grupos autorizados do WhatsApp.",
      nextStep: "confira EVOLUTION_API_URL, EVOLUTION_API_KEY e ALLOWED_GROUPS; depois mande novas mensagens nos grupos permitidos.",
    });
  }

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

  return result || friendlyMissingData({
    task: "alertas de moderacao",
    missing: "o OpenRouter nao respondeu ou OPENROUTER_API_KEY nao esta configurada.",
    nextStep: "confira OPENROUTER_API_KEY no Railway e tente de novo.",
  });
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
  const newsText = news
    .map((item) => {
      const parts = [`- [${item.source}] ${item.title}`];
      if (item.developerImpact) parts.push(`impacto=${item.developerImpact}`);
      if (item.summary) parts.push(`contexto=${truncateText(item.summary, 180)}`);
      if (item.link) parts.push(`link=${item.link}`);
      return parts.join(" | ");
    })
    .join("\n");
  const communityContext = await summarizeHotTopics({ circlePosts, whatsappMessages });

  const result = await callOpenRouter([
    {
      role: "system",
      content:
        [
          "Proponha posts para uma comunidade de desenvolvedores que usam IA para programar.",
          "Use somente as noticias e o contexto da comunidade fornecidos.",
          "Cada ideia precisa ter: titulo, porque importa para devs, conexao com a comunidade, evidencia e formato recomendado.",
          "Se nao houver conexao real com a comunidade, marque como inspiracao geral e explique que falta validacao.",
          "Priorize releases de modelos, APIs, SDKs, agentes, coding tools, seguranca, benchmarks e mudancas de preco/limite.",
          "Gere no maximo 3 ideias curtas para Slack. Nao escreva texto longo.",
        ].join(" "),
    },
    {
      role: "user",
      content: truncateText(`Noticias tecnicas recentes:\n${newsText || "Sem noticias disponiveis."}\n\nContexto da comunidade:\n${communityContext}`, 5000),
    },
  ]);

  return result || friendlyMissingData({
    task: "ideias baseadas em noticias de IA",
    missing: "nao consegui acessar o OpenRouter ou o RSS de noticias.",
    nextStep: "confira OPENROUTER_API_KEY e AI_NEWS_RSS_URL no Railway.",
  });
}

// Responde conversa livre mantendo os limites de evidencias da comunidade.
export async function answerCommunityManagerChat({ prompt, circlePosts = [], whatsappMessages = [] } = {}) {
  const normalizedPrompt = normalizeIntentText(prompt);
  if (/\b(oi|ola|olá|e ai|e aí|bom dia|boa tarde|boa noite|tudo bem|td bem|como vai)\b/.test(normalizedPrompt)) {
    return [
      "Tudo bem por aqui. Posso conversar contigo ou executar tarefas da comunidade.",
      "Por exemplo: me pede os destaques da semana, um resumo diario, alertas de diretrizes ou ideias de posts.",
    ].join("\n");
  }

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

  return result || [
    "Consigo conversar contigo, mas agora nao consegui acessar o motor de IA.",
    "O provavel problema e OPENROUTER_API_KEY ausente ou OpenRouter indisponivel.",
    "Ainda posso responder comandos que nao dependem de IA quando houver dados do Circle/WhatsApp.",
  ].join("\n");
}

function normalizeIntentText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\boq\s+ue\b/g, "o que")
    .replace(/\boq\b/g, "o que")
    .replace(/\s+/g, " ")
    .trim();
}

// Classifica a intencao do pedido feito no Slack.
export function detectTaskIntent(text) {
  const prompt = normalizeIntentText(text);
  if (/\b(o que voce faz|o que voce sabe fazer|ajuda|help|comandos|capacidades|o que pode fazer|o que vc faz|como voce pode ajudar)\b/.test(prompt)) {
    return "capabilities";
  }
  if (/\b(post|publicacao|conteudo)\b/.test(prompt) && /\b(mais curtido|mais likes|maior curtida|top curtidas)\b/.test(prompt) && /\b(hoje|dia)\b/.test(prompt)) {
    return "top_liked_today";
  }
  if (/\b(oi|ola|e ai|bom dia|boa tarde|boa noite|tudo bem|td bem|como vai)\b/.test(prompt)) {
    return "chat";
  }
  if (/\b(destaque|destaques|semana|semanal|mais curtido|mais comentado|top post|topico quente)\b/.test(prompt)) {
    return "weekly_highlights";
  }
  if (/\b(diretriz|diretrizes|moderacao|quebrando|violacao|alerta|risco)\b/.test(prompt)) {
    return "moderation_alerts";
  }
  if (/\b(resumo diario|hoje|dia|diario|grupos?)\b/.test(prompt)) {
    return "daily_summary";
  }
  if (/\b(noticia|noticias|mundo da ia|novidade|tendencia)\b/.test(prompt)) {
    return "ai_news_posts";
  }
  if (/\b(conteudo|postar|posts?|pauta|pautas|ideia|ideias)\b/.test(prompt)) {
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
    "Eu sou seu agente de Community Manager. Posso bater papo contigo e tambem executar algumas tarefas quando voce pedir.",
    "",
    "O que eu consigo fazer hoje:",
    "- Pegar os destaques da semana: posts, comentarios ou temas com mais sinal de engajamento.",
    "- Avisar possiveis quebras de diretrizes nas mensagens recentes dos grupos autorizados.",
    "- Propor conteudos com base no que as pessoas estao falando.",
    "- Fazer resumo diario do que aconteceu nos grupos e no Circle.",
    "- Propor posts com base em noticias recentes do mundo da IA.",
    "- Conversar com voce de forma normal. Se faltar dado, eu te digo o que nao consegui acessar.",
    "",
    "Exemplos que voce pode mandar:",
    "- `quais foram os destaques da semana?`",
    "- `tem alguem quebrando as diretrizes?`",
    "- `me faz um resumo diario dos grupos`",
    "- `proponha posts com base no que as pessoas estao falando`",
    "- `sugira posts com noticias de IA`",
    "- `qual foi o post mais curtido do dia?`",
    "",
    "Pra eu responder bem as tarefas da comunidade, preciso destes acessos:",
    "- Circle configurado com `CIRCLE_API_TOKEN`.",
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
    case "top_liked_today":
      return getTopLikedPostToday({ circlePosts });
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
