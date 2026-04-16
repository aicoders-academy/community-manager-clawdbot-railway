import { getAllowedGroups, serviceEnabled } from "./config.js";

// Extrai o identificador do grupo a partir dos formatos mais comuns de webhook da Evolution API.
export function extractGroupId(payload = {}) {
  return (
    payload?.data?.key?.remoteJid ||
    payload?.key?.remoteJid ||
    payload?.remoteJid ||
    payload?.groupId ||
    payload?.chatId ||
    ""
  );
}

// Valida se a mensagem pertence a um grupo autorizado em ALLOWED_GROUPS.
export function isAllowedGroup(payload = {}) {
  const allowedGroups = getAllowedGroups();
  if (allowedGroups.size === 0) {
    console.warn("[community-manager] ALLOWED_GROUPS vazio: mensagens WhatsApp serao ignoradas.");
    return false;
  }

  const groupId = extractGroupId(payload);
  return Boolean(groupId && allowedGroups.has(groupId));
}

// Extrai o texto da mensagem aceitando os formatos mais comuns da Evolution API.
export function extractMessageText(payload = {}) {
  return (
    payload?.data?.message?.conversation ||
    payload?.data?.message?.extendedTextMessage?.text ||
    payload?.message?.conversation ||
    payload?.text ||
    payload?.body ||
    ""
  );
}

// Resolve a instancia Evolution enviada no webhook ou configurada no ambiente.
export function extractInstance(payload = {}) {
  return payload?.instance || payload?.data?.instance || process.env.EVOLUTION_INSTANCE || "";
}

// Envia mensagem para um grupo ou contato via Evolution API, mantendo falhas isoladas da aplicacao.
export async function sendWhatsAppMessage({ instance, number, text }) {
  const apiUrl = process.env.EVOLUTION_API_URL || process.env.WHATSAPP_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY || process.env.WHATSAPP_API_KEY;
  if (!serviceEnabled("WhatsApp/Evolution", [apiUrl, apiKey])) return { ok: false, disabled: true };

  try {
    const normalizedUrl = String(apiUrl).replace(/\/+$/, "");
    const targetInstance = instance || process.env.EVOLUTION_INSTANCE || "default";
    const response = await fetch(`${normalizedUrl}/message/sendText/${encodeURIComponent(targetInstance)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number,
        text,
      }),
    });

    const body = await response.text();
    if (!response.ok) {
      console.warn(`[community-manager] Evolution API retornou HTTP ${response.status}: ${body}`);
      return { ok: false, status: response.status, body };
    }

    return { ok: true, body };
  } catch (err) {
    console.warn(`[community-manager] Falha ao enviar WhatsApp: ${String(err)}`);
    return { ok: false, error: String(err) };
  }
}
