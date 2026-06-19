# Compass

A small, private personal life OS that runs entirely in your browser. Track your
**habits**, keep a simple **finance** ledger, set **goals** — and get an
**AI weekly reflection** that reads your data and gives you a short, honest summary
with a bit of encouragement.

There is no backend, no account, and no server. All of your data lives in your
browser's local storage. The AI reflection is the only network call, and it goes
directly from your browser to the AI provider using a key that you supply.

## What it does

- **Habits** — add habits, check them off each day, and watch streaks build on
  consecutive days.
- **Finances** — log income and expenses, see your income / expenses / net for the
  current month, and a bar chart of net by month.
- **Goals** — add goals, slide a progress bar, and mark them done.
- **Reflect** — generate an AI weekly reflection: Wins, Watch-outs, and one focus
  for next week, grounded in the actual numbers from your week.
- **Export / Import / Reset** — your data is portable JSON you fully control.

## Your data stays in your browser

Compass is a static single-page app. It has no database and talks to no server of
its own. Habits, transactions, and goals are stored in `localStorage` under the
keys `compass.data.v1` and `compass.settings.v1`. Clearing your browser data, or
using the **Reset all** button, removes everything.

The only time anything leaves your machine is when you click **Generate
reflection** — at that point the app sends a plain-text summary of your week
directly to the AI provider you chose, authenticated with your own API key.

## Bring your own key (BYO-key)

The weekly reflection calls a large language model. You paste your own API key in
**Settings**; it is stored only in this browser's local storage and is sent only to
the provider's API, straight from the browser — never to any intermediary.

Three providers are supported:

| Provider            | Where to get a key                      | Default model      |
| ------------------- | --------------------------------------- | ------------------ |
| Anthropic (Claude)  | `console.anthropic.com`                 | `claude-opus-4-8`  |
| OpenAI              | `platform.openai.com`                   | `gpt-4o`           |
| Gemini (free)       | `aistudio.google.com` (free, no card)   | `gemini-2.0-flash` |

**Gemini** is the free option: it calls Google's OpenAI-compatible
chat-completions endpoint with the same request shape as OpenAI. That endpoint
returns CORS headers, so the browser-direct reflection works as a normal
provider here. (See [Test for free with Gemini](#test-for-free-with-gemini) for
the matching Node test, which is the reliable free path regardless of browser
CORS.)

To set it up:

1. Click **Settings** (top right).
2. Pick a provider and paste your API key. Optionally override the model id.
3. Click **Save**.
4. Go to the **Reflect** tab and click **Generate reflection**.

The Anthropic call uses the official browser-direct path
(`anthropic-dangerous-direct-browser-access`); the OpenAI call uses the standard
chat-completions endpoint. Both stream, so the reflection appears as it is written.

> A note on browser-pasted keys: it's convenient, but a key held in the browser is
> readable by any script running on the page. Use a key you can rotate, and revoke
> it if you ever paste it somewhere you don't trust.

## Run it

It's a static site — no build step, no dependencies.

```bash
# from the repo root
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just open `index.html` directly in your browser. (Serving over `http://` is
recommended so the AI fetch behaves consistently.)

## Test for free with Gemini

You can verify Compass's LLM call end-to-end for free, against a real model,
without spending anything:

1. Get a **free** Gemini API key at
   [aistudio.google.com](https://aistudio.google.com) (no credit card).
2. Run the test:

   ```bash
   GEMINI_API_KEY=your_key npm run test:e2e
   # or, without npm:
   GEMINI_API_KEY=your_key node tests/e2e.mjs
   ```

It prints `PASS` (and exits 0) when the model replies. With no key set it prints
`SKIP` and exits 0; on any failure it prints `FAIL: <reason>` and exits non-zero.

The test (`tests/e2e.mjs`) makes **one** tiny chat-completions call (max 20
tokens, ≈ free) against Google's OpenAI-compatible endpoint
(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
model `gemini-2.0-flash`) — the same request/parse shape the app uses for its
OpenAI-compatible providers. Because it runs in Node there is no browser and no
CORS, so it is a reliable, free way to prove the request and response-parsing
logic work. You can use the same free Gemini key in the in-app **Settings →
Gemini (free)** provider to generate real reflections in the browser.

## Demo

1. Open the app. On the **Habits** tab, add "Read 20 minutes" and click the circle
   to check it off — the streak ticks to 1 day.
2. Switch to **Finances**, add an expense and an income; the monthly stats and the
   net-by-month chart update immediately.
3. On **Goals**, add "Run a half marathon" and drag the progress slider to 40%.
4. In **Settings**, paste your provider key and save.
5. On **Reflect**, click **Generate reflection** — you'll get a short, specific
   write-up of your week.

## Project layout

```
index.html        markup + the three trackers + the reflect/settings UI
assets/styles.css minimal black & white theme (respects dark mode)
assets/storage.js localStorage persistence + export/import
assets/ai.js      builds the weekly summary and makes the browser-direct LLM call
assets/app.js     UI rendering and event wiring
tests/e2e.mjs     free end-to-end LLM test via Gemini (Node, no browser/CORS)
package.json      npm scripts (test:e2e, serve) — the site itself needs no build
```

## License

MIT — see [LICENSE](LICENSE).
