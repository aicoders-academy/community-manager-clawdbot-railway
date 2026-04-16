import assert from "node:assert/strict";
import test from "node:test";

import {
  detectTaskIntent,
  describeCapabilities,
  getDailySummary,
  getModerationAlerts,
  getWeeklyHighlights,
} from "../src/community-manager.js";

test("detectTaskIntent maps Slack prompts to operational tasks", () => {
  assert.equal(detectTaskIntent("o que voce sabe fazer?"), "capabilities");
  assert.equal(detectTaskIntent("quais foram os destaques da semana?"), "weekly_highlights");
  assert.equal(detectTaskIntent("tem alguem quebrando as diretrizes?"), "moderation_alerts");
  assert.equal(detectTaskIntent("me faz um resumo diario dos grupos"), "daily_summary");
  assert.equal(detectTaskIntent("proponha posts baseado no que falaram"), "community_post_ideas");
  assert.equal(detectTaskIntent("posts com noticias do mundo da IA"), "ai_news_posts");
  assert.equal(detectTaskIntent("oi, tudo bem?"), "chat");
});

test("describeCapabilities explains supported tasks", () => {
  const capabilities = describeCapabilities();

  assert.match(capabilities, /destaques da semana/i);
  assert.match(capabilities, /diretrizes/i);
  assert.match(capabilities, /resumo diario/i);
  assert.match(capabilities, /noticias recentes/i);
  assert.match(capabilities, /OpenRouter/i);
});

test("task functions report missing context instead of inventing", async () => {
  assert.match(await getWeeklyHighlights({ circlePosts: [], whatsappMessages: [] }), /dados suficientes/i);
  assert.match(await getModerationAlerts({ whatsappMessages: [] }), /Nenhuma mensagem recente/i);
  assert.match(await getDailySummary({ circlePosts: [], whatsappMessages: [] }), /dados suficientes/i);
});
