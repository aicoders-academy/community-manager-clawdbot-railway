# OpenClaw Railway Template (1‑click deploy)

This repo packages **OpenClaw** for Railway with a small **/setup** web wizard so users can deploy and onboard **without running any commands**.

## What you get

- **OpenClaw Gateway + Control UI** (served at `/` and `/openclaw`)
- A friendly **Setup Wizard** at `/setup` (protected by a password)
- Persistent state via **Railway Volume** (so config/credentials/memory survive redeploys)
- One-click **Export backup** (so users can migrate off Railway later)
- **Import backup** from `/setup` (advanced recovery)
- **Community Manager Agent** endpoints for Circle, WhatsApp/Evolution API and OpenRouter

## How it works (high level)

- The container runs a wrapper web server.
- The wrapper protects `/setup` (and the Control UI at `/openclaw`) with `SETUP_PASSWORD` using HTTP Basic auth.
- During setup, the wrapper runs `openclaw onboard --non-interactive ...` inside the container, writes state to the volume, and then starts the gateway.
- After setup, **`/` is OpenClaw**. The wrapper reverse-proxies all traffic (including WebSockets) to the local gateway process.

## Railway deploy instructions (what you’ll publish as a Template)

In Railway Template Composer:

1) Create a new template from this GitHub repo.
2) Add a **Volume** mounted at `/data`.
3) Set the following variables:

Required:
- `SETUP_PASSWORD` — user-provided password to access `/setup` and the Control UI (`/openclaw`) via HTTP Basic auth

Recommended:
- `OPENCLAW_STATE_DIR=/data/.openclaw`
- `OPENCLAW_WORKSPACE_DIR=/data/workspace`

Optional:
- `OPENCLAW_GATEWAY_TOKEN` — if not set, the wrapper generates one (not ideal). In a template, set it using a generated secret.
- `OPENROUTER_API_KEY` — enables AI moderation, summaries and post suggestions.
- `CIRCLE_API_TOKEN` — enables Circle post collection. The agent tries to discover all spaces automatically.
- `CIRCLE_API_BASE_URL` — optional Circle API base URL. Defaults to `https://app.circle.so/api`.
- `CIRCLE_SPACE_IDS` — optional comma-separated list of Circle space IDs if you want to restrict collection. `CIRCLE_SPACE_ID` still works for one space.
- `EVOLUTION_API_URL` and `EVOLUTION_API_KEY` — enable WhatsApp send/receive via Evolution API.
- `WHATSAPP_API_URL` and `WHATSAPP_API_KEY` — accepted aliases for the Evolution API URL/key.
- `ALLOWED_GROUPS` — comma-separated WhatsApp group IDs allowed for processing. Messages from every other chat are ignored.
- `EVOLUTION_INSTANCE` — optional default Evolution instance name for outbound messages.
- `AI_NEWS_RSS_URLS` — optional comma-separated RSS feeds to add before the curated AI/dev source list.
- `AI_NEWS_RSS_URL` — optional compatibility alias for one RSS feed.
- `AI_NEWS_SOURCES_FILE` — optional path to a JSON source list. Defaults to `src/community-manager/news-sources.json`.
- `AI_NEWS_SOURCE_TIMEOUT_MS` — optional per-source fetch timeout. Defaults to `8000`.
- `SLACK_WEBHOOK_URL` — optional Slack Incoming Webhook used to send task digests.
- `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` — enable Slack mentions/DMs via Events API.
- `SLACK_ALLOWED_CHANNELS` — optional comma-separated Slack channel IDs allowed to talk to the bot.
- `SLACK_MESSAGE_LIMIT` — optional max Slack text size. Defaults to `2800` to avoid overlong messages.

## Community Manager Agent

The agent is mounted inside the existing wrapper so Railway deployment keeps using the same Dockerfile and startup command.

