import assert from "node:assert/strict";
import test from "node:test";

import { fetchAiNews, getAiNewsSources } from "../src/community-manager.js";

test("getAiNewsSources includes curated developer AI sources", () => {
  const names = getAiNewsSources().map((source) => source.name);

  assert.ok(getAiNewsSources().length >= 20);
  assert.ok(names.includes("OpenAI News"));
  assert.ok(names.includes("Anthropic News"));
  assert.ok(names.includes("OpenRouter Models"));
  assert.ok(names.includes("Hugging Face Blog"));
  assert.ok(names.includes("AWS Machine Learning Blog"));
  assert.ok(names.includes("Microsoft Semantic Kernel"));
  assert.ok(names.includes("Ollama Blog"));
});

test("fetchAiNews aggregates RSS and Anthropic newsroom sources with developer impact", async () => {
  const previousFetch = globalThis.fetch;
  const responses = new Map([
    [
      "https://example.com/rss.xml",
      `<?xml version="1.0"?><rss><channel><item><title>New coding model API</title><link>https://example.com/model</link><description>SDK and tool calling improvements for developers.</description><pubDate>Fri, 17 Apr 2026 12:00:00 GMT</pubDate></item><item><title>Office expansion</title><link>https://example.com/office</link><description>Company office news.</description></item></channel></rss>`,
    ],
    [
      "https://example.com/anthropic",
      `<a href="/news/claude-opus-4-7">Apr 16, 2026 Product Introducing Claude Opus 4.7</a>`,
    ],
  ]);

  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    async text() {
      return responses.get(String(url)) || "";
    },
  });

  try {
    const news = await fetchAiNews({
      sources: [
        { id: "rss", name: "RSS", type: "rss", url: "https://example.com/rss.xml", priority: 1, tags: ["api"] },
        { id: "anthropic", name: "Anthropic News", type: "anthropic-html", url: "https://example.com/anthropic", priority: 1, tags: ["claude"] },
      ],
    });

    assert.equal(news.length, 2);
    assert.match(news[0].title, /New coding model API/);
    assert.match(news[0].developerImpact, /desenvolvimento|modelo|devs/i);
    assert.ok(news.some((item) => item.title === "Introducing Claude Opus 4.7"));
    assert.equal(news.some((item) => /Office expansion/.test(item.title)), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
