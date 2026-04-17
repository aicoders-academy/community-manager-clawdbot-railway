import crypto from "node:crypto";

import { serviceEnabled } from "./config.js";
import { truncateText } from "./text.js";

function slackSafeText(text) {
  const slackMessageLimit = Number.parseInt(process.env.SLACK_MESSAGE_LIMIT || "2800", 10);
  return truncateText(formatForSlack(text), Number.isFinite(slackMessageLimit) ? slackMessageLimit : 2800);
}

// Ajusta Markdown comum/WhatsApp para um formato que o Slack renderiza melhor.
export function formatForSlack(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/\*\*([^*\n][^*\n]*?)\*\*/g, "*$1*")
    .replace(/^\s{2,}[*-]\s+/gm, "- ")
    .replace(/^\s{2,}(\d+)\.\s+/gm, "$1. ")
    .replace(/^(\d+\.)\s{2,}/gm, "$1 ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Envia uma mensagem simples para Slack usando Incoming Webhook.
export async function sendSlackMessage(text) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!serviceEnabled("Slack", [webhookUrl])) return { ok: false, disabled: true };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: slackSafeText(text),
        unfurl_links: false,
        unfurl_media: false,
      }),
    });

    const body = await response.text();
    if (!response.ok) {
      console.warn(`[community-manager] Slack retornou HTTP ${response.status}: ${body}`);
      return { ok: false, status: response.status, body };
    }

    return { ok: true, body };
  } catch (err) {
    console.warn(`[community-manager] Falha ao enviar Slack: ${String(err)}`);
    return { ok: false, error: String(err) };
  }
}

// Formata o resumo operacional do agente para envio no Slack.
export function formatSlackTaskDigest({ summary, suggestions }) {
  return [
    "*Community Manager - tarefas sugeridas*",
    "",
    "*Resumo dos temas quentes*",
    summary || "Resumo indisponivel.",
    "",
    "*Sugestoes de posts*",
    suggestions || "Sugestoes indisponiveis.",
  ].join("\n");
}

// Verifica se a requisicao veio do Slack usando o Signing Secret.
export function verifySlackRequest({ rawBody, timestamp, signature }) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!serviceEnabled("Slack Events", [signingSecret])) return false;
  if (!rawBody || !timestamp || !signature) return false;

  const timestampNumber = Number.parseInt(String(timestamp), 10);
  if (!Number.isFinite(timestampNumber)) return false;
  if (Math.abs(Date.now() / 1000 - timestampNumber) > 60 * 5) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${crypto.createHmac("sha256", signingSecret).update(baseString).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(String(signature), "utf8");

  if (expectedBuffer.length !== signatureBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

// Confere se o canal do evento esta liberado em SLACK_ALLOWED_CHANNELS quando essa lista existir.
export function isSlackChannelAllowed(channelId) {
  const allowed = String(process.env.SLACK_ALLOWED_CHANNELS || "")
    .split(",")
    .map((channel) => channel.trim())
    .filter(Boolean);

  if (allowed.length === 0) return true;
  return allowed.includes(channelId);
}

// Remove mencoes ao bot e espacos extras para produzir o prompt do usuario.
export function normalizeSlackPrompt(text) {
  return String(text || "")
    .replace(/<@[A-Z0-9]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Detecta pedidos operacionais que devem gerar o digest de tarefas.
export function isSlackTaskRequest(text) {
  return /\b(tarefa|tarefas|resumo|digest|posts?|pauta|pautas)\b/i.test(String(text || ""));
}

// Define onde responder para evitar duplicidade entre canal e thread.
export function slackReplyTarget(event = {}) {
  return {
    channel: event.channel,
    textMode: event.channel_type === "im" ? "dm" : "channel",
  };
}

// Envia uma resposta em canal/thread usando Slack Web API.
export async function postSlackMessage({ channel, text, threadTs }) {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!serviceEnabled("Slack Web API", [botToken])) return { ok: false, disabled: true };

  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify({
        channel,
        text: slackSafeText(text),
        unfurl_links: false,
        unfurl_media: false,
        ...(threadTs ? { thread_ts: threadTs } : {}),
      }),
    });

    const body = await response.json();
    if (!response.ok || !body.ok) {
      console.warn(`[community-manager] Slack chat.postMessage falhou: ${JSON.stringify(body)}`);
      return { ok: false, status: response.status, body };
    }

    return { ok: true, body };
  } catch (err) {
    console.warn(`[community-manager] Falha ao responder no Slack: ${String(err)}`);
    return { ok: false, error: String(err) };
  }
}
