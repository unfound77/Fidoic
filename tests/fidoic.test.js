const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function makeWin() {
  const dom = new JSDOM(`<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body><div id="tabs-deck"></div></body></html>`, { contentType: "application/xhtml+xml" });
  const win = dom.window;
  win.Zotero_Tabs = { selectedID: "t" };
  win.ZoteroPane = { getSelectedItems: () => [], getSelectedCollection() { throw new Error("removed"); }, getSelectedCollections: () => [] };
  win.innerWidth = 1400;
  win.AbortController = global.AbortController;
  return win;
}

const bigText = "The unconscious is structured like a language. ".repeat(400);
const att = { id: 7, libraryID: 1, parentItemID: null, isAttachment: () => true, isRegularItem: () => false, parentItem: null, getDisplayTitle: () => "Ecrits", get attachmentText() { return Promise.resolve(bigText); } };

const prefs = {};
const httpCalls = [];
const fetchCalls = [];
const registered = {};
const mode = { cacheFails: false, rateLimit429: false, badCacheOnce: false, geminiEvents: null, claudeEvents: null };

function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new DOMException("aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    if (signal) signal.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("aborted", "AbortError")); }, { once: true });
  });
}
function sseStream(events, signal) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for (const evt of events) {
        if (evt === "__HANG__") { await abortableDelay(24 * 60 * 60 * 1000, signal); continue; }
        await abortableDelay(4, signal);
        controller.enqueue(encoder.encode("data: " + JSON.stringify(evt) + "\n\n"));
      }
      controller.close();
    },
  });
}

let win;
global.Zotero = {
  initializationPromise: Promise.resolve(), uiReadyPromise: Promise.resolve(),
  Prefs: { get: (k) => prefs[k], set: (k, v) => { prefs[k] = v; } }, debug() {}, getMainWindows: () => [win],
  Items: { get: () => att }, Utilities: { Internal: { copyTextToClipboard() {} } },
  Item: class { setNote() {} async saveTx() {} },
  Reader: { getByTabID: () => ({ itemID: 7 }), registerEventListener: (t, fn) => { registered[t] = fn; } },
  Fulltext: { indexItems: async () => {} },
  HTTP: {
    request: async (m, url, opts) => {
      httpCalls.push({ url, body: JSON.parse(opts.body) });
      if (url.endsWith("/cachedContents")) {
        if (mode.cacheFails) throw Object.assign(new Error("content too small"), { xmlhttp: { status: 400, responseText: '{"error":{"message":"content too small"}}' } });
        return { responseText: JSON.stringify({ name: "cachedContents/abc123" }) };
      }
      return { responseText: JSON.stringify({ candidates: [{ content: { parts: [{ text: "buffered answer" }] } }] }) };
    },
  },
};
global.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  fetchCalls.push({ url, body, headers: opts.headers });
  if (mode.rateLimit429 && url.includes("gemini-3.8-flash:")) {
    return { ok: false, status: 429, body: null, text: async () => JSON.stringify({ error: { message: "Quota exceeded" } }) };
  }
  if (mode.badCacheOnce && body.cachedContent) {
    mode.badCacheOnce = false;
    return { ok: false, status: 404, body: null, text: async () => JSON.stringify({ error: { message: "Cached content not found" } }) };
  }
  if (url.includes("generativelanguage")) {
    const events = mode.geminiEvents || [
      { candidates: [{ content: { parts: [{ text: "The " }] } }] },
      { candidates: [{ content: { parts: [{ text: "letter " }] } }] },
      { candidates: [{ content: { parts: [{ text: "arrives." }] } }] },
    ];
    return { ok: true, status: 200, body: sseStream(events, opts.signal), text: async () => "" };
  }
  const events = mode.claudeEvents || [
    { type: "content_block_delta", delta: { type: "text_delta", text: "Yes, " } },
    { type: "content_block_delta", delta: { type: "text_delta", text: "**always**." } },
    { type: "message_stop" },
  ];
  return { ok: true, status: 200, body: sseStream(events, opts.signal), text: async () => "" };
};

(0, eval)(fs.readFileSync(path.join(__dirname, "..", "bootstrap.js"), "utf8") + "\nglobalThis.__b = { startup, shutdown };");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); if (!c) process.exitCode = 1; };

