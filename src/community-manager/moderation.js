import { callOpenRouter } from "./openrouter.js";
import { truncateText } from "./text.js";

// Analisa uma mensagem para detectar possiveis quebras de diretrizes da comunidade.
export async function moderateMessage(text) {
  if (!text) return { status: "ignored", reason: "mensagem vazia" };

  const result = await callOpenRouter([
    {
      role: "system",
      content:
        "Voce e um moderador de comunidade. Responda em JSON curto com: risco (baixo, medio, alto), motivo e acao_sugerida.",
    },
    {
      role: "user",
      content: `Analise esta mensagem:\n\n${truncateText(text)}`,
    },
  ]);

  return result || { status: "disabled", reason: "OpenRouter nao configurado ou indisponivel" };
}
