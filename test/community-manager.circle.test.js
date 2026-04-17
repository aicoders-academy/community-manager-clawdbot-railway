import assert from "node:assert/strict";
import test from "node:test";

import { fetchCirclePosts } from "../src/community-manager.js";

function restoreEnv(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("fetchCirclePosts uses Circle Admin v2 posts endpoint when CIRCLE_SPACE_ID is configured", async () => {
  const previousEnv = {
    CIRCLE_API_TOKEN: process.env.CIRCLE_API_TOKEN,
    COMMUNITY_ID: process.env.COMMUNITY_ID,
    CIRCLE_SPACE_IDS: process.env.CIRCLE_SPACE_IDS,
    CIRCLE_SPACE_ID: process.env.CIRCLE_SPACE_ID,
    CIRCLE_API_BASE_URL: process.env.CIRCLE_API_BASE_URL,
  };
  const previousFetch = globalThis.fetch;
  let requestedUrl;
  let requestedHeaders;

  process.env.CIRCLE_API_TOKEN = "circle-token";
  delete process.env.COMMUNITY_ID;
  delete process.env.CIRCLE_SPACE_IDS;
  process.env.CIRCLE_SPACE_ID = "999";
  process.env.CIRCLE_API_BASE_URL = "https://app.circle.so/api";

  globalThis.fetch = async (url, options) => {
    requestedUrl = String(url);
    requestedHeaders = options.headers;
    return {
      ok: true,
      async json() {
        return {
          records: [
            {
              name: "Post Circle",
              body: { body: "<p>Conteudo</p>", created_at: "2026-04-16T10:00:00.000Z" },
              likes_count: 3,
            },
          ],
        };
      },
    };
  };

  try {
    const posts = await fetchCirclePosts(20);
    const url = new URL(requestedUrl);

    assert.equal(url.pathname, "/api/admin/v2/posts");
    assert.equal(url.searchParams.get("space_id"), "999");
    assert.equal(url.searchParams.get("status"), null);
    assert.equal(requestedHeaders.Authorization, "Bearer circle-token");
    assert.equal(posts[0].body, "<p>Conteudo</p>");
    assert.equal(posts[0].created_at, "2026-04-16T10:00:00.000Z");
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv(previousEnv);
  }
});

test("fetchCirclePosts uses Circle Admin v2 posts endpoint without CIRCLE_SPACE_ID", async () => {
  const previousEnv = {
    CIRCLE_API_TOKEN: process.env.CIRCLE_API_TOKEN,
    COMMUNITY_ID: process.env.COMMUNITY_ID,
    CIRCLE_SPACE_IDS: process.env.CIRCLE_SPACE_IDS,
    CIRCLE_SPACE_ID: process.env.CIRCLE_SPACE_ID,
    SPACE_ID: process.env.SPACE_ID,
  };
  const previousFetch = globalThis.fetch;
  let requestedUrl;

  process.env.CIRCLE_API_TOKEN = "circle-token";
  delete process.env.COMMUNITY_ID;
  delete process.env.CIRCLE_SPACE_IDS;
  delete process.env.CIRCLE_SPACE_ID;
  delete process.env.SPACE_ID;

  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      async json() {
        return { records: [] };
      },
    };
  };

  try {
    await fetchCirclePosts(10);
    assert.equal(new URL(requestedUrl).pathname, "/api/admin/v2/posts");
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv(previousEnv);
  }
});

test("fetchCirclePosts collects posts from multiple Circle spaces", async () => {
  const previousEnv = {
    CIRCLE_API_TOKEN: process.env.CIRCLE_API_TOKEN,
    COMMUNITY_ID: process.env.COMMUNITY_ID,
    CIRCLE_SPACE_IDS: process.env.CIRCLE_SPACE_IDS,
    CIRCLE_SPACE_ID: process.env.CIRCLE_SPACE_ID,
  };
  const previousFetch = globalThis.fetch;
  const requestedSpaceIds = [];

  process.env.CIRCLE_API_TOKEN = "circle-token";
  delete process.env.COMMUNITY_ID;
  process.env.CIRCLE_SPACE_IDS = "111, 222";
  delete process.env.CIRCLE_SPACE_ID;

  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    const spaceId = parsed.searchParams.get("space_id");
    requestedSpaceIds.push(spaceId);
    return {
      ok: true,
      async json() {
        return {
          records: [
            {
              name: `Post ${spaceId}`,
              published_at: spaceId === "111" ? "2026-04-15T10:00:00.000Z" : "2026-04-16T10:00:00.000Z",
              likes_count: Number(spaceId),
            },
          ],
        };
      },
    };
  };

  try {
    const posts = await fetchCirclePosts(10);
    assert.deepEqual(requestedSpaceIds.sort(), ["111", "222"]);
    assert.equal(posts.length, 2);
    assert.equal(posts[0].source_space_id, "222");
    assert.equal(posts[1].source_space_id, "111");
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv(previousEnv);
  }
});