async function freshSession() {
  win = makeWin();
  prefs["extensions.fidoic.provider"] = undefined; delete prefs["extensions.fidoic.provider"];
  prefs["extensions.fidoic.geminiKey"] = "AIza-test";
  mode.geminiEvents = null; mode.claudeEvents = null; mode.rateLimit429 = false; mode.badCacheOnce = false; mode.cacheFails = false;
  fetchCalls.length = 0; httpCalls.length = 0;
  await __b.startup({ id: "fidoic@local.invalid" });
  const d = win.document;
  d.querySelector(".fd-fab").click();
  await wait(20);
  return d;
}

(async () => {
  // ===== SESSION A: streaming, caching, fallback, abort, provider switch =====
  let d = await freshSession();

  d.querySelector(".fd-compose textarea").value = "What does the letter do?";
  d.querySelector(".fd-compose .fd-send").click();
  await wait(10);
  ok("stop button shows while streaming", d.querySelector(".fd-stop").style.display !== "none");
  await wait(60);
  ok("cache created on first turn", httpCalls.filter((c) => c.url.endsWith("/cachedContents")).length === 1);
  let gc1 = fetchCalls[fetchCalls.length - 1];
  ok("first gemini call uses the cache, no inline doc", gc1.body.cachedContent === "cachedContents/abc123" && !gc1.body.systemInstruction);
  ok("streamed text assembled correctly", [...d.querySelectorAll(".fd-asst")][0].textContent.includes("The letter arrives."));
  ok("stop button hidden again after completion", d.querySelector(".fd-stop").style.display === "none");
  ok("gemini generationConfig used the configured token cap", gc1.body.generationConfig.maxOutputTokens === 2048);

  d.querySelector(".fd-compose textarea").value = "And why?";
  d.querySelector(".fd-compose .fd-send").click();
  await wait(60);
  ok("cache reused on second turn (no new create call)", httpCalls.filter((c) => c.url.endsWith("/cachedContents")).length === 1);
  let gc2 = fetchCalls[fetchCalls.length - 1];
  ok("second turn still references the cache", gc2.body.cachedContent === "cachedContents/abc123");
  ok("second turn conversation includes prior turns", gc2.body.contents.length === 3);

  mode.badCacheOnce = true;
  d.querySelector(".fd-compose textarea").value = "One more?";
  d.querySelector(".fd-compose .fd-send").click();
  await wait(80);
  let inlineRetry = fetchCalls[fetchCalls.length - 1];
  ok("stale cache retried inline with the doc text", !inlineRetry.body.cachedContent && inlineRetry.body.systemInstruction.parts[0].text.includes("<document>"));
  ok("answer still arrived after the stale-cache retry", d.querySelectorAll(".fd-asst").length === 3);

  mode.rateLimit429 = true;
  d.querySelector(".fd-compose textarea").value = "Ask again";
  d.querySelector(".fd-compose .fd-send").click();
  await wait(80);
  mode.rateLimit429 = false;
  ok("429 falls back to the lighter model", fetchCalls[fetchCalls.length - 1].url.includes("gemini-3.5-flash-lite:"));
  ok("status line names the fallback model", /answered with gemini-3.5-flash-lite/.test(d.querySelector(".fd-status").textContent));

  mode.geminiEvents = [{ candidates: [{ content: { parts: [{ text: "Partial " }] } }] }, "__HANG__"];
  d.querySelector(".fd-compose textarea").value = "Long one";
  d.querySelector(".fd-compose .fd-send").click();
  await wait(15);
  d.querySelector(".fd-stop").click();
  await wait(30);
  ok("aborted turn keeps the partial answer", [...d.querySelectorAll(".fd-asst")].pop().textContent.includes("Partial"));
  ok("status says stopped", d.querySelector(".fd-status").textContent === "Stopped.");
  mode.geminiEvents = null;

  mode.geminiEvents = ["__HANG__"];
  const userCountBefore = d.querySelectorAll(".fd-user").length;
  d.querySelector(".fd-compose textarea").value = "abort me immediately";
  d.querySelector(".fd-compose .fd-send").click();
  await wait(5);
  d.querySelector(".fd-stop").click();
  await wait(20);
  ok("empty abort reverts the question", d.querySelectorAll(".fd-user").length === userCountBefore);
  mode.geminiEvents = null;

  d.querySelector(".fd-icon[title=Settings]").click();
  const sel = d.querySelector(".fd-settings select"); sel.value = "claude"; sel.dispatchEvent(new win.Event("change"));
  d.querySelector(".fd-settings input[type=password]").value = "sk-ant-x";
  d.querySelector(".fd-settings .fd-send").click();
  d.querySelector(".fd-compose textarea").value = "Claude, does it always arrive?";
  d.querySelector(".fd-compose .fd-send").click();
  await wait(60);
  const claudeCall = fetchCalls[fetchCalls.length - 1];
  ok("claude call streams with prompt caching on the doc block", claudeCall.body.stream === true && claudeCall.body.system[1].cache_control.type === "ephemeral");
  ok("claude streamed markdown renders bold", !![...d.querySelectorAll(".fd-asst")].pop().querySelector("strong"));
  ok("maxOutputTokens setting persisted at its default", prefs["extensions.fidoic.maxOutputTokens"] === 2048);

  __b.shutdown();
  ok("session A cleans up", !d.getElementById("fd-root"));

  // ===== SESSION B: fresh instance -- popups, quick prompts, no-text-layer =====
  d = await freshSession();

  let popupBtn;
  registered.renderTextSelectionPopup({ reader: { itemID: 7 }, doc: d, params: { annotation: { text: "the letter always arrives" } }, append: (e) => (popupBtn = e) });
  popupBtn.click();
  await wait(60);
  let last = fetchCalls[fetchCalls.length - 1];
  let lastText = () => last.body.contents.slice(-1)[0].parts[0].text;
  ok("popup with empty box explains the selection", fetchCalls.length === 1 && lastText().includes("the letter always arrives") && lastText().endsWith("Explain what this passage is saying."));

  d.querySelector(".fd-compose textarea").value = "Why does it always arrive?";
  registered.renderTextSelectionPopup({ reader: { itemID: 7 }, doc: d, params: { annotation: { text: "passage two" } }, append: (e) => (popupBtn = e) });
  popupBtn.click();
  await wait(60);
  last = fetchCalls[fetchCalls.length - 1];
  ok("popup with a typed prompt uses it", lastText().endsWith("Why does it always arrive?"));

  const qbtns = () => [...d.querySelectorAll(".fd-quick button")];
  qbtns()[0].click();
  await wait(60);
  last = fetchCalls[fetchCalls.length - 1];
  ok("quick prompt with no selection targets the whole paper", lastText().startsWith("Summarize this"));

  registered.renderTextSelectionPopup({ reader: { itemID: 7 }, doc: d, params: { annotation: { text: "passage three" } }, append: () => {} });
  qbtns()[2].click();
  await wait(60);
  last = fetchCalls[fetchCalls.length - 1];
  ok("quick prompt with a selection attaches it", lastText().includes("passage three") && lastText().includes("Reconstruct the argument"));

  d.querySelector(".fd-icon[title=Settings]").click();
  const ta = [...d.querySelectorAll(".fd-settings textarea")][0];
  ta.value = "Plain | Say it plainly.";
  d.querySelector(".fd-settings .fd-send").click();
  ok("custom prompt buttons replace the defaults", qbtns().map((b) => b.textContent).join(",") === "Plain");

  const noTextAtt = { id: 42, libraryID: 1, parentItemID: null, isAttachment: () => true, isRegularItem: () => false, parentItem: null, getDisplayTitle: () => "Scan", get attachmentText() { return Promise.resolve("   "); } };
  Zotero.Items.get = (id) => (id === 42 ? noTextAtt : att);
  Zotero.Reader.getByTabID = () => ({ itemID: 42 });
  await wait(1800);
  ok("no text layer reported without asking a question", /No extractable text/.test(d.querySelector(".fd-status").textContent));
  Zotero.Items.get = () => att;
  Zotero.Reader.getByTabID = () => ({ itemID: 7 });

  __b.shutdown();
  ok("session B cleans up", !d.getElementById("fd-root"));
})().catch((e) => { console.error("ERROR", e); process.exitCode = 1; });