Endpoints:
- `POST /hooks/evolution` receives Evolution API webhooks. It only processes payloads whose group ID is listed in `ALLOWED_GROUPS`.
- `POST /hooks/evolution/send` sends a message via Evolution API to an allowed group.
- `GET /community-manager/status` shows enabled integrations and buffered WhatsApp message count.
- `GET /community-manager/circle/posts` fetches recent Circle posts.
- `GET /community-manager/summary` summarizes hot topics from Circle and allowed WhatsApp groups.
- `GET /community-manager/suggest-posts` suggests content ideas from AI news and community pain points.
- `POST /community-manager/slack/tasks` sends a task digest to Slack using `SLACK_WEBHOOK_URL`.
- `POST /hooks/slack/events` receives Slack Events API callbacks for `app_mention`, `message.im`, and `url_verification`.
- `GET /community-manager/highlights/weekly` returns weekly highlights from Circle posts and WhatsApp conversations.
- `GET /community-manager/moderation/alerts` reviews recent allowed WhatsApp messages for guideline risks.
- `GET /community-manager/summary/daily` returns a daily operational summary.
- `GET /community-manager/content/community` proposes posts based on community conversations.
- `GET /community-manager/content/ai-news` proposes posts based on recent AI news.

The `/community-manager/*` endpoints use the same Basic Auth password as `/setup`. The webhook path remains public so Evolution API can call it.

If an API key is missing, that integration logs a warning and returns an empty/disabled result instead of crashing the app. This allows using Circle without WhatsApp, WhatsApp without Circle, or running without OpenRouter while wiring credentials.

AI news suggestions use a curated source list focused on developer-relevant model releases, APIs, SDKs, agents, security and tooling updates. The default list lives in `src/community-manager/news-sources.json` so sources can be maintained without editing the news parser code. Set `AI_NEWS_RSS_URLS` to prepend your own feeds, or `AI_NEWS_SOURCES_FILE` to replace the bundled JSON list.

### Slack mentions and DMs

To talk to the bot in Slack:

1) In the Slack app, enable **Event Subscriptions**.
2) Set the Request URL to:

```text
https://<your-railway-domain>/hooks/slack/events
```

3) Subscribe to bot events:

```text
app_mention
message.im
```

4) Add OAuth scopes:

```text
app_mentions:read
chat:write
im:history
```

5) Install or reinstall the Slack app into the workspace.
6) Set Railway variables:

```text
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_ALLOWED_CHANNELS=C123456,C789012
```

Then mention the bot in an allowed channel:

```text
@Community Manager me mande as tarefas de hoje
```

Or send it a DM. Messages containing terms like `tarefas`, `resumo`, `posts` or `pautas` generate the task digest. Other messages are answered conversationally through OpenRouter.

The Slack bot understands these operational requests:
- `o que voce sabe fazer?`
- `destaques da semana`
- `qual foi o post mais curtido de hoje?`
- `tem alguem quebrando as diretrizes?`
- `proponha posts com base no que as pessoas estao falando`
- `resumo diario dos grupos`
- `proponha posts com noticias de IA`
- free-form conversation, with no fabricated community facts

Notes:
- This template pins OpenClaw to a released version by default via Docker build arg `OPENCLAW_GIT_REF` (override if you want `main`).

4) Enable **Public Networking** (HTTP). Railway will assign a domain.
   - This service listens on Railway’s injected `PORT` at runtime (recommended).
5) Deploy.

Then:
- Visit `https://<your-app>.up.railway.app/setup`
  - Your browser will prompt for **HTTP Basic auth**. Use any username; the password is `SETUP_PASSWORD`.
- Complete setup
- Visit `https://<your-app>.up.railway.app/` and `/openclaw` (same Basic auth)

## Support / community

- GitHub Issues: https://github.com/vignesh07/clawdbot-railway-template/issues
- Discord: https://discord.com/invite/clawd

If you’re filing a bug, please include the output of:
- `/healthz`
- `/setup/api/debug` (after authenticating to /setup)

## Getting chat tokens (so you don’t have to scramble)

### Telegram bot token
1) Open Telegram and message **@BotFather**
2) Run `/newbot` and follow the prompts
3) BotFather will give you a token that looks like: `123456789:AA...`
4) Paste that token into `/setup`

### Discord bot token
1) Go to the Discord Developer Portal: https://discord.com/developers/applications
2) **New Application** → pick a name
3) Open the **Bot** tab → **Add Bot**
4) Copy the **Bot Token** and paste it into `/setup`
5) Invite the bot to your server (OAuth2 URL Generator → scopes: `bot`, `applications.commands`; then choose permissions)

## Persistence (Railway volume)

Railway containers have an ephemeral filesystem. Only the mounted volume at `/data` persists across restarts/redeploys.

What persists cleanly today:
- **Custom skills / code:** anything under `OPENCLAW_WORKSPACE_DIR` (default: `/data/workspace`)
- **Node global tools (npm/pnpm):** this template configures defaults so global installs land under `/data`:
  - npm globals: `/data/npm` (binaries in `/data/npm/bin`)
  - pnpm globals: `/data/pnpm` (binaries) + `/data/pnpm-store` (store)
