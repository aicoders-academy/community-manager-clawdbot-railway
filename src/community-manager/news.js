import fs from "node:fs";

import { compactPlainText, decodeHtmlEntities, stripHtml, truncateText } from "./text.js";

const DEFAULT_SOURCES_FILE = new URL("./news-sources.json", import.meta.url);
let cachedDefaultSources = null;

function loadDefaultSources() {
  if (!cachedDefaultSources) {
    const sourcesFile = String(process.env.AI_NEWS_SOURCES_FILE || "").trim() || DEFAULT_SOURCES_FILE;
    cachedDefaultSources = JSON.parse(fs.readFileSync(sourcesFile, "utf8"));
  }

  return cachedDefaultSources;
}

const STRONG_AI_KEYWORDS = [
  "agent",
  "agents",
  "anthropic",
  "artificial intelligence",
  "claude",
  "codex",
  "coding",
  "copilot",
  "gemini",
  "gpt",
  "hugging face",
  "inference",
  "llm",
  "mcp",
  "openai",
  "openrouter",
  "rag",
];

const DEVELOPER_KEYWORDS = [
  "api",
  "benchmark",
  "context",
  "developer",
  "eval",
  "function calling",
  "github",
  "prompt",
  "release",
  "routing",
  "sdk",
  "security",
  "tool",
  "vulnerability",
];

const LOW_SIGNAL_KEYWORDS = [
  "acquires",
  "appoints",
  "board",
  "funding",
  "government",
  "mou",
  "office",
  "partnership",
];

function customRssSources() {
  const configured = process.env.AI_NEWS_RSS_URLS || process.env.AI_NEWS_RSS_URL || "";
  return String(configured)
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url, index) => ({
      id: `custom-${index}`,
      name: "Configured AI feed",
      type: "rss",
      url,
      priority: 110 - index,
      tags: ["configured"],
    }));
}

export function getAiNewsSources() {
  const custom = customRssSources();
  const defaults = loadDefaultSources();
  return custom.length > 0 ? [...custom, ...defaults] : defaults;
}

function textBetween(item, tag) {
  const match = item.match(new RegExp(`<${tag}\\b[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decodeHtmlEntities(stripHtml(match?.[1] || match?.[2] || ""));
}

function attrValue(item, attr) {
  const match = item.match(new RegExp(`${attr}=["']([^"']+)["']`, "i"));
  return decodeHtmlEntities(match?.[1] || "");
}

function parseRssItems(xml) {
  return Array.from(String(xml || "").matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)).map((match) => {
    const item = match[1];
    return {
      title: textBetween(item, "title"),
      link: textBetween(item, "link"),
      summary: textBetween(item, "description") || textBetween(item, "content:encoded"),
      publishedAt: textBetween(item, "pubDate") || textBetween(item, "dc:date"),
    };
  });
}

function parseAtomItems(xml) {
  return Array.from(String(xml || "").matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)).map((match) => {
    const item = match[1];
    const linkTag = item.match(/<link\b[^>]*>/i)?.[0] || "";
    return {
      title: textBetween(item, "title"),
      link: attrValue(linkTag, "href"),
      summary: textBetween(item, "summary") || textBetween(item, "content"),
      publishedAt: textBetween(item, "updated") || textBetween(item, "published"),
    };
  });
}

function cleanAnthropicTitle(text) {
  const cleaned = stripHtml(text).replace(/\s+/g, " ").trim();
  const normalized = cleaned
    .replace(/^(Product|Announcements|Research|Policy|Company|Safety)\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s+/, "")
    .replace(/^\s*[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s+/, "")
    .replace(/^(Product|Announcements|Research|Policy|Company|Safety)\s+/, "")
    .trim();
  if (normalized && normalized !== cleaned) return normalized;

  const leadingTitle = cleaned.match(/^(.+?)\s+(Product|Announcements|Research|Policy|Company|Safety)\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\b/);
  if (leadingTitle?.[1]) return leadingTitle[1].trim();

  return normalized || cleaned;
}

function parseAnthropicHtml(html) {
  const byLink = new Map();
  const matches = String(html || "").matchAll(/href="(\/news\/[a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/gi);

  for (const match of matches) {
    const link = `https://www.anthropic.com${match[1]}`;
    const title = cleanAnthropicTitle(match[2]);
    if (!title || title.length < 8) continue;
    const publishedAt = stripHtml(match[2]).match(/\b[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\b/)?.[0] || "";

    const item = {
      title,
      link,
      summary: "",
      publishedAt,
    };
    const previous = byLink.get(link);
    if (!previous || item.title.length < previous.title.length) byLink.set(link, item);
  }

  return Array.from(byLink.values());
}

function developerScore(item, source) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const title = String(item.title || "").toLowerCase();
  const strong = STRONG_AI_KEYWORDS.filter((keyword) => text.includes(keyword)).length;
  const strongTitle = STRONG_AI_KEYWORDS.filter((keyword) => title.includes(keyword)).length;
  const positive = DEVELOPER_KEYWORDS.filter((keyword) => text.includes(keyword)).length;
  const negative = LOW_SIGNAL_KEYWORDS.filter((keyword) => text.includes(keyword)).length;
  const trustedModelSource = ["openai-news", "anthropic-news", "openrouter-models", "huggingface-blog"].includes(source.id);

  if (source.id === "infoq" && /^presentation:/.test(title) && strongTitle === 0) return 0;
  if (!trustedModelSource && strong === 0) return 0;
  if (trustedModelSource && /\b(model|models|tokens|context|pricing|provider)\b/.test(text)) return strong * 3 + positive + 2 - negative * 2;

  return strong * 3 + positive - negative * 2;
}

function developerImpact(item, source) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  if (/\b(security|vulnerability|supply chain|compromise|exploit)\b/.test(text)) return "risco/seguranca para stacks de desenvolvimento";
  if (/\b(codex|copilot|coding|developer|sdk|api|tool calling|mcp)\b/.test(text)) return "impacto direto em fluxo de desenvolvimento";
  if (/\b(ai|model|claude|gpt|llm|inference|benchmark|context|gemini|hugging face)\b/.test(text)) return "nova capacidade ou tradeoff de IA para avaliar";
  if (source.id === "openrouter-models") return "novo modelo disponivel para testar via OpenRouter";
  return "sinal tecnico relevante para devs";
}