test("fetchCirclePosts discovers all Circle spaces when no space IDs are configured", async () => {
  const previousEnv = {
    CIRCLE_API_TOKEN: process.env.CIRCLE_API_TOKEN,
    COMMUNITY_ID: process.env.COMMUNITY_ID,
    CIRCLE_SPACE_IDS: process.env.CIRCLE_SPACE_IDS,
    CIRCLE_SPACE_ID: process.env.CIRCLE_SPACE_ID,
    SPACE_ID: process.env.SPACE_ID,
  };
  const previousFetch = globalThis.fetch;
  const requestedUrls = [];

  process.env.CIRCLE_API_TOKEN = "circle-token";
  delete process.env.COMMUNITY_ID;
  delete process.env.CIRCLE_SPACE_IDS;
  delete process.env.CIRCLE_SPACE_ID;
  delete process.env.SPACE_ID;

  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    requestedUrls.push(String(url));

    if (parsed.pathname === "/api/admin/v2/spaces") {
      return {
        ok: true,
        async json() {
          return { records: [{ id: 111 }, { id: 222 }] };
        },
      };
    }

    return {
      ok: true,
      async json() {
        const spaceId = parsed.searchParams.get("space_id");
        return {
          records: [
            {
              name: `Post ${spaceId}`,
              published_at: "2026-04-16T10:00:00.000Z",
              likes_count: 1,
            },
          ],
        };
      },
    };
  };

  try {
    const posts = await fetchCirclePosts(10);
    assert.equal(new URL(requestedUrls[0]).pathname, "/api/admin/v2/spaces");
    assert.deepEqual(posts.map((post) => post.source_space_id).sort(), ["111", "222"]);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv(previousEnv);
  }
});

test("fetchCirclePosts falls back to comments posts endpoint when Admin v2 posts returns 404", async () => {
  const previousEnv = {
    CIRCLE_API_TOKEN: process.env.CIRCLE_API_TOKEN,
    CIRCLE_SPACE_IDS: process.env.CIRCLE_SPACE_IDS,
    CIRCLE_SPACE_ID: process.env.CIRCLE_SPACE_ID,
  };
  const previousFetch = globalThis.fetch;
  const requestedPaths = [];

  process.env.CIRCLE_API_TOKEN = "circle-token";
  process.env.CIRCLE_SPACE_IDS = "111";
  delete process.env.CIRCLE_SPACE_ID;

  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    requestedPaths.push(parsed.pathname);

    if (parsed.pathname === "/api/admin/v2/posts") {
      return { ok: false, status: 404 };
    }

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          records: [
            {
              title: "Fallback post",
              created_at: "2026-04-16T10:00:00.000Z",
              likes_count: 7,
            },
          ],
        };
      },
    };
  };

  try {
    const posts = await fetchCirclePosts(10);
    assert.deepEqual(requestedPaths, ["/api/admin/v2/posts", "/api/admin/v2/comments/posts"]);
    assert.equal(posts[0].title, "Fallback post");
    assert.equal(posts[0].source_space_id, "111");
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv(previousEnv);
  }
});

test("fetchCirclePosts reuses comments posts endpoint after Admin v2 posts has returned 404", async () => {
  const previousEnv = {
    CIRCLE_API_TOKEN: process.env.CIRCLE_API_TOKEN,
    CIRCLE_SPACE_IDS: process.env.CIRCLE_SPACE_IDS,
  };
  const previousFetch = globalThis.fetch;
  const requestedPaths = [];

  process.env.CIRCLE_API_TOKEN = "circle-token";
  process.env.CIRCLE_SPACE_IDS = "333,444";

  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    requestedPaths.push(parsed.pathname);

    if (parsed.pathname === "/api/admin/v2/posts") {
      return { ok: false, status: 404 };
    }

    return {
      ok: true,
      status: 200,
      async json() {
        return { records: [{ title: `Post ${parsed.searchParams.get("space_id")}`, created_at: "2026-04-16T10:00:00.000Z" }] };
      },
    };
  };

  try {
    await fetchCirclePosts(10);
    assert.deepEqual(requestedPaths, [
      "/api/admin/v2/comments/posts",
      "/api/admin/v2/comments/posts",
    ]);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv(previousEnv);
  }
});
