import { fetchCirclePosts } from "./circle.js";
import { getAllowedGroups, getServiceStatus } from "./config.js";
import {
  extractInstance,
  extractMessageText,
  isAllowedGroup,
  sendWhatsAppMessage,
} from "./evolution.js";
import { moderateMessage } from "./moderation.js";
import { callOpenRouter } from "./openrouter.js";
import {
  formatSlackTaskDigest,
  isSlackChannelAllowed,
  isSlackTaskRequest,
  normalizeSlackPrompt,
  postSlackMessage,
  sendSlackMessage,
  slackReplyTarget,
  verifySlackRequest,
} from "./slack.js";
import { suggestPosts } from "./suggestions.js";
import { summarizeHotTopics } from "./summary.js";

// Processa uma mencao ou DM do Slack e publica a resposta no canal/thread original.
async function processSlackEvent(event, whatsappMessages) {
  if (!event || event.bot_id || event.subtype) return;
  if (event.type !== "app_mention" && !(event.type === "message" && event.channel_type === "im")) return;
  if (!isSlackChannelAllowed(event.channel)) return;

  const prompt = normalizeSlackPrompt(event.text);
  const circlePosts = await fetchCirclePosts();
  let text;

  if (isSlackTaskRequest(prompt)) {
    const summary = await summarizeHotTopics({ circlePosts, whatsappMessages });
    const suggestions = await suggestPosts({ circlePosts, whatsappMessages });
    text = formatSlackTaskDigest({ summary, suggestions });
  } else {
    text =
      (await callOpenRouter([
        {
          role: "system",
          content:
            [
              "Voce e um Community Manager conectado a Circle, WhatsApp e Slack.",
              "Responda em portugues, de forma objetiva e acionavel.",
              "Nao invente dados sobre a comunidade.",
              "Quando o usuario pedir tarefas, resumo, posts ou pautas, use apenas dados coletados do Circle e dos grupos autorizados do WhatsApp.",
              "Se nao houver dados suficientes, diga isso claramente e peca a integracao ou coleta necessaria.",
            ].join(" "),
        },
        {
          role: "user",
          content: prompt || "Como voce pode me ajudar hoje?",
        },
      ])) || "Nao consegui responder agora porque o OpenRouter nao esta configurado ou esta indisponivel.";
  }

  const replyTarget = slackReplyTarget(event);
  await postSlackMessage({
    channel: replyTarget.channel,
    text,
  });
}

function rememberSlackEvent(eventIds, eventId) {
  if (!eventId) return true;
  if (eventIds.has(eventId)) return false;

  eventIds.add(eventId);
  if (eventIds.size > 500) {
    eventIds.delete(eventIds.values().next().value);
  }

  return true;
}

// Registra endpoints do agente sem interferir nas rotas existentes do template Railway.
export function registerCommunityManagerRoutes(app, options = {}) {
  const adminAuth = options.adminAuth || ((_req, _res, next) => next());
  const whatsappMessages = [];
  const processedSlackEvents = new Set();

  app.post("/hooks/evolution", async (req, res) => {
    const payload = req.body || {};
    if (!isAllowedGroup(payload)) {
      return res.json({ ok: true, ignored: true, reason: "grupo nao autorizado" });
    }

    const text = extractMessageText(payload);
    if (text) whatsappMessages.push(text);
    if (whatsappMessages.length > 200) whatsappMessages.splice(0, whatsappMessages.length - 200);

    const moderation = await moderateMessage(text);
    return res.json({ ok: true, processed: true, moderation });
  });

  app.post("/hooks/evolution/send", async (req, res) => {
    const payload = req.body || {};
    const number = payload.number || payload.groupId || payload.remoteJid;
    if (!number || !isAllowedGroup({ groupId: number })) {
      return res.status(403).json({ ok: false, error: "grupo nao autorizado" });
    }

    const result = await sendWhatsAppMessage({
      instance: extractInstance(payload),
      number,
      text: payload.text || payload.message || "",
    });
    return res.status(result.ok ? 200 : 502).json(result);
  });

  app.post("/hooks/slack/events", (req, res) => {
    const valid = verifySlackRequest({
      rawBody: req.rawBody,
      timestamp: req.headers["x-slack-request-timestamp"],
      signature: req.headers["x-slack-signature"],
    });
    if (!valid) return res.status(401).json({ ok: false, error: "assinatura Slack invalida" });

    const payload = req.body || {};
    if (payload.type === "url_verification") {
      return res.json({ challenge: payload.challenge });
    }

    res.json({ ok: true });
    if (payload.type === "event_callback") {
      if (!rememberSlackEvent(processedSlackEvents, payload.event_id || payload.event?.client_msg_id)) return;
      processSlackEvent(payload.event, whatsappMessages).catch((err) => {
        console.warn(`[community-manager] Falha ao processar evento Slack: ${String(err)}`);
      });
    }
  });

  app.get("/community-manager/status", adminAuth, (_req, res) => {
    res.json({
      ok: true,
      services: getServiceStatus(),
      allowedGroups: Array.from(getAllowedGroups()),
      bufferedWhatsappMessages: whatsappMessages.length,
    });
  });

  app.get("/community-manager/circle/posts", adminAuth, async (req, res) => {
    const limit = Number.parseInt(String(req.query.limit || "20"), 10) || 20;
    const posts = await fetchCirclePosts(limit);
    res.json({ ok: true, posts });
  });

  app.get("/community-manager/summary", adminAuth, async (_req, res) => {
    const circlePosts = await fetchCirclePosts();
    const summary = await summarizeHotTopics({ circlePosts, whatsappMessages });
    res.json({ ok: true, summary });
  });

  app.get("/community-manager/suggest-posts", adminAuth, async (_req, res) => {
    const circlePosts = await fetchCirclePosts();
    const suggestions = await suggestPosts({ circlePosts, whatsappMessages });
    res.json({ ok: true, suggestions });
  });

  app.post("/community-manager/slack/tasks", adminAuth, async (_req, res) => {
    const circlePosts = await fetchCirclePosts();
    const summary = await summarizeHotTopics({ circlePosts, whatsappMessages });
    const suggestions = await suggestPosts({ circlePosts, whatsappMessages });
    const message = formatSlackTaskDigest({ summary, suggestions });
    const result = await sendSlackMessage(message);

    return res.status(result.ok ? 200 : 502).json({
      ...result,
      messagePreview: message,
    });
  });
}
