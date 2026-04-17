import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  formatForSlack,
  formatSlackTaskDigest,
  isSlackChannelAllowed,
  isSlackTaskRequest,
  normalizeSlackPrompt,
  slackReplyTarget,
  verifySlackRequest,
} from "../src/community-manager.js";

test("formatSlackTaskDigest includes summary and suggestions", () => {
  const message = formatSlackTaskDigest({
    summary: "Comunidade quer ajuda com agentes.",
    suggestions: "Post sobre automacoes com IA.",
  });

  assert.match(message, /Community Manager - tarefas sugeridas/);
  assert.match(message, /Comunidade quer ajuda com agentes/);
  assert.match(message, /Post sobre automacoes com IA/);
});

test("formatForSlack converts common Markdown to Slack-readable text", () => {
  const message = formatForSlack("### Destaques\n\n1.  **Claude Code**\n    *   **Tópico:** Routines\n\n");

  assert.match(message, /\*Destaques\*/);
  assert.match(message, /1\. \*Claude Code\*/);
  assert.match(message, /- \*Tópico:\* Routines/);
  assert.doesNotMatch(message, /\*\*/);
  assert.doesNotMatch(message, /###/);
});

test("verifySlackRequest validates Slack signature", () => {
  const previousSecret = process.env.SLACK_SIGNING_SECRET;
  process.env.SLACK_SIGNING_SECRET = "test-secret";

  try {
    const rawBody = JSON.stringify({ type: "event_callback" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `v0=${crypto
      .createHmac("sha256", process.env.SLACK_SIGNING_SECRET)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest("hex")}`;

    assert.equal(verifySlackRequest({ rawBody, timestamp, signature }), true);
    assert.equal(verifySlackRequest({ rawBody, timestamp, signature: "v0=bad" }), false);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.SLACK_SIGNING_SECRET;
    } else {
      process.env.SLACK_SIGNING_SECRET = previousSecret;
    }
  }
});

test("Slack helpers normalize prompts and channel allowlist", () => {
  const previousAllowedChannels = process.env.SLACK_ALLOWED_CHANNELS;
  process.env.SLACK_ALLOWED_CHANNELS = "C123,C456";

  try {
    assert.equal(normalizeSlackPrompt("<@U123> me mande as tarefas"), "me mande as tarefas");
    assert.equal(isSlackTaskRequest("me mande as tarefas"), true);
    assert.equal(isSlackChannelAllowed("C123"), true);
    assert.equal(isSlackChannelAllowed("C789"), false);
    assert.deepEqual(slackReplyTarget({ channel: "C123" }), { channel: "C123", textMode: "channel" });
    assert.deepEqual(slackReplyTarget({ channel: "D123", channel_type: "im" }), { channel: "D123", textMode: "dm" });
  } finally {
    if (previousAllowedChannels === undefined) {
      delete process.env.SLACK_ALLOWED_CHANNELS;
    } else {
      process.env.SLACK_ALLOWED_CHANNELS = previousAllowedChannels;
    }
  }
});
