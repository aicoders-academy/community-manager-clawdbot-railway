import assert from "node:assert/strict";
import test from "node:test";

import { suggestPosts, summarizeHotTopics } from "../src/community-manager.js";

test("summarizeHotTopics does not invent topics without community context", async () => {
  const summary = await summarizeHotTopics({ circlePosts: [], whatsappMessages: [] });

  assert.match(summary, /nao tenho dados suficientes/i);
  assert.match(summary, /Circle/i);
  assert.match(summary, /WhatsApp/i);
});

test("summarizeHotTopics explains that missing WhatsApp is not blocking Circle-only mode", async () => {
  const previousCircleToken = process.env.CIRCLE_API_TOKEN;
  const previousEvolutionUrl = process.env.EVOLUTION_API_URL;
  const previousEvolutionKey = process.env.EVOLUTION_API_KEY;

  process.env.CIRCLE_API_TOKEN = "circle-token";
  delete process.env.COMMUNITY_ID;
  delete process.env.EVOLUTION_API_URL;
  delete process.env.EVOLUTION_API_KEY;

  try {
    const summary = await summarizeHotTopics({ circlePosts: [], whatsappMessages: [] });
    assert.match(summary, /Circle esta configurado/i);
    assert.match(summary, /WhatsApp nao esta configurado/i);
    assert.match(summary, /eu uso a outra quando ela tiver dados/i);
  } finally {
    if (previousCircleToken === undefined) delete process.env.CIRCLE_API_TOKEN;
    else process.env.CIRCLE_API_TOKEN = previousCircleToken;

    if (previousEvolutionUrl === undefined) delete process.env.EVOLUTION_API_URL;
    else process.env.EVOLUTION_API_URL = previousEvolutionUrl;

    if (previousEvolutionKey === undefined) delete process.env.EVOLUTION_API_KEY;
    else process.env.EVOLUTION_API_KEY = previousEvolutionKey;
  }
});

test("suggestPosts does not invent ideas without community pains", async () => {
  const suggestions = await suggestPosts({ circlePosts: [], whatsappMessages: [] });

  assert.match(suggestions, /nao tenho dores reais/i);
  assert.match(suggestions, /evitar sugestoes genericas/i);
});
