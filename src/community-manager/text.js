// Limita textos enviados para IA para evitar payloads grandes demais.
export function truncateText(value, maxLength = 1800) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
