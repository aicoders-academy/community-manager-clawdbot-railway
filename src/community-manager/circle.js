import { serviceEnabled } from "./config.js";

let circleAdminV2PostsUnavailable = false;
let loggedCircleFallback = false;

function parseCircleRecords(json) {
  if (Array.isArray(json?.records)) return json.records;
  if (Array.isArray(json?.posts)) return json.posts;
  if (Array.isArray(json)) return json;
  return [];
}

function normalizeCirclePost(post) {
  const body = typeof post.body === "object" && post.body !== null ? post.body.body : post.body;

  return {
    ...post,
    body,
    created_at: post.created_at || post.published_at || post.body?.created_at,
    updated_at: post.updated_at || post.body?.updated_at,
  };
}

function circleSpaceIds() {
  return String(process.env.CIRCLE_SPACE_IDS || process.env.CIRCLE_SPACE_ID || process.env.SPACE_ID || "")
    .split(",")
    .map((spaceId) => spaceId.trim())
    .filter(Boolean);
}

function circleBaseUrl() {
  const circleBaseUrl = process.env.CIRCLE_API_BASE_URL || "https://app.circle.so/api";
  return String(circleBaseUrl).replace(/\/+$/, "");
}

function circlePostsUrl({ limit, page, spaceId }) {
  const url = new URL(`${circleBaseUrl()}/admin/v2/posts`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(limit));
  if (spaceId) url.searchParams.set("space_id", spaceId);
  return { url, mode: "admin-v2-posts" };
}

function circleCommentsPostsUrl({ limit, page, spaceId }) {
  const url = new URL(`${circleBaseUrl()}/admin/v2/comments/posts`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(limit));
  if (spaceId) url.searchParams.set("space_id", spaceId);
  url.searchParams.set("status", "published");
  return url;
}

function extractSpaceIds(json) {
  const records = Array.isArray(json?.records) ? json.records : Array.isArray(json?.spaces) ? json.spaces : Array.isArray(json) ? json : [];
  return records
    .map((space) => space.id || space.space_id)
    .map((spaceId) => String(spaceId || "").trim())
    .filter(Boolean);
}

async function fetchCircleSpaceIds(token) {
  const endpoints = [
    `${circleBaseUrl()}/admin/v2/spaces`,
    `${circleBaseUrl()}/headless/admin/v1/spaces`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.warn(`[community-manager] Circle retornou HTTP ${response.status} ao listar espacos em ${new URL(endpoint).pathname}.`);
        continue;
      }

      const spaceIds = extractSpaceIds(await response.json());
      if (spaceIds.length > 0) return spaceIds;
    } catch (err) {
      console.warn(`[community-manager] Falha ao listar espacos do Circle em ${endpoint}: ${String(err)}`);
    }
  }

  return [];
}

async function requestCirclePosts({ token, url, spaceId }) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    console.warn(`[community-manager] Circle retornou HTTP ${response.status} para ${url.pathname}.`);
    return { ok: false, status: response.status, posts: [] };
  }

  const json = await response.json();
  return {
    ok: true,
    status: response.status,
    posts: parseCircleRecords(json).map((post) => normalizeCirclePost({ ...post, source_space_id: spaceId || post.space_id })),
  };
}

async function fetchCirclePostsPage({ token, limit, page, spaceId }) {
  const { url, mode } = circlePostsUrl({ limit, page, spaceId });

  if (circleAdminV2PostsUnavailable) {
    if (!loggedCircleFallback) {
      console.log("[community-manager] Usando endpoint alternativo de posts do Circle.");
      loggedCircleFallback = true;
    }
    return (await requestCirclePosts({ token, url: circleCommentsPostsUrl({ limit, page, spaceId }), spaceId })).posts;
  }

  const result = await requestCirclePosts({ token, url, spaceId });
  if (result.ok || mode !== "admin-v2-posts" || result.status !== 404) return result.posts;

  const fallbackUrl = circleCommentsPostsUrl({ limit, page, spaceId });
  circleAdminV2PostsUnavailable = true;
  console.log("[community-manager] Circle Admin v2 /posts retornou 404; usando endpoint alternativo de posts nesta instancia.");
  return (await requestCirclePosts({ token, url: fallbackUrl, spaceId })).posts;
}

// Busca posts recentes do Circle usando CIRCLE_API_TOKEN quando configurado.
export async function fetchCirclePosts(limit = 20) {
  const token = process.env.CIRCLE_API_TOKEN;
  if (!serviceEnabled("Circle", [token])) return [];

  try {
    const configuredSpaceIds = circleSpaceIds();
    const spaceIds = configuredSpaceIds.length > 0 ? configuredSpaceIds : await fetchCircleSpaceIds(token);
    const perSpaceLimit = spaceIds.length > 0 ? Math.max(limit, Math.ceil(limit / spaceIds.length)) : limit;
    const postsBySpace = [];
    if (spaceIds.length > 0) {
      for (const spaceId of spaceIds) {
        postsBySpace.push(await fetchCirclePostsPage({ token, limit: perSpaceLimit, page: 1, spaceId }));
      }
    } else {
      postsBySpace.push(await fetchCirclePostsPage({ token, limit, page: 1 }));
    }

    return postsBySpace
      .flat()
      .sort((a, b) => String(b.published_at || b.created_at || "").localeCompare(String(a.published_at || a.created_at || "")))
      .slice(0, limit);
  } catch (err) {
    console.warn(`[community-manager] Falha ao buscar posts do Circle: ${String(err)}`);
    return [];
  }
}
