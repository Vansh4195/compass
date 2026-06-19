/*
 * tests/e2e.mjs — free end-to-end test for Compass's LLM call.
 *
 * Compass talks to LLM providers using an OpenAI-compatible
 * chat-completions request (see assets/ai.js -> callOpenAI). Google Gemini
 * exposes that exact same shape at its OpenAI-compatible endpoint, so we can
 * exercise the real request/parse path against a real model for free.
 *
 * What this proves: the OpenAI-compatible request body Compass sends, and the
 * response-parsing logic it relies on, work against a live model. It runs in
 * Node (no browser), so there is no CORS involved — this is the reliable,
 * free path to confirm the wiring end-to-end.
 *
 * Get a free key at https://aistudio.google.com (no card required), then:
 *   GEMINI_API_KEY=your_key node tests/e2e.mjs
 *   # or:  npm run test:e2e
 *
 * Exits 0 on PASS, non-zero on FAIL. If GEMINI_API_KEY is unset it prints
 * SKIP and exits 0 (so CI without a key is not a hard failure).
 */

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const MODEL = "gemini-2.0-flash";

function fail(reason) {
  console.error("FAIL: " + reason);
  process.exit(1);
}

async function main() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.log(
      "SKIP: GEMINI_API_KEY is not set. Get a free key at " +
        "https://aistudio.google.com and run: GEMINI_API_KEY=... node tests/e2e.mjs"
    );
    process.exit(0);
  }

  // Same request shape Compass uses for OpenAI-compatible providers
  // (assets/ai.js -> callOpenAI / callGemini): a chat-completions POST with a
  // messages array and a Bearer token. Tokens kept tiny to cost ~nothing.
  const body = {
    model: MODEL,
    messages: [{ role: "user", content: "Reply with the single word: OK" }],
    max_tokens: 20
  };

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + key
      },
      body: JSON.stringify(body)
    });
  } catch (e) {
    fail("network error calling Gemini: " + (e && e.message ? e.message : e));
    return;
  }

  const raw = await res.text();
  if (!res.ok) {
    let msg = "HTTP " + res.status;
    try {
      const j = JSON.parse(raw);
      if (j.error && j.error.message) msg += " — " + j.error.message;
    } catch (_) {
      /* keep msg */
    }
    fail(msg);
    return;
  }

  // Parse exactly the way the app reads a (non-streaming) OpenAI-shaped reply:
  //   data.choices[0].message.content
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    fail("response was not valid JSON");
    return;
  }

  const choice = data && data.choices && data.choices[0];
  const text = choice && choice.message && choice.message.content;
  if (typeof text !== "string" || text.trim().length === 0) {
    fail("no non-empty text in response: " + raw.slice(0, 300));
    return;
  }

  console.log("Model replied: " + JSON.stringify(text.trim()));
  console.log("PASS");
  process.exit(0);
}

main().catch(function (e) {
  fail((e && e.message) ? e.message : String(e));
});
