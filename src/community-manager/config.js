// Normaliza a lista de grupos autorizados definida em ALLOWED_GROUPS.
export function getAllowedGroups() {
  return new Set(
    String(process.env.ALLOWED_GROUPS || "")
      .split(",")
      .map((group) => group.trim())
      .filter(Boolean),
  );
}

// Informa quais integracoes estao habilitadas sem expor segredos.
export function getServiceStatus() {
  return {
    circle: Boolean(process.env.CIRCLE_API_TOKEN && process.env.COMMUNITY_ID),
    whatsapp: Boolean(
      (process.env.EVOLUTION_API_URL || process.env.WHATSAPP_API_URL) &&
        (process.env.EVOLUTION_API_KEY || process.env.WHATSAPP_API_KEY),
    ),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY),
  };
}

// Verifica se as variaveis obrigatorias existem e desativa a integracao quando faltarem.
export function serviceEnabled(name, required) {
  const missing = required.filter((value) => !value);
  if (missing.length > 0) {
    console.warn(`[community-manager] ${name} desativado: variaveis obrigatorias ausentes.`);
    return false;
  }
  return true;
}
