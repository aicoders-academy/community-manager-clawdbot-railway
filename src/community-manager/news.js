const NEWS_RSS_URL =
  process.env.AI_NEWS_RSS_URL || "https://news.google.com/rss/search?q=artificial+intelligence";

// Faz um parse simples dos itens RSS sem adicionar dependencia extra ao runtime Node.
function parseRssItems(xml) {
  const matches = Array.from(String(xml || "").matchAll(/<item>([\s\S]*?)<\/item>/g));
  return matches.slice(0, 10).map((match) => {
    const item = match[1];
    const title = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/);
    const link = item.match(/<link>([\s\S]*?)<\/link>/);
    return {
      title: (title?.[1] || title?.[2] || "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim(),
      link: (link?.[1] || "").trim(),
    };
  });
}

// Busca noticias basicas de IA por RSS para alimentar sugestoes de conteudo.
export async function fetchAiNews() {
  try {
    const response = await fetch(NEWS_RSS_URL, {
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
    });

    if (!response.ok) {
      console.warn(`[community-manager] RSS de noticias retornou HTTP ${response.status}.`);
      return [];
    }

    return parseRssItems(await response.text());
  } catch (err) {
    console.warn(`[community-manager] Falha ao buscar noticias de IA: ${String(err)}`);
    return [];
  }
}
