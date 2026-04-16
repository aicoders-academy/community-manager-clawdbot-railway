import assert from "node:assert/strict";
import test from "node:test";

import {
  detectTaskIntent,
  answerCommunityManagerChat,
  describeCapabilities,
  getDailySummary,
  getModerationAlerts,
  getTopLikedPostToday,
  getWeeklyHighlights,
} from "../src/community-manager.js";

test("detectTaskIntent maps Slack prompts to operational tasks", () => {
  assert.equal(detectTaskIntent("oq ue você faz?"), "capabilities");
  assert.equal(detectTaskIntent("o que voce sabe fazer?"), "capabilities");
  assert.equal(detectTaskIntent("quero saber qual o post mais curtido de hoje"), "top_liked_today");
  assert.equal(detectTaskIntent("quais foram os destaques da semana?"), "weekly_highlights");
  assert.equal(detectTaskIntent("tem alguem quebrando as diretrizes?"), "moderation_alerts");
  assert.equal(detectTaskIntent("me faz um resumo diario dos grupos"), "daily_summary");
  assert.equal(detectTaskIntent("proponha posts baseado no que falaram"), "community_post_ideas");
  assert.equal(detectTaskIntent("posts com noticias do mundo da IA"), "ai_news_posts");
  assert.equal(detectTaskIntent("oi, tudo bem?"), "chat");
});

test("describeCapabilities explains supported tasks", () => {
  const capabilities = describeCapabilities();

  assert.match(capabilities, /bater papo/i);
  assert.match(capabilities, /destaques da semana/i);
  assert.match(capabilities, /diretrizes/i);
  assert.match(capabilities, /resumo diario/i);
  assert.match(capabilities, /noticias recentes/i);
  assert.match(capabilities, /OpenRouter/i);
});

test("task functions report missing context instead of inventing", async () => {
  assert.match(await getWeeklyHighlights({ circlePosts: [], whatsappMessages: [] }), /O que faltou/i);
  assert.match(await getTopLikedPostToday({ circlePosts: [] }), /o post mais curtido de hoje/i);
  assert.match(await getModerationAlerts({ whatsappMessages: [] }), /nao recebi mensagens recentes/i);
  assert.match(await getDailySummary({ circlePosts: [], whatsappMessages: [] }), /dados suficientes/i);
});

test("answerCommunityManagerChat answers casual chat without requiring community data", async () => {
  const answer = await answerCommunityManagerChat({ prompt: "tudo bem?", circlePosts: [], whatsappMessages: [] });

  assert.match(answer, /Tudo bem/i);
  assert.match(answer, /conversar/i);
});

test("getTopLikedPostToday returns the most liked Circle post from today", async () => {
  const today = new Date().toISOString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const result = await getTopLikedPostToday({
    circlePosts: [
      { title: "Ontem", created_at: yesterday, likes_count: 100 },
      { title: "Hoje menor", created_at: today, likes_count: 5 },
      { title: "Hoje maior", created_at: today, likes_count: 12, url: "https://example.com/post" },
    ],
  });

  assert.match(result, /Hoje maior/);
  assert.match(result, /12/);
  assert.doesNotMatch(result, /Ontem/);
});