- **Python packages:** create a venv under `/data` (example below). The runtime image includes Python + venv support.

What does *not* persist cleanly:
- `apt-get install ...` (installs into `/usr/*`)
- Homebrew installs (typically `/opt/homebrew` or similar)

### Optional bootstrap hook

If `/data/workspace/bootstrap.sh` exists, the wrapper will run it on startup (best-effort) before starting the gateway.
Use this to initialize persistent install prefixes or create a venv.

Example `bootstrap.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Example: create a persistent python venv
python3 -m venv /data/venv || true

# Example: ensure npm/pnpm dirs exist
mkdir -p /data/npm /data/npm-cache /data/pnpm /data/pnpm-store
```

## Troubleshooting

### “disconnected (1008): pairing required” / dashboard health offline

This is not a crash — it means the gateway is running, but no device has been approved yet.

Fix:
- Open `/setup`
- Use the **Debug Console**:
  - `openclaw devices list`
  - `openclaw devices approve <requestId>`

If `openclaw devices list` shows no pending request IDs:
- Make sure you’re visiting the Control UI at `/openclaw` (or your native app) and letting it attempt to connect
  - Note: the Railway wrapper now proxies the gateway and injects the auth token automatically, so you should not need to paste the gateway token into the Control UI when using `/openclaw`.
- Ensure your state dir is the Railway volume (recommended): `OPENCLAW_STATE_DIR=/data/.openclaw`
- Check `/setup/api/debug` for the active state/workspace dirs + gateway readiness

### “unauthorized: gateway token mismatch”

The Control UI connects using `gateway.remote.token` and the gateway validates `gateway.auth.token`.

Fix:
- Re-run `/setup` so the wrapper writes both tokens.
- Or set both values to the same token in config.

### “Application failed to respond” / 502 Bad Gateway

Most often this means the wrapper is up, but the gateway can’t start or can’t bind.

Checklist:
- Ensure you mounted a **Volume** at `/data` and set:
  - `OPENCLAW_STATE_DIR=/data/.openclaw`
  - `OPENCLAW_WORKSPACE_DIR=/data/workspace`
- Ensure **Public Networking** is enabled (Railway will inject `PORT`).
- Check Railway logs for the wrapper error: it will show `Gateway not ready:` with the reason.

### Legacy CLAWDBOT_* env vars / multiple state directories

If you see warnings about deprecated `CLAWDBOT_*` variables or state dir split-brain (e.g. `~/.openclaw` vs `/data/...`):
- Use `OPENCLAW_*` variables only
- Ensure `OPENCLAW_STATE_DIR=/data/.openclaw` and `OPENCLAW_WORKSPACE_DIR=/data/workspace`
- Redeploy after fixing Railway Variables

### Build OOM (out of memory) on Railway

Building OpenClaw from source can exceed small memory tiers.

Recommendations:
- Use a plan with **2GB+ memory**.
- If you see `Reached heap limit Allocation failed - JavaScript heap out of memory`, upgrade memory and redeploy.

## Local smoke test

```bash
docker build -t clawdbot-railway-template .

docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -e SETUP_PASSWORD=test \
  -e OPENCLAW_STATE_DIR=/data/.openclaw \
  -e OPENCLAW_WORKSPACE_DIR=/data/workspace \
  -v $(pwd)/.tmpdata:/data \
  clawdbot-railway-template

# open http://localhost:8080/setup (password: test)
```

---

## Official template / endorsements

- Officially recommended by OpenClaw: <https://docs.openclaw.ai/railway>
- Railway announcement (official): [Railway tweet announcing 1‑click OpenClaw deploy](https://x.com/railway/status/2015534958925013438)

  ![Railway official tweet screenshot](assets/railway-official-tweet.jpg)

- Endorsement from Railway CEO: [Jake Cooper tweet endorsing the OpenClaw Railway template](https://x.com/justjake/status/2015536083514405182)

  ![Jake Cooper endorsement tweet screenshot](assets/railway-ceo-endorsement.jpg)

- Created and maintained by **Vignesh N (@vignesh07)**
- **11000+ deploys on Railway and counting** [Link to template on Railway](https://railway.com/deploy/clawdbot-railway-template)

![Railway template deploy count](assets/railway-deploys.jpg)
