import { serviceEnabled } from "./config.js";

// Busca posts recentes do Circle usando CIRCLE_API_TOKEN e COMMUNITY_ID quando configurados.
export async function fetchCirclePosts(limit = 20) {
  const token = process.env.CIRCLE_API_TOKEN;
  const communityId = process.env.COMMUNITY_ID;
  if (!serviceEnabled("Circle", [token, communityId])) return [];

  try {
    const circleBaseUrl = process.env.CIRCLE_API_BASE_URL || "https://app.circle.so/api";
    const url = new URL(`${String(circleBaseUrl).replace(/\/+$/, "")}/v1/posts`);
    url.searchParams.set("community_id", communityId);
    url.searchParams.set("per_page", String(limit));
    url.searchParams.set("include_comments", "true");

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.warn(`[community-manager] Circle retornou HTTP ${response.status}.`);
      return [];
    }

    const json = await response.json();
    return Array.isArray(json?.records) ? json.records : Array.isArray(json) ? json : json?.posts || [];
  } catch (err) {
    console.warn(`[community-manager] Falha ao buscar posts do Circle: ${String(err)}`);
    return [];
  }
}
