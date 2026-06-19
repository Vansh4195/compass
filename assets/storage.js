/*
 * storage.js — all persistence for Compass.
 *
 * Everything lives in the browser's localStorage under a single key.
 * No network, no backend. This file owns the data shape and the only
 * functions that read/write it.
 */
(function (global) {
  "use strict";

  var STORE_KEY = "compass.data.v1";
  var SETTINGS_KEY = "compass.settings.v1";

  function emptyData() {
    return { habits: [], transactions: [], goals: [] };
  }

  function uid() {
    // Good enough for local, single-user records.
    return (
      Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    );
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return emptyData();
      var parsed = JSON.parse(raw);
      // Defensive: tolerate a partial/old object.
      return {
        habits: Array.isArray(parsed.habits) ? parsed.habits : [],
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        goals: Array.isArray(parsed.goals) ? parsed.goals : []
      };
    } catch (e) {
      console.warn("Compass: could not parse stored data, starting fresh.", e);
      return emptyData();
    }
  }

  function save(data) {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  }

  function reset() {
    localStorage.removeItem(STORE_KEY);
  }

  function exportJSON() {
    return JSON.stringify(load(), null, 2);
  }

  function importJSON(text) {
    var parsed = JSON.parse(text); // throws on bad JSON — caller handles
    var clean = {
      habits: Array.isArray(parsed.habits) ? parsed.habits : [],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : []
    };
    save(clean);
    return clean;
  }

  /* ---------- settings (provider, key, model) ---------- */
  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { provider: "anthropic", apiKey: "", model: "" };
      var s = JSON.parse(raw);
      return {
        provider: s.provider || "anthropic",
        apiKey: s.apiKey || "",
        model: s.model || ""
      };
    } catch (e) {
      return { provider: "anthropic", apiKey: "", model: "" };
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  global.Store = {
    uid: uid,
    load: load,
    save: save,
    reset: reset,
    exportJSON: exportJSON,
    importJSON: importJSON,
    loadSettings: loadSettings,
    saveSettings: saveSettings
  };
})(window);
