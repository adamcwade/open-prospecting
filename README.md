# Open Prospecting

An open-source outbound prospecting tool. It finds local businesses, researches each one, writes a custom sales script, and (if you want) calls them with an AI voice agent. When someone says yes, it hands the lead off to your signup flow.

Think of it as a tireless SDR that runs on your own machine and your own API keys.

## What it actually does

The whole thing is a pipeline. Each prospect moves through these stages:

1. **Discover.** Searches Google (via Serper) for local businesses in the verticals and cities you pick, then pulls their name, phone, and website.
2. **Research.** Reads each business's website and proposes 5 concrete tasks the agent could do for them. Revenue-growing and cost-cutting ideas come first.
3. **Script.** Writes a tailored voice script and a short SMS, both leading with the money angle, both opening with a recorded-call disclosure.
4. **Call.** Dials through Twilio and runs a live conversation with an AI voice (OpenAI Realtime). It detects agreement, opt-outs, and voicemail.
5. **Hand off.** When a prospect agrees, it texts them a signup link and marks them as a sale.

You can run only the parts you need. Discovery, research, and scripting work on their own with nothing more than a database and two API keys. Calling is opt-in and needs more setup.

## What you need

- Node 20 or newer
- A Postgres database (Neon works well and has a free tier)
- A Serper or Brave key for discovery
- An Anthropic key for research and script writing
- For calling only: Twilio (account, a number or two, a Messaging Service) and an OpenAI key

## Quick start

```bash
cp .env.example .env.local    # then fill in DATABASE_URL and your keys
npm install
npm run db:push               # creates the tables
npm run dev                   # operator console at http://localhost:3100
```

Open http://localhost:3100 and you will see the console with an empty prospect list. Now run discovery to fill it:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3100/api/cron/discovery
```

Then research and script what you found:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3100/api/cron/pipeline?batch=5"
```

Refresh the console and you have a list of real local businesses, each with custom tasks and a ready script. No calls happen until you set up calling and ask for them.

## The console

- **Overview** at `/` shows your stats and the full prospect list, with sortable columns and pagination.
- **Call history** at `/calls` shows every call and its transcript, with sales flagged.
- Click any prospect to see its tasks and script.

## Environment variables

Copy `.env.example` to `.env.local` and fill these in.

| Variable | What it is | Where to get it |
| --- | --- | --- |
| `DATABASE_URL` | Postgres connection string | [neon.tech](https://neon.tech) or any Postgres host |
| `SEARCH_PROVIDER` | `serper`, `brave`, or `none` | pick one |
| `SEARCH_API_KEY` | key for that provider | [serper.dev](https://serper.dev) or [brave.com/search/api](https://brave.com/search/api) |
| `DISCOVERY_GEOGRAPHY` | country to search, e.g. `Canada` | you choose |
| `DISCOVERY_CITIES` | comma-separated city seeds for local search | you choose |
| `ANTHROPIC_API_KEY` | for research and scripts | [console.anthropic.com](https://console.anthropic.com) |
| `CRON_SECRET` | protects the pipeline endpoints | generate one with `openssl rand -hex 24` |
| `OPENAI_API_KEY` | calling only, for the voice agent | [platform.openai.com](https://platform.openai.com) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | calling only | [console.twilio.com](https://console.twilio.com) |
| `TWILIO_MESSAGING_SERVICE_SID` | calling only, sends the SMS | Twilio console |
| `TWILIO_OUTBOUND_POOL` | calling only, your from-numbers | Twilio console |
| `VOICE_STREAM_URL` | calling only, public wss URL of the voice server | a tunnel like ngrok |
| `PUBLIC_URL` | calling only, public https URL for Twilio webhooks | a tunnel like ngrok |
| `SIGNUP_URL` | where agreed prospects go to sign up | your own page |

## Running the loop

Every endpoint below wants `Authorization: Bearer $CRON_SECRET`.

| Step | Endpoint |
| --- | --- |
| Discover (capped per day) | `GET /api/cron/discovery` |
| Research and script a batch | `GET /api/cron/pipeline?batch=5` |
| Dial a batch | `GET /api/cron/dial?batch=5` |
| Dial one prospect | `POST /api/calls/start` with `{ "prospectId": 1 }` |

In production you would point a scheduler at the discovery and pipeline endpoints with a small batch size. Locally, just curl them.

## Turning on calls

Calling places real phone calls to real people, so it takes a little more wiring.

1. Start the voice server in its own terminal:

   ```bash
   npm run voice
   ```

   It listens on port 8080 at the path `/media`.

2. Twilio needs to reach both the app (port 3100) and the voice server (port 8080) over the public internet. Open two tunnels (ngrok is the easy option):

   ```bash
   ngrok http 3100   # use this for PUBLIC_URL
   ngrok http 8080   # use this for VOICE_STREAM_URL, as wss://<host>/media
   ```

3. Set `PUBLIC_URL` to the https tunnel for 3100, and `VOICE_STREAM_URL` to `wss://<host>/media` for 8080. Restart the app so it picks them up.

4. Test against your own phone first. Add a prospect with your own number, run it through research and scripting, then call it with `POST /api/calls/start`. Your phone rings and you can talk to the agent.

The dialer has a kill switch that pauses all outbound, skips anyone on the do-not-call list, and adds a number to that list the moment someone says stop on a call. Every call opens with the recorded-call disclosure.

## Make it yours

- **Verticals and cities** live in `src/lib/config.ts` (`TARGET_VERTICALS`) and the `DISCOVERY_CITIES` env var.
- **The product you pitch.** The research and script prompts in `src/lib/research.ts` and `src/lib/scripts.ts` describe a sample product. Swap in your own product, price, and value props. Update the spoken disclosure in `src/lib/config.ts` too.
- **The daily discovery cap** is the `DISCOVERY_DAILY_CAP` env var.

## Please use it responsibly

This tool makes automated outbound calls with an AI voice. That is regulated in most places (for example TCPA and various robocall and AI-disclosure laws in the US, and similar rules elsewhere). Calling hours, consent, and do-not-call rules are on you.

The tool ships with a spoken disclosure, opt-out handling, and a do-not-call list, but those are a starting point, not legal advice. Test against your own number, know the rules where you and your prospects are, and get advice if you are unsure.

## Tech

Next.js (App Router), Drizzle ORM on Postgres, Anthropic for research and scripts, OpenAI Realtime plus Twilio Media Streams for voice, Serper or Brave for discovery.

## License

MIT. See `LICENSE`.
