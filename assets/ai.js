/*
 * ai.js — the AI weekly reflection.
 *
 * BYO-key model: the user pastes their OWN provider key (stored in
 * localStorage via storage.js). The request goes DIRECTLY from this
 * browser to the provider's API — never through any server of ours.
 *
 * Two providers are supported:
 *   - Anthropic (Claude): browser-direct via the
 *     `anthropic-dangerous-direct-browser-access` header.
 *   - OpenAI: browser-direct via the standard chat-completions endpoint.
 *
 * Both calls stream, so the reflection renders as it arrives. The caller
 * passes an onToken(textChunk) callback.
 */
(function (global) {
  "use strict";

  var DEFAULT_MODELS = {
    anthropic: "claude-opus-4-8",
    openai: "gpt-4o"
  };

  function defaultModel(provider) {
    return DEFAULT_MODELS[provider] || DEFAULT_MODELS.anthropic;
  }

  /* ---------- build the prompt from this week's data ---------- */

  function startOfWeek(now) {
    // Monday as the first day of the week.
    var d = new Date(now);
    d.setHours(0, 0, 0, 0);
    var day = (d.getDay() + 6) % 7; // 0 = Monday
    d.setDate(d.getDate() - day);
    return d;
  }

  function isoDate(d) {
    return d.toISOString().slice(0, 10);
  }

  function buildSummary(data, now) {
    now = now || new Date();
    var weekStart = startOfWeek(now);
    var weekStartIso = isoDate(weekStart);
    var lines = [];

    // Habits — count check-ins in the last 7 days, plus current streak.
    lines.push("HABITS:");
    if (!data.habits.length) {
      lines.push("  (none tracked)");
    } else {
      data.habits.forEach(function (h) {
        var hits = (h.history || []).filter(function (day) {
          return day >= weekStartIso;
        }).length;
        lines.push(
          "  - " + h.name + ": " + hits + "/7 days this week, current streak " +
          computeStreak(h.history || [], now) + " days"
        );
      });
    }

    // Finances — this week's income/expense and the month-to-date net.
    lines.push("");
    lines.push("FINANCES (this week):");
    var weekIncome = 0, weekExpense = 0;
    var monthPrefix = isoDate(now).slice(0, 7);
    var monthIncome = 0, monthExpense = 0;
    data.transactions.forEach(function (t) {
      if (t.date >= weekStartIso) {
        if (t.type === "income") weekIncome += t.amount;
        else weekExpense += t.amount;
      }
      if ((t.date || "").slice(0, 7) === monthPrefix) {
        if (t.type === "income") monthIncome += t.amount;
        else monthExpense += t.amount;
      }
    });
    if (!data.transactions.length) {
      lines.push("  (no transactions)");
    } else {
      lines.push("  income: " + weekIncome.toFixed(2));
      lines.push("  expenses: " + weekExpense.toFixed(2));
      lines.push("  net this week: " + (weekIncome - weekExpense).toFixed(2));
      lines.push("  month-to-date net: " + (monthIncome - monthExpense).toFixed(2));
    }

    // Goals — progress and status.
    lines.push("");
    lines.push("GOALS:");
    if (!data.goals.length) {
      lines.push("  (none set)");
    } else {
      data.goals.forEach(function (g) {
        lines.push(
          "  - " + g.name + ": " + (g.done ? "DONE" : (g.progress || 0) + "% complete")
        );
      });
    }

    return lines.join("\n");
  }

  // Consecutive-day streak ending today or yesterday.
  function computeStreak(history, now) {
    if (!history || !history.length) return 0;
    var set = {};
    history.forEach(function (d) { set[d] = true; });
    var cursor = new Date(now);
    cursor.setHours(0, 0, 0, 0);
    // Allow the streak to be "alive" if today isn't checked yet but yesterday is.
    if (!set[isoDate(cursor)]) {
      cursor.setDate(cursor.getDate() - 1);
      if (!set[isoDate(cursor)]) return 0;
    }
    var streak = 0;
    while (set[isoDate(cursor)]) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  var SYSTEM_PROMPT =
    "You are a warm, practical personal coach reviewing someone's week. " +
    "You are given a plain-text summary of their habit check-ins, finances, and goals. " +
    "Write a short weekly reflection (about 150-220 words) with three labeled sections: " +
    "Wins, Watch-outs, and One focus for next week. " +
    "Be specific to the numbers you see, honest but encouraging, and never preachy. " +
    "Do not invent data that isn't in the summary. Use plain prose, no markdown tables.";

  function userPrompt(summary) {
    return "Here is my week:\n\n" + summary + "\n\nWrite my weekly reflection.";
  }

  /* ---------- provider calls (browser-direct, streaming) ---------- */

  function reflect(data, settings, onToken) {
    var summary = buildSummary(data);
    if (settings.provider === "openai") {
      return callOpenAI(summary, settings, onToken);
    }
    return callAnthropic(summary, settings, onToken);
  }

  // Read an SSE stream and dispatch each `data:` line to handleEvent(json).
  function streamSSE(response, handleEvent) {
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";

    function pump() {
      return reader.read().then(function (result) {
        if (result.done) return;
        buffer += decoder.decode(result.value, { stream: true });
        var parts = buffer.split("\n");
        buffer = parts.pop(); // keep the trailing partial line
        parts.forEach(function (line) {
          line = line.trim();
          if (!line || line.indexOf("data:") !== 0) return;
          var payload = line.slice(5).trim();
          if (payload === "[DONE]") return;
          try {
            handleEvent(JSON.parse(payload));
          } catch (e) {
            /* ignore keep-alive / non-JSON lines */
          }
        });
        return pump();
      });
    }
    return pump();
  }

  function callAnthropic(summary, settings, onToken) {
    var model = settings.model || defaultModel("anthropic");
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
        // Required to allow calling the Messages API straight from a browser.
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1024,
        stream: true,
        thinking: { type: "adaptive" },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt(summary) }]
      })
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error(parseError(t, res.status));
        });
      }
      return streamSSE(res, function (evt) {
        if (
          evt.type === "content_block_delta" &&
          evt.delta &&
          evt.delta.type === "text_delta"
        ) {
          onToken(evt.delta.text);
        }
      });
    });
  }

  function callOpenAI(summary, settings, onToken) {
    var model = settings.model || defaultModel("openai");
    return fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + settings.apiKey
      },
      body: JSON.stringify({
        model: model,
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt(summary) }
        ]
      })
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error(parseError(t, res.status));
        });
      }
      return streamSSE(res, function (evt) {
        var choice = evt.choices && evt.choices[0];
        if (choice && choice.delta && choice.delta.content) {
          onToken(choice.delta.content);
        }
      });
    });
  }

  function parseError(text, status) {
    try {
      var j = JSON.parse(text);
      if (j.error && j.error.message) return j.error.message;
    } catch (e) { /* fall through */ }
    if (status === 401) return "Authentication failed — check your API key.";
    if (status === 429) return "Rate limited — wait a moment and try again.";
    return "Request failed (HTTP " + status + ").";
  }

  global.AI = {
    reflect: reflect,
    buildSummary: buildSummary,
    computeStreak: computeStreak,
    defaultModel: defaultModel
  };
})(window);
