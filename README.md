# Open Prospecting

An open-source tool that builds you a ready-to-work list of local-business prospects. It finds businesses, reads their websites, and drafts a tailored call script and outreach message for each one. You do the actual reaching out yourself.

Think of it as the research assistant that does the boring prep, so every name on your list comes with a reason to call and the words to say.

## What it does

It runs as a short pipeline. Each prospect moves through three stages:

1. **Discover.** Searches for local businesses in the verticals and cities you pick (via Serper or Brave) and pulls their name, phone, and website.
2. **Research.** Reads each business's website and proposes 5 concrete things you could help them with. Revenue-growing and cost-cutting ideas come first.
3. **Script.** Drafts a short call script (opener, value, a qualifying question, a close, and objection handling) plus a brief message you can send by SMS or email.

That is the whole thing. There is no auto-dialer and nothing places calls for you. You open the list, pick who to contact, and reach out by phone or email using the script as your starting point.

## What you need

- Node 20 or newer
- A Postgres database (Neon works well and has a free tier)
- A Serper or Brave key for discovery
- An Anthropic key for the research and the scripts

## Quick start

```bash
cp .env.example .env.local    # then fill in DATABASE_URL and your keys
npm install
npm run db:push               # creates the tables
npm run dev                   # console at http://localhost:3100
```

Open http://localhost:3100 and you will see an empty prospect list. Fill it with a discovery run:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3100/api/cron/discovery
```

Then research and script what you found:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3100/api/cron/pipeline?batch=5"
```

Refresh the console and you have real local businesses, each with its own value tasks and a ready script. Click any prospect to see the full detail.

## The console

- **Overview** at `/` shows your list with sortable columns and pagination, plus a few counts (total, researched, ready to contact, how many have a phone or email).
- Click a prospect to see its value tasks (ordered by impact) and the call script and message drafted for it.

## Environment variables

Copy `.env.example` to `.env.local` and fill these in.

| Variable | What it is | Where to get it |
| --- | --- | --- |
| `DATABASE_URL` | Postgres connection string | [neon.tech](https://neon.tech) or any Postgres host |
| `ANTHROPIC_API_KEY` | research and script writing | [console.anthropic.com](https://console.anthropic.com) |
| `SEARCH_PROVIDER` | `serper`, `brave`, or `none` | pick one |
| `SEARCH_API_KEY` | key for that provider | [serper.dev](https://serper.dev) or [brave.com/search/api](https://brave.com/search/api) |
| `DISCOVERY_GEOGRAPHY` | country to search, e.g. `Canada` | you choose |
| `DISCOVERY_CITIES` | comma-separated city seeds for local search | you choose |
| `DISCOVERY_DAILY_CAP` | max prospects added per day | defaults to 50 |
| `CRON_SECRET` | protects the endpoints below | generate one with `openssl rand -hex 24` |

## Running the pipeline

Both endpoints want `Authorization: Bearer $CRON_SECRET`.

| Step | Endpoint |
| --- | --- |
| Discover (capped per day) | `GET /api/cron/discovery` |
| Research and script a batch | `GET /api/cron/pipeline?batch=5` |

In production you would point a scheduler at these with a small batch size. Locally, just curl them. Research and scripting each make one model call per prospect, so keep batches small (5 is a good size) and run the pipeline a few times to work through a big list.

## Reaching out

This is the manual part, and it is on purpose. For each prospect you get:

- **Five value tasks**, ordered so the revenue and cost wins are on top. These are your reasons to reach out.
- **A call script** with an opener, a value hook, a qualifying question, a close, and objection handling.
- **A short message** you can adapt for SMS or email.

Open a prospect, skim the tasks, and call or email them yourself. The script is a starting point, not a teleprompter. Edit it to sound like you.

## Make it yours

- **Verticals and cities** live in `src/lib/config.ts` (`TARGET_VERTICALS`) and the `DISCOVERY_CITIES` env var.
- **What you pitch.** The research and script prompts in `src/lib/research.ts` and `src/lib/scripts.ts` describe a sample product. Swap in your own product, price, and value props.
- **The daily discovery cap** is the `DISCOVERY_DAILY_CAP` env var.

## Tech

Next.js (App Router), Drizzle ORM on Postgres, Anthropic for research and scripts, and Serper or Brave for discovery.

## License

MIT. See `LICENSE`.
