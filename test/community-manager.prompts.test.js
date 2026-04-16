import assert from "node:assert/strict";
import test from "node:test";

import { suggestPosts, summarizeHotTopics } from "../src/community-manager.js";

test("summarizeHotTopics does not invent topics without community context", async () => {
  const summary = await summarizeHotTopics({ circlePosts: [], whatsappMessages: [] });

  assert.match(summary, /nao tenho dados suficientes/i);
  assert.match(summary, /Circle/i);
  assert.match(summary, /WhatsApp/i);
});

test("suggestPosts does not invent ideas without community pains", async () => {
  const suggestions = await suggestPosts({ circlePosts: [], whatsappMessages: [] });

  assert.match(suggestions, /nao tenho dores reais/i);
  assert.match(suggestions, /evitar sugestoes genericas/i);
});
