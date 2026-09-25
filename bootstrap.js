/* fidoic for Zotero 7+ (bootstrapped plugin, no build step) */

var Fidoic;

async function startup({ id }) {
  if (Zotero.initializationPromise) await Zotero.initializationPromise;
  if (Zotero.uiReadyPromise) await Zotero.uiReadyPromise;
  Fidoic = createPlugin(id);
  Fidoic.init();
}
function shutdown() {
  if (Fidoic) {
    Fidoic.destroy();
    Fidoic = null;
  }
}
function onMainWindowLoad({ window }) {
  if (Fidoic) Fidoic.addToWindow(window);
}
function onMainWindowUnload({ window }) {
  if (Fidoic) Fidoic.removeFromWindow(window);
}
function install() {}
function uninstall() {}

function createPlugin(pluginID) {
  const PREF = "extensions.fidoic.";
  const LEGACY_PREF = "extensions.paper-companion."; // carries over keys saved by the earlier build
  const NS = "http://www.w3.org/1999/xhtml";
  const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
  const GEMINI_ROOT = "https://generativelanguage.googleapis.com/v1beta/";
  const GEMINI_BASE = GEMINI_ROOT + "models/";
  const GEMINI_CACHE_TTL_SECONDS = 3600;
  const DEFAULTS = {
    provider: "gemini",
    geminiModel: "gemini-3.8-flash",
    geminiFallback: "gemini-3.5-flash-lite",
    claudeModel: "claude-sonnet-5",
    maxChars: 120000,
    maxOutputTokens: 2048,
    panelWidth: 420,
    prompts:
      "Summarize | Summarize this in about 200 words, then list the main claims.\n" +
      "Key terms | List the key terms used in a specialized sense. Give the author's working meaning of each, with a short verbatim quote.\n" +
      "Argument | Reconstruct the argument step by step. Quote the sentence that carries each step.",
  };
  const DEFAULT_EXPLAIN = "Explain what this passage is saying.";
  const MODEL_SUGGESTIONS = [
    "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash",
    "gemini-3.5-flash-lite", "gemini-3.1-flash-lite",
  ];

  const SYSTEM_PROMPT =
    "You are a reading companion for an academic researcher working through difficult texts in philosophy, psychoanalysis and theory. " +
    "Work from the document supplied below. Support every claim about what the text says with short verbatim quotations, so the reader can find the wording with the search function. " +
    "When the text does not settle a question, say so plainly. " +
    "Mark any point that comes from outside the document, such as translator conventions, the German or French behind a term, or secondary literature, and never attribute it to the author. " +
    "Do not invent page numbers, citations or quotations. If the extracted text looks garbled or truncated, report that. " +
    "When the user sends a selected passage with no other instruction, explain what the passage is saying: paraphrase it plainly, define technical terms the way this author uses them, and say briefly where it sits in the argument. " +
    "Write plain prose with light formatting only. Do not use em dashes.";

  function parsePrompts(raw) {
    return String(raw || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.indexOf("|");
      return i > 0 ? { label: l.slice(0, i).trim(), prompt: l.slice(i + 1).trim() } : { label: l.slice(0, 28), prompt: l };
    }).filter((p) => p.prompt).slice(0, 12);
  }

  const CSS = `
  #fd-root, #fd-root * { box-sizing: border-box; }
  #fd-root { font: 13px/1.45 system-ui, sans-serif; color-scheme: light dark; }
  #fd-root .fd-fab { position: fixed; right: 18px; bottom: 18px; z-index: 2147483000; padding: 7px 14px; border-radius: 999px;
    border: 1px solid rgba(128,128,128,.5); background: #3b6fd4; color: #fff; cursor: pointer; font: inherit; font-weight: 600; opacity: .94; }
  #fd-root .fd-panel { position: fixed; top: 44px; right: 0; bottom: 0; z-index: 2147483001; display: none; flex-direction: column;
    background: Canvas; color: CanvasText; border-left: 1px solid rgba(128,128,128,.45); user-select: text; }
  #fd-root .fd-panel.fd-open { display: flex; }
  #fd-root .fd-grip { position: absolute; left: -4px; top: 0; bottom: 0; width: 8px; cursor: col-resize; }
  #fd-root .fd-head { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid rgba(128,128,128,.35); }
  #fd-root .fd-title { font-weight: 700; }
  #fd-root .fd-ctx { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: .7; }
  #fd-root button { font: inherit; cursor: pointer; }
  #fd-root .fd-icon { border: none; background: transparent; color: inherit; padding: 2px 6px; opacity: .8; }
  #fd-root .fd-settings { display: none; padding: 8px 10px; gap: 6px; flex-direction: column; border-bottom: 1px solid rgba(128,128,128,.35); overflow-y: auto; max-height: 55%; }
  #fd-root .fd-settings.fd-open { display: flex; }
  #fd-root .fd-settings label { display: flex; flex-direction: column; gap: 2px; font-size: 12px; opacity: .92; }
  #fd-root .fd-hint { font-size: 11.5px; opacity: .7; }
  #fd-root input[type=text], #fd-root input[type=password], #fd-root input[type=number], #fd-root select, #fd-root textarea {
    font: inherit; padding: 5px 7px; border: 1px solid rgba(128,128,128,.55); border-radius: 5px; background: Field; color: FieldText; width: 100%; }
  #fd-root .fd-msgs { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; }
  #fd-root .fd-msg { word-wrap: break-word; padding: 8px 10px; border-radius: 8px; }
  #fd-root .fd-user { background: rgba(128,128,128,.16); white-space: pre-wrap; }
  #fd-root .fd-asst { border: 1px solid rgba(128,128,128,.28); }
  #fd-root .fd-asst .fd-gap { height: 6px; }
  #fd-root .fd-asst .fd-h { font-weight: 700; margin-top: 2px; }
  #fd-root .fd-asst .fd-li { padding-left: 12px; text-indent: -12px; }
  #fd-root .fd-asst code { font-family: monospace; background: rgba(128,128,128,.2); padding: 0 3px; border-radius: 3px; }
  #fd-root .fd-acts { display: flex; gap: 6px; margin-top: 6px; }
  #fd-root .fd-acts button { font-size: 11.5px; padding: 1px 7px; border: 1px solid rgba(128,128,128,.5); border-radius: 4px; background: transparent; color: inherit; opacity: .85; }
  #fd-root .fd-empty { opacity: .6; padding: 6px; }
  #fd-root .fd-quick { display: flex; flex-wrap: wrap; gap: 5px; padding: 0 10px 6px; }
  #fd-root .fd-quick button { font-size: 12px; padding: 2px 9px; border: 1px solid rgba(128,128,128,.55); border-radius: 999px; background: transparent; color: inherit; }
  #fd-root .fd-sel { display: none; margin: 0 10px; padding: 6px 8px; border-left: 3px solid #3b6fd4; background: rgba(59,111,212,.10); font-size: 12px; }
  #fd-root .fd-sel.fd-open { display: block; }
  #fd-root .fd-sel-top { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
  #fd-root .fd-sel-text { max-height: 4.4em; overflow: hidden; opacity: .85; font-style: italic; }
  #fd-root .fd-compose { display: flex; gap: 6px; padding: 10px; align-items: flex-end; }
  #fd-root .fd-send { padding: 7px 12px; border-radius: 6px; border: none; background: #3b6fd4; color: #fff; font-weight: 600; }
  #fd-root .fd-send[disabled] { opacity: .5; cursor: default; }
  #fd-root .fd-stop { display: none; padding: 7px 12px; border-radius: 6px; border: 1px solid rgba(128,128,128,.5); background: transparent; color: inherit; font-weight: 600; }
  #fd-root .fd-cursor { opacity: .55; }
  #fd-root .fd-status { padding: 0 10px 8px; font-size: 12px; min-height: 1.4em; opacity: .8; }
  #fd-root .fd-status.fd-err { color: #d33; opacity: 1; }
  `;

  const state = {
    selection: null,          // { text, itemID }
    chats: new Map(),         // attachment id -> [{ role, content, display, model }]
    docs: new Map(),          // attachment id -> { text, truncated, title }
    windows: new Map(),       // window -> api
    busy: false,
    width: 420,
    geminiCaches: new Map(), // "attId:model:textLen" -> { name, expiresAt }
  };

  // ---------- helpers ----------
  function getPref(key) {
    let v;
    try { v = Zotero.Prefs.get(PREF + key, true); } catch (e) { v = undefined; }
    if (v === undefined || v === null || v === "") {
      try { v = Zotero.Prefs.get(LEGACY_PREF + key, true); } catch (e) { v = undefined; }
    }
    if (v === undefined || v === null || v === "") return DEFAULTS[key] !== undefined ? DEFAULTS[key] : "";
    return v;
  }
  function setPref(key, value) { Zotero.Prefs.set(PREF + key, value, true); }
  function log(msg) { Zotero.debug("[fidoic] " + msg); }
  function keyPrefName(provider) { return provider === "claude" ? "claudeKey" : "geminiKey"; }
  function modelPrefName(provider) { return provider === "claude" ? "claudeModel" : "geminiModel"; }

  function h(doc, tag, props, ...kids) {
    const e = doc.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const kid of kids) if (kid) e.append(kid);
    return e;
  }

  // Minimal, DOM-safe markdown: headings, bullets, numbered lines, **bold**, *italic*, `code`.
  function renderMarkdown(doc, parent, text) {
    const inline = (el, s) => {
      const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
      let last = 0, m;
      while ((m = re.exec(s))) {
        if (m.index > last) el.append(s.slice(last, m.index));
        const tok = m[0];
        if (tok.startsWith("**")) el.append(h(doc, "strong", { text: tok.slice(2, -2) }));
        else if (tok.startsWith("`")) el.append(h(doc, "code", { text: tok.slice(1, -1) }));
        else el.append(h(doc, "em", { text: tok.slice(1, -1) }));
        last = m.index + tok.length;
      }
      if (last < s.length) el.append(s.slice(last));
    };
    for (const raw of String(text).split("\n")) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) parent.append(h(doc, "div", { class: "fd-gap" }));
      else if ((m = line.match(/^#{1,6}\s+(.*)$/))) { const d = h(doc, "div", { class: "fd-h" }); inline(d, m[1]); parent.append(d); }
      else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { const d = h(doc, "div", { class: "fd-li" }); d.append("\u2022 "); inline(d, m[1]); parent.append(d); }
      else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))) { const d = h(doc, "div", { class: "fd-li" }); d.append(m[1] + ". "); inline(d, m[2]); parent.append(d); }
      else { const d = h(doc, "div"); inline(d, line); parent.append(d); }
    }
  }

  // ---------- item and text ----------
  async function currentAttachment(win) {
    try {
      const reader = Zotero.Reader.getByTabID(win.Zotero_Tabs.selectedID);
      if (reader && reader.itemID) {
        const it = Zotero.Items.get(reader.itemID);
        if (it) return it;
      }
    } catch (e) { /* not a reader tab */ }
    const items = win.ZoteroPane && win.ZoteroPane.getSelectedItems ? win.ZoteroPane.getSelectedItems() : [];
    const it = items && items[0];
    if (!it) return null;
    if (it.isAttachment()) return it;
    if (it.isRegularItem()) {
      const best = await it.getBestAttachment();
      return best || null;
    }
    return null;
  }

  function titleOf(att) {
    const parent = att.parentItem;
    return (parent || att).getDisplayTitle();
  }

  async function loadDocument(att) {
    if (state.docs.has(att.id)) return state.docs.get(att.id);
    let text = "";
    try { text = await att.attachmentText; } catch (e) { log("attachmentText failed: " + e); }
    if (!text) {
      try {
        await Zotero.Fulltext.indexItems([att.id]);
        text = await att.attachmentText;
      } catch (e) { log("indexing failed: " + e); }
    }
    if (!text || !text.trim()) {
      throw new Error("No extractable text in this attachment. Scanned PDFs need OCR first.");
    }
    const max = Number(getPref("maxChars")) || DEFAULTS.maxChars;
    const truncated = text.length > max;
    const d = { text: truncated ? text.slice(0, max) : text, truncated, title: titleOf(att) };
    state.docs.set(att.id, d);
    return d;
  }

  function docBlockOf(d) {
    return "Title of the text the user is reading: " + d.title + "\n" +
      (d.truncated ? "Note: the text below was cut off at a length limit and is incomplete.\n" : "") +
      "\n<document>\n" + d.text + "\n</document>";
  }

  // ---------- providers ----------
  // Buffered (non-streaming) HTTP, used only as a fallback if this Zotero build has no `fetch`.
  async function postJSON(url, headers, body) {
    try {
      const xhr = await Zotero.HTTP.request("POST", url, {
        headers: Object.assign({ "content-type": "application/json" }, headers),
        body: JSON.stringify(body),
        responseType: "text",
        timeout: 240000,
      });
      return JSON.parse(xhr.responseText);
    } catch (e) {
      let detail = e && e.message ? e.message : String(e);
      let status = e && e.xmlhttp ? e.xmlhttp.status : 0;
      try {
        const j = JSON.parse(e.xmlhttp.responseText);
        if (j && j.error && j.error.message) detail = j.error.message;
      } catch (_) { /* keep detail */ }
      const err = new Error(detail);
      err.status = status;
      throw err;
    }
  }

  function mkError(message, extra) {
    const err = new Error(message);
    if (extra) Object.assign(err, extra);
    return err;
  }

  // Reads a POST response as a server-sent-events stream and calls onEvent(parsedJSON) per event.
  // Used for both providers: Claude and Gemini each frame their stream as `data: {...}\n\n` lines.
  async function streamSSE(url, headers, body, signal, onEvent) {
    const resp = await fetch(url, {
      method: "POST",
      headers: Object.assign({ "content-type": "application/json" }, headers),
      body: JSON.stringify(body),
      signal,
    });
    if (!resp.ok || !resp.body) {
      let text = "";
      try { text = await resp.text(); } catch (e) { /* ignore */ }
      let detail = text;
      try {
        const j = JSON.parse(text);
        if (j && j.error && j.error.message) detail = j.error.message;
      } catch (e) { /* keep raw text */ }
      throw mkError(detail || ("HTTP " + resp.status), { status: resp.status });
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const rawEvent = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const dataLine = rawEvent.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const payload = dataLine.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let parsed;
        try { parsed = JSON.parse(payload); } catch (e) { continue; }
        onEvent(parsed);
      }
    }
  }

  // ----- Claude -----
  async function callClaudeBuffered({ apiKey, model, d, messages, maxOutputTokens }) {
    const data = await postJSON(CLAUDE_URL, {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    }, {
      model,
      max_tokens: maxOutputTokens,
      system: [
        { type: "text", text: SYSTEM_PROMPT },
        { type: "text", text: docBlockOf(d), cache_control: { type: "ephemeral" } },
      ],
      messages,
    });
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    if (!text) throw new Error("The API returned no text.");
    return text;
  }

  async function streamClaude({ apiKey, model, d, messages, maxOutputTokens, onDelta, signal }) {
    let text = "";
    try {
      await streamSSE(CLAUDE_URL, {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      }, {
        model,
        max_tokens: maxOutputTokens,
        stream: true,
        // Anthropic's prompt cache: the paper text is marked cacheable, so a follow-up
        // question about the same paper does not re-bill or re-transmit it in full.
        system: [
          { type: "text", text: SYSTEM_PROMPT },
          { type: "text", text: docBlockOf(d), cache_control: { type: "ephemeral" } },
        ],
        messages,
      }, signal, (evt) => {
        if (evt.type === "content_block_delta" && evt.delta && evt.delta.type === "text_delta") {
          text += evt.delta.text;
          onDelta(evt.delta.text, text);
        }
      });
    } catch (e) {
      if (text) throw mkError(e && e.message, { name: e && e.name, status: e && e.status, partialText: text });
      throw e;
    }
    if (!text) throw new Error("The API returned no text.");
    return { text, model };
  }

  // ----- Gemini -----
  async function createGeminiCache(apiKey, model, d) {
    try {
      const data = await postJSON(GEMINI_ROOT + "cachedContents", { "x-goog-api-key": apiKey }, {
        model: "models/" + model,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT + "\n\n" + docBlockOf(d) }] },
        ttl: GEMINI_CACHE_TTL_SECONDS + "s",
      });
      return data && data.name ? data.name : null;
    } catch (e) {
      // Common and harmless: very short papers fall under Gemini's minimum cacheable size.
      log("Gemini cache not created (" + (e && e.message) + "); sending the paper text inline instead.");
      return null;
    }
  }

  async function getOrCreateGeminiCache(apiKey, model, att, d) {
    const key = att.id + ":" + model + ":" + d.text.length;
    const entry = state.geminiCaches.get(key);
    if (entry && Date.now() < entry.expiresAt) return entry.name;
    const name = await createGeminiCache(apiKey, model, d);
    if (name) state.geminiCaches.set(key, { name, expiresAt: Date.now() + (GEMINI_CACHE_TTL_SECONDS - 300) * 1000 });
    else state.geminiCaches.delete(key);
    return name;
  }

  function forgetGeminiCache(att, model, d) {
    state.geminiCaches.delete(att.id + ":" + model + ":" + d.text.length);
  }

  function geminiContentsOf(messages) {
    return messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  }

  async function geminiOnceBuffered({ apiKey, model, d, messages, maxOutputTokens }) {
    const data = await postJSON(GEMINI_BASE + encodeURIComponent(model) + ":generateContent", { "x-goog-api-key": apiKey }, {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT + "\n\n" + docBlockOf(d) }] },
      contents: geminiContentsOf(messages),
      generationConfig: { maxOutputTokens },
    });
    const cand = data.candidates && data.candidates[0];
    const text = cand && cand.content && cand.content.parts
      ? cand.content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("")
      : "";
    if (!text) {
      const why = (data.promptFeedback && data.promptFeedback.blockReason) || (cand && cand.finishReason) || "unknown reason";
      throw new Error("Gemini returned no text (" + why + ").");
    }
    return text;
  }

  async function callGeminiBuffered({ apiKey, model, fallback, d, messages, maxOutputTokens }) {
    try {
      return { text: await geminiOnceBuffered({ apiKey, model, d, messages, maxOutputTokens }), model };
    } catch (e) {
      if (e.status === 429 && fallback && fallback !== model) {
        const text = await geminiOnceBuffered({ apiKey, model: fallback, d, messages, maxOutputTokens });
        return { text, model: fallback, usedFallback: true, primary: model };
      }
      throw e;
    }
  }

  async function streamGeminiAttempt({ apiKey, model, cacheName, d, messages, maxOutputTokens, onDelta, signal }) {
    const url = GEMINI_BASE + encodeURIComponent(model) + ":streamGenerateContent?alt=sse";
    const body = { generationConfig: { maxOutputTokens }, contents: geminiContentsOf(messages) };
    if (cacheName) body.cachedContent = cacheName;
    else body.systemInstruction = { parts: [{ text: SYSTEM_PROMPT + "\n\n" + docBlockOf(d) }] };
    let text = "";
    try {
      await streamSSE(url, { "x-goog-api-key": apiKey }, body, signal, (evt) => {
        const cand = evt.candidates && evt.candidates[0];
        const parts = cand && cand.content && cand.content.parts;
        if (!parts) return;
        for (const p of parts) {
          if (p.text && !p.thought) { text += p.text; onDelta(p.text, text); }
        }
      });
    } catch (e) {
      if (text) throw mkError(e && e.message, { name: e && e.name, status: e && e.status, partialText: text });
      throw e;
    }
    if (!text) throw new Error("Gemini returned no text.");
    return text;
  }

  async function streamGemini({ apiKey, model, fallback, att, d, messages, maxOutputTokens, onDelta, signal }) {
    let cache = null;
    try { cache = await getOrCreateGeminiCache(apiKey, model, att, d); } catch (e) { /* proceed without cache */ }

    try {
      const text = await streamGeminiAttempt({ apiKey, model, cacheName: cache, d, messages, maxOutputTokens, onDelta, signal });
      return { text, model };
    } catch (e) {
      // A cache can outlive our bookkeeping (evicted early, etc). Retry once with the paper sent inline.
      if (cache && !e.partialText && /cach/i.test(String(e.message || ""))) {
        forgetGeminiCache(att, model, d);
        const text = await streamGeminiAttempt({ apiKey, model, cacheName: null, d, messages, maxOutputTokens, onDelta, signal });
        return { text, model };
      }
      if (e.status === 429 && fallback && fallback !== model && !e.partialText) {
        const text = await streamGeminiAttempt({ apiKey, model: fallback, cacheName: null, d, messages, maxOutputTokens, onDelta, signal });
        return { text, model: fallback, usedFallback: true, primary: model };
      }
      throw e;
    }
  }

  // Streams when this Zotero build has `fetch` (expected on Zotero 7+); otherwise falls back
  // to a single buffered request so the plugin still works, just without live text.
  async function streamAsk(d, chat, att, onDelta, signal) {
    const provider = String(getPref("provider"));
    const apiKey = String(getPref(keyPrefName(provider)) || "").trim();
    const model = String(getPref(modelPrefName(provider)));
    const maxOutputTokens = Number(getPref("maxOutputTokens")) || DEFAULTS.maxOutputTokens;
    const messages = chat.map((m) => ({ role: m.role, content: m.content }));

    if (typeof fetch !== "function") {
      if (provider === "claude") return { text: await callClaudeBuffered({ apiKey, model, d, messages, maxOutputTokens }), model };
      return callGeminiBuffered({ apiKey, model, fallback: String(getPref("geminiFallback")), d, messages, maxOutputTokens });
    }
    if (provider === "claude") return streamClaude({ apiKey, model, d, messages, maxOutputTokens, onDelta, signal });
    return streamGemini({ apiKey, model, fallback: String(getPref("geminiFallback")), att, d, messages, maxOutputTokens, onDelta, signal });
  }

  // ---------- notes ----------
  async function saveAsNote(win, att, text, meta) {
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const paras = text.split(/\n{2,}/).map((p) => "<p>" + esc(p).replace(/\n/g, "<br/>") + "</p>").join("");
    const note = new Zotero.Item("note");
    note.libraryID = att.libraryID;
    if (att.parentItemID) note.parentID = att.parentItemID;
    else {
      try {
        // Zotero 10 removed getSelectedCollection() (multi-select); use the plural getter when present
        const zp = win.ZoteroPane;
        const cols = zp.getSelectedCollections ? zp.getSelectedCollections() : [zp.getSelectedCollection()];
        if (cols && cols.length === 1 && cols[0]) note.addToCollection(cols[0].id);
      } catch (e) { /* no collection */ }
    }
    note.setNote("<h3>AI reading note</h3><p><i>" + esc(meta) + ". Generated text. Check quotations against the source before citing.</i></p>" + paras);
    await note.saveTx();
  }

  // ---------- UI ----------
  function addToWindow(win) {
    if (state.windows.has(win)) return;
    const doc = win.document;
    if (!doc || doc.getElementById("fd-root")) return;
    state.width = Number(getPref("panelWidth")) || DEFAULTS.panelWidth;

    const style = h(doc, "style", { id: "fd-style" });
    style.textContent = CSS;

    const ctx = h(doc, "span", { class: "fd-ctx", text: "No text open" });
    const msgs = h(doc, "div", { class: "fd-msgs" });
    const status = h(doc, "div", { class: "fd-status" });

    // settings
    const providerSel = h(doc, "select", {},
      h(doc, "option", { value: "gemini", text: "Google Gemini (free tier available)" }),
      h(doc, "option", { value: "claude", text: "Anthropic Claude (paid API)" }));
    const keyInput = h(doc, "input", { type: "password", placeholder: "API key" });
    const modelList = h(doc, "datalist", { id: "fd-models" });
    for (const m of MODEL_SUGGESTIONS) modelList.append(h(doc, "option", { value: m }));
    const modelInput = h(doc, "input", { type: "text", list: "fd-models" });
    const fallbackInput = h(doc, "input", { type: "text", list: "fd-models" });
    const fallbackLabel = h(doc, "label", { text: "Fallback model when the main one hits its free limit (429)" }, fallbackInput);
    const maxCharsInput = h(doc, "input", { type: "number", min: "10000", step: "10000" });
    const maxTokensInput = h(doc, "input", { type: "number", min: "256", step: "256" });
    const promptsInput = h(doc, "textarea", { rows: "5", placeholder: "Label | prompt   (one per line)" });
    const keyHint = h(doc, "div", { class: "fd-hint" });
    const saveBtn = h(doc, "button", { class: "fd-send", text: "Save" });
    const settings = h(doc, "div", { class: "fd-settings" },
      h(doc, "label", { text: "Provider" }, providerSel),
      h(doc, "label", { text: "API key (stored locally in Zotero prefs)" }, keyInput),
      keyHint,
      h(doc, "label", { text: "Model" }, modelInput), modelList,
      fallbackLabel,
      h(doc, "label", { text: "Prompt buttons, one per line as: Label | prompt" }, promptsInput),
      h(doc, "label", { text: "Max characters of paper text sent (lower reads faster and costs less)" }, maxCharsInput),
      h(doc, "label", { text: "Max reply length in tokens (lower answers faster and costs less)" }, maxTokensInput),
      h(doc, "div", { class: "fd-hint", text: "Free Gemini tier: Google may use your prompts and the paper text to improve its products. Keep unpublished or sensitive material out, or use a paid key or Claude." }),
      saveBtn);

    // selection chip
    const selCheck = h(doc, "input", { type: "checkbox" });
    selCheck.checked = true;
    const selText = h(doc, "div", { class: "fd-sel-text" });
    const selClear = h(doc, "button", { class: "fd-icon", title: "Discard selection", text: "\u00d7" });
    const sel = h(doc, "div", { class: "fd-sel" },
      h(doc, "div", { class: "fd-sel-top" }, selCheck, h(doc, "span", { text: "Attach selected passage" }), selClear),
      selText);

    const quick = h(doc, "div", { class: "fd-quick" });
    const input = h(doc, "textarea", { rows: "3", placeholder: "Ask about the text. Ctrl/Cmd+Enter sends." });
    const sendBtn = h(doc, "button", { class: "fd-send", text: "Send" });
    const stopBtn = h(doc, "button", { class: "fd-stop", text: "Stop" });

    const gear = h(doc, "button", { class: "fd-icon", title: "Settings", text: "\u2699" });
    const clearBtn = h(doc, "button", { class: "fd-icon", title: "Clear this conversation", text: "Clear" });
    const closeBtn = h(doc, "button", { class: "fd-icon", title: "Close", text: "\u00d7" });
    const grip = h(doc, "div", { class: "fd-grip", title: "Drag to resize" });

    const panel = h(doc, "div", { class: "fd-panel" },
      grip,
      h(doc, "div", { class: "fd-head" }, h(doc, "span", { class: "fd-title", text: "fidoic" }), ctx, gear, clearBtn, closeBtn),
      settings, msgs, quick, sel,
      h(doc, "div", { class: "fd-compose" }, input, sendBtn, stopBtn),
      status);

    const fab = h(doc, "button", { class: "fd-fab", title: "Open fidoic", text: "fidoic" });
    const root = h(doc, "div", { id: "fd-root" }, fab, panel);

    (doc.head || doc.documentElement).append(style);
    doc.documentElement.append(root);

    const deck = doc.getElementById("tabs-deck"); // Zotero's reader/library deck; used to dock the panel

    let currentAtt = null;
    let timer = null;

    function setStatus(text, isErr) {
      status.textContent = text || "";
      status.className = "fd-status" + (isErr ? " fd-err" : "");
    }

    function applyDock(isOpen) {
      panel.style.width = state.width + "px";
      if (deck) {
        if (isOpen) {
          const top = Math.max(0, Math.round(deck.getBoundingClientRect().top));
          panel.style.top = top + "px";
          deck.style.marginRight = state.width + "px";
        } else {
          deck.style.marginRight = "";
        }
      } else {
        panel.style.top = "44px"; // overlay fallback
      }
    }

    function fillSettings() {
      const provider = providerSel.value;
      keyInput.value = String(getPref(keyPrefName(provider)) || "");
      modelInput.value = String(getPref(modelPrefName(provider)));
      fallbackInput.value = String(getPref("geminiFallback"));
      fallbackLabel.style.display = provider === "gemini" ? "" : "none";
      keyHint.textContent = provider === "gemini"
        ? "Free key: aistudio.google.com/apikey. Daily and per-minute limits depend on the model; check yours in AI Studio."
        : "Key from console.anthropic.com. API use is billed separately from a claude.ai plan.";
      maxCharsInput.value = String(getPref("maxChars"));
      maxTokensInput.value = String(getPref("maxOutputTokens"));
      promptsInput.value = String(getPref("prompts")).trim();
    }

    function renderQuick() {
      quick.replaceChildren();
      for (const q of parsePrompts(getPref("prompts"))) {
        quick.append(h(doc, "button", {
          text: q.label,
          title: q.prompt,
          onclick: () => { input.value = q.prompt; send(); },
        }));
      }
    }

    function renderMessages() {
      msgs.replaceChildren();
      const chat = currentAtt ? state.chats.get(currentAtt.id) || [] : [];
      if (!chat.length) {
        msgs.append(h(doc, "div", { class: "fd-empty", text: "fidoic reads the paper you have open. Ask a question, use a prompt button, or select a passage in the reader and click Ask fidoic." }));
      }
      for (const m of chat) {
        if (m.role === "user") {
          msgs.append(h(doc, "div", { class: "fd-msg fd-user", text: m.display || m.content }));
        } else {
          const box = h(doc, "div", { class: "fd-msg fd-asst" });
          renderMarkdown(doc, box, m.content);
          const attRef = currentAtt;
          box.append(h(doc, "div", { class: "fd-acts" },
            h(doc, "button", {
              text: "Save as note",
              onclick: async (ev) => {
                try {
                  await saveAsNote(win, attRef, m.content, "Model: " + (m.model || "unknown") + ", " + new Date().toISOString().slice(0, 10));
                  ev.target.textContent = "Saved";
                } catch (e) { setStatus("Could not save note: " + (e.message || e), true); }
              },
            }),
            h(doc, "button", {
              text: "Copy",
              onclick: (ev) => {
                try { Zotero.Utilities.Internal.copyTextToClipboard(m.content); ev.target.textContent = "Copied"; }
                catch (e) { setStatus("Copy failed.", true); }
              },
            })));
          msgs.append(box);
        }
      }
      msgs.scrollTop = msgs.scrollHeight;
    }

    function renderSelection() {
      if (state.selection && state.selection.text) {
        const t = state.selection.text.replace(/\s+/g, " ").trim();
        selText.textContent = t.length > 400 ? t.slice(0, 400) + "..." : t;
        sel.classList.add("fd-open");
      } else {
        sel.classList.remove("fd-open");
      }
    }

    // read the paper as soon as it is in view, so the first question needs no setup and problems show early
    async function preload(att) {
      try {
        const info = await loadDocument(att);
        if (currentAtt && currentAtt.id === att.id && !state.busy) {
          const words = info.text.split(/\s+/).filter(Boolean).length;
          setStatus("Read " + words.toLocaleString("en-US") + " words" + (info.truncated ? " (cut at the character limit)" : "") + ".");
        }
      } catch (e) {
        if (currentAtt && currentAtt.id === att.id && !state.busy) setStatus(e && e.message ? e.message : String(e), true);
      }
    }

    async function refreshContext() {
      try {
        const att = await currentAttachment(win);
        const changed = (att && att.id) !== (currentAtt && currentAtt.id);
        currentAtt = att;
        ctx.textContent = att ? titleOf(att) : "No text open";
        ctx.title = ctx.textContent;
        if (changed) {
          renderMessages();
          if (att) preload(att);
        }
      } catch (e) { log("refreshContext: " + e); }
    }

    function open() {
      panel.classList.add("fd-open");
      fab.style.display = "none";
      applyDock(true);
      renderSelection();
      refreshContext();
      if (!timer) timer = win.setInterval(refreshContext, 1500);
      input.focus();
    }
    function close() {
      panel.classList.remove("fd-open");
      fab.style.display = "";
      applyDock(false);
      if (timer) { win.clearInterval(timer); timer = null; }
    }

    let currentAbort = null;
    function setSending(isSending) {
      sendBtn.style.display = isSending ? "none" : "";
      stopBtn.style.display = isSending ? "" : "none";
      input.disabled = isSending;
    }

    async function send() {
      if (state.busy) return;
      const hasSel = !!(state.selection && state.selection.text && selCheck.checked);
      const question = input.value.trim() || (hasSel ? DEFAULT_EXPLAIN : "");
      if (!question) return;
      const provider = String(getPref("provider"));
      const apiKey = String(getPref(keyPrefName(provider)) || "").trim();
      if (!apiKey) {
        providerSel.value = provider;
        fillSettings();
        settings.classList.add("fd-open");
        setStatus("Enter an API key first.", true);
        return;
      }
      await refreshContext();
      if (!currentAtt) { setStatus("Open a PDF in the reader, or select an item that has one.", true); return; }
      const att = currentAtt;

      state.busy = true;
      setSending(true);
      setStatus("Reading the text...");
      let chat = state.chats.get(att.id);
      if (!chat) { chat = []; state.chats.set(att.id, chat); }

      let content = question, display = question, usedSelection = false;
      if (hasSel) {
        content = 'Selected passage:\n"""\n' + state.selection.text + '\n"""\n\n' + question;
        display = "[Selected passage attached]\n" + question;
        usedSelection = true;
      }
      chat.push({ role: "user", content, display });
      input.value = "";
      if (usedSelection) { state.selection = null; renderSelection(); } // it now lives in the chat history
      renderMessages();

      // A live bubble the streamed answer fills in as it arrives, ahead of state.chats,
      // which only gets the finished text once the stream ends.
      const liveInner = h(doc, "div", { class: "fd-live-text" });
      const liveBox = h(doc, "div", { class: "fd-msg fd-asst" }, liveInner);
      msgs.append(liveBox);
      msgs.scrollTop = msgs.scrollHeight;
      const onDelta = (_chunk, full) => {
        setStatus("Answering...");
        liveInner.textContent = full;
        liveInner.append(h(doc, "span", { class: "fd-cursor", text: "\u258c" }));
        msgs.scrollTop = msgs.scrollHeight;
      };

      const abort = typeof AbortController === "function" ? new AbortController() : null;
      currentAbort = abort;
      try {
        const docInfo = await loadDocument(att);
        const res = await streamAsk(docInfo, chat, att, onDelta, abort && abort.signal);
        chat.push({ role: "assistant", content: res.text, display: res.text, model: res.model });
        renderMessages();
        if (res.usedFallback) setStatus("Main model hit its limit; answered with " + res.model + ".");
        else setStatus(docInfo.truncated ? "Note: the paper text was cut at the character limit." : "");
      } catch (e) {
        liveBox.remove();
        if (e && e.name === "AbortError" && e.partialText) {
          chat.push({ role: "assistant", content: e.partialText, display: e.partialText, model: "stopped early" });
          renderMessages();
          setStatus("Stopped.");
        } else if (e && e.name === "AbortError") {
          if (chat.length && chat[chat.length - 1].role === "user") chat.pop();
          renderMessages();
          setStatus("Stopped.");
        } else {
          // drop an unanswered user turn so the next request stays valid
          if (chat.length && chat[chat.length - 1].role === "user") chat.pop();
          renderMessages();
          let msg = e && e.message ? e.message : String(e);
          if (e && e.status === 429) msg = "Rate limit reached (" + msg + "). Wait a minute, switch model in settings, or try again after midnight Pacific if the daily quota is used up.";
          setStatus(msg, true);
        }
      } finally {
        state.busy = false;
        setSending(false);
        currentAbort = null;
      }
    }

    fab.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    gear.addEventListener("click", () => {
      providerSel.value = String(getPref("provider"));
      fillSettings();
      settings.classList.toggle("fd-open");
    });
    providerSel.addEventListener("change", fillSettings);
    saveBtn.addEventListener("click", () => {
      const provider = providerSel.value;
      setPref("provider", provider);
      setPref(keyPrefName(provider), keyInput.value.trim());
      setPref(modelPrefName(provider), modelInput.value.trim() || DEFAULTS[modelPrefName(provider)]);
      if (provider === "gemini") setPref("geminiFallback", fallbackInput.value.trim());
      setPref("maxChars", Number(maxCharsInput.value) || DEFAULTS.maxChars);
      setPref("maxOutputTokens", Number(maxTokensInput.value) || DEFAULTS.maxOutputTokens);
      setPref("prompts", promptsInput.value.trim() || " "); // a single space means "no prompt buttons"
      renderQuick();
      state.docs.clear(); // text limit may have changed, so cached Gemini content built on the old text is stale too
      state.geminiCaches.clear();
      settings.classList.remove("fd-open");
      setStatus("Settings saved.");
    });
    clearBtn.addEventListener("click", () => {
      if (currentAtt) state.chats.delete(currentAtt.id);
      renderMessages();
      setStatus("");
    });
    selClear.addEventListener("click", () => { state.selection = null; renderSelection(); });
    sendBtn.addEventListener("click", () => send());
    stopBtn.addEventListener("click", () => { if (currentAbort) currentAbort.abort(); });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); send(); }
    });

    // drag-to-resize
    grip.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      if (deck) deck.style.pointerEvents = "none"; // let the drag cross the reader iframe
      const move = (e) => {
        const max = Math.max(320, Math.min(900, win.innerWidth - 300));
        state.width = Math.max(300, Math.min(max, win.innerWidth - e.clientX));
        applyDock(true);
      };
      const up = () => {
        doc.removeEventListener("mousemove", move);
        doc.removeEventListener("mouseup", up);
        if (deck) deck.style.pointerEvents = "";
        setPref("panelWidth", state.width);
      };
      doc.addEventListener("mousemove", move);
      doc.addEventListener("mouseup", up);
    });

    renderQuick();
    renderMessages();
    function askFromSelection() {
      selCheck.checked = true;
      open();
      send(); // typed prompt if there is one, otherwise "explain what this passage is saying"
    }

    state.windows.set(win, {
      open,
      askFromSelection,
      renderSelection,
      remove() {
        if (timer) win.clearInterval(timer);
        if (deck) { deck.style.marginRight = ""; deck.style.pointerEvents = ""; }
        root.remove();
        style.remove();
      },
    });
  }

  function removeFromWindow(win) {
    const api = state.windows.get(win);
    if (api) { api.remove(); state.windows.delete(win); }
  }

  function onSelectionPopup(event) {
    const { reader, doc, params, append } = event;
    const text = params && params.annotation && params.annotation.text;
    if (!text) return;
    state.selection = { text, itemID: reader && reader.itemID };
    for (const api of state.windows.values()) api.renderSelection();
    const btn = doc.createElement("button");
    btn.textContent = "Ask fidoic";
    btn.setAttribute("style", "margin:6px 8px;padding:4px 10px;cursor:pointer;border-radius:5px;border:1px solid rgba(128,128,128,.5);");
    btn.addEventListener("click", () => {
      state.selection = { text, itemID: reader && reader.itemID };
      for (const api of state.windows.values()) api.askFromSelection();
    });
    append(btn);
  }

  return {
    init() {
      Zotero.Reader.registerEventListener("renderTextSelectionPopup", onSelectionPopup, pluginID);
      for (const win of Zotero.getMainWindows()) addToWindow(win);
    },
    destroy() {
      for (const win of Array.from(state.windows.keys())) removeFromWindow(win);
    },
    addToWindow,
    removeFromWindow,
  };
}
