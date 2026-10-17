# Draw & Models Guess

A drawing game where **every player brings their own model**. One person draws, everybody else's model gets three looks at the finished picture, and the pencil passes on.

No shared inference account, no leaderboard of strangers: you type in a base URL, a model id and your own API key, and that key never leaves your browser except as one short-lived request.

## How a round works

1. **Join.** Open the site, fill in your name, the model you want to play with, an OpenAI-compatible base URL and your key. Create a room and share the five-letter code (or the invite link).
2. **Deal.** The host starts. The server picks a word and shows it to the artist only. Everyone else's browser never receives it.
3. **Draw.** The artist draws on the canvas. The drawing is pushed to the room every couple of seconds so the others can watch it happen.
4. **Guess.** The artist presses *Done*. Every model in the room — including the artist's own — gets up to three looks, one call at a time, each seeing the same picture and its own earlier wrong guesses.
5. **Score and rotate.** Points go to the model that solved it and to the artist who drew it well. Then the next player draws.

The game ends when everyone has drawn once. Final board, then a new room.

### Scoring

| Solved on | Points |
| --------- | ------ |
| first look | 3 |
| second look | 2 |
| third look | 1 |

The artist gets **+1 for every other model that solves their drawing**, so a clear drawing is worth something even when your own model is slow.

## Bring your own model

Anything that speaks the OpenAI chat-completions wire with image input works:

- Together AI — `https://api.together.xyz/v1`
- OpenRouter — `https://openrouter.ai/api/v1`
- vLLM, SGLang, LM Studio behind a tunnel — `https://your-host/v1`

The endpoint must be `https://` and must not resolve to a private address; the server refuses anything else. See [lib/endpoint.ts](lib/endpoint.ts).

## Running it

```bash
pnpm install
cp .env.example .env.local   # optional
pnpm dev
```

Nothing is required to run it. Without Redis, rooms live in `.data/rooms.json` on the local disk, which is right for one `next dev` process and wrong for a serverless deploy — two instances would each hold half a room. For a real deployment set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or the `KV_REST_API_*` pair that Vercel KV injects).

Deploying to Vercel is a plain `next build`; the only thing you should add is the Redis pair.

## Deploying

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/adongshaln/draw-and-models-guess)

One thing has to be added after the import: **a shared store**. On Vercel every request can land on a different instance, so the local `.data/rooms.json` fallback cannot work — two functions would each hold half a room and a player would watch the table empty out on refresh. The app refuses to open a room rather than half-work, and says which variables are missing.

Easiest: in the Vercel project, **Storage → Marketplace → Upstash Redis** (the free tier is plenty). It injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` by itself. Or set the `UPSTASH_REDIS_REST_*` pair by hand. Then redeploy.

That is the entire configuration. There is no site-wide model key, because every player brings their own.

## How it is built

| Path | What it does |
| ---- | ------------ |
| [lib/room.ts](lib/room.ts) | The whole game as one JSON object plus pure transitions. Every phase change is `(room, now) => room`, so two serverless instances can never disagree. |
| [lib/store.ts](lib/store.ts) | Upstash REST or a local file, behind about eight verbs, with a short-lived lock around read-modify-write. |
| [lib/judge.ts](lib/judge.ts) | The referee: articles, plurals, filler words, listed synonyms, one typo on a long word. No model is asked to rule, so judging costs nothing. |
| [lib/endpoint.ts](lib/endpoint.ts) | The SSRF gate. A player types a URL and the server fetches it, so the URL has to be vetted. |
| [lib/chat.ts](lib/chat.ts) | One call to one player's model, over plain `fetch`. |
| [app/api/room](app/api/room) | Create a room, poll it, and act on it (join, start, done, next, ink). |
| [app/api/room/[code]/guess](app/api/room/%5Bcode%5D/guess/route.ts) | One look by one model. |
| [components/RoomView.tsx](components/RoomView.tsx) | The room: polling, the phase UI, and the loop that runs *your* model on *your* key. |
| [components/Canvas.tsx](components/Canvas.tsx) | perfect-freehand strokes in a fixed 1000×1000 space, cached `Path2D`s, and a cropped PNG snapshot. |

### Trust boundaries

- The **word** is in the room object but is redacted per viewer: only the artist sees it before the reveal ([publicRoom](lib/room.ts)).
- The **attempt number and the points** are derived on the server from its own record, never from the request.
- The **picture** a model sees is the one stored in the room, so a player cannot feed their model a screenshot of the answer.
- The **API key** is never written to the room, never logged, and never echoed in an error message. It arrives with one request, is used, and is dropped.
- The **endpoint** is vetted when you join and again before every call.

## CI

`.github/workflows/ci.yml` runs on every push: `pnpm typecheck`, `pnpm test:run` (Vitest), `pnpm build`. Nothing is built locally as part of contributing.

## Credit

The idea of letting a row of open models race to name a doodle comes from [Nutlope/open-pictionary](https://github.com/Nutlope/open-pictionary), and so does most of what makes this one look like anything:

- **The word deck** — [lib/words.ts](lib/words.ts) is their 166-word table, synonyms and all.
- **The model table** — [lib/presets.ts](lib/presets.ts) is their racer table: the endpoint, the model id, and the one thinking switch that works per lab.
- **The visual system** — [app/globals.css](app/globals.css) is their stylesheet: one typeface on three axes, sticker cards, the room colour, every keyframe.
- **The creatures** — [lib/creatures.ts](lib/creatures.ts) and [components/Creature.tsx](components/Creature.tsx) are their geometry and their shared gaze loop. The eighth body (`flower`) is the one they defined and never used.
- **The confetti, the clock, the word reveal, the synthesised sound** — [Burst](components/Burst.tsx), [Clock](components/Clock.tsx), [Word](components/Word.tsx), [sound](components/sound.ts), all copied and re-pointed at seats instead of a fixed seven.

What is new here is the game around it: rooms, turn rotation, three looks per model, server-side judging, and models that belong to the players rather than to the site.
