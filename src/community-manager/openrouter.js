import { serviceEnabled } from "./config.js";

const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

// Chama o OpenRouter em formato compativel com Chat Completions para tarefas de IA do agente.
export async function callOpenRouter(messages, options = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!serviceEnabled("OpenRouter", [apiKey])) return null;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.PUBLIC_APP_URL || "https://railway.app",
        "X-Title": "Community Manager Agent",
      },
      body: JSON.stringify({
        model: options.model || DEFAULT_OPENROUTER_MODEL,
        temperature: options.temperature ?? 0.2,
        messages,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn(`[community-manager] OpenRouter retornou HTTP ${response.status}: ${body}`);
      return null;
    }

    const json = await response.json();
    return json?.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.warn(`[community-manager] Falha ao chamar OpenRouter: ${String(err)}`);
    return null;
  }
}
