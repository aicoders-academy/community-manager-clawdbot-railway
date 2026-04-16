import { fetchCirclePosts } from "./circle.js";
import { getAllowedGroups, getServiceStatus } from "./config.js";
import {
  extractInstance,
  extractMessageText,
  isAllowedGroup,
  sendWhatsAppMessage,
} from "./evolution.js";
import { moderateMessage } from "./moderation.js";
import { suggestPosts } from "./suggestions.js";
import { summarizeHotTopics } from "./summary.js";

// Registra endpoints do agente sem interferir nas rotas existentes do template Railway.
export function registerCommunityManagerRoutes(app, options = {}) {
  const adminAuth = options.adminAuth || ((_req, _res, next) => next());
  const whatsappMessages = [];

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
}