function normalizeItem(item, source) {
  return {
    title: truncateText(stripHtml(item.title), 180),
    link: String(item.link || "").trim(),
    summary: compactPlainText(item.summary, 280),
    publishedAt: item.publishedAt || "",
    source: source.name,
    sourceId: source.id,
    tags: source.tags || [],
    priority: source.priority || 0,
    developerImpact: developerImpact(item, source),
  };
}

function dedupeItems(items) {
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    const key = (item.link || item.title).toLowerCase().replace(/\?.*$/, "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function itemTime(item) {
  const date = item.publishedAt ? new Date(item.publishedAt) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

async function fetchNewsSource(source) {
  const timeoutMs = Number.parseInt(process.env.AI_NEWS_SOURCE_TIMEOUT_MS || "8000", 10);
  const response = await fetch(source.url, {
    headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html" },
    signal: AbortSignal.timeout(Number.isFinite(timeoutMs) ? timeoutMs : 8000),
  });

  if (!response.ok) {
    console.warn(`[community-manager] Fonte de noticias ${source.name} retornou HTTP ${response.status}.`);
    return [];
  }

  const body = await response.text();
  const parsed =
    source.type === "anthropic-html"
      ? parseAnthropicHtml(body)
      : source.type === "atom"
        ? parseAtomItems(body)
        : [...parseRssItems(body), ...parseAtomItems(body)];

  return parsed
    .map((item) => normalizeItem(item, source))
    .filter((item) => item.title && item.link)
    .filter((item) => developerScore(item, source) > 0)
    .slice(0, 6);
}

// Busca noticias e releases relevantes para devs a partir de uma lista curada de fontes.
export async function fetchAiNews(options = {}) {
  const sources = options.sources || getAiNewsSources();
  const perSourceResults = await Promise.all(
    sources.map(async (source) => {
      try {
        return await fetchNewsSource(source);
      } catch (err) {
        console.warn(`[community-manager] Falha ao buscar ${source.name}: ${String(err)}`);
        return [];
      }
    }),
  );

  return dedupeItems(perSourceResults.flat())
    .sort((a, b) => itemTime(b) - itemTime(a) || b.priority - a.priority)
    .slice(0, options.limit || 12);
}
