# CLAUDE.md — context for continuing fidoic in Claude Code

This file exists so a fresh Claude Code session has the background a chat-based session
built up over several iterations. Read this before making changes; it records decisions,
not just current file contents, and several of those decisions came from mistakes already
made once.

## What this project is

fidoic is a Zotero plugin: a docked chat panel beside the PDF reader that answers questions
about the paper you have open, using your own Gemini or Claude API key. It grew out of a
request to build something like Microsoft Edge's Copilot sidebar, but for Zotero: page-aware
with no clicks, select text and ask about it, no compose or rewrite mode, nothing beyond a
reading companion.

The whole plugin is two files: `manifest.json` and `bootstrap.js`. No build step, no
bundler, no npm dependency at runtime. `package.json` and `node_modules` exist only for the
test harness under `tests/`; they are never packaged into the `.xpi`.

## How to build and test

```bash
npm install                 # once, for the test harness (jsdom)
npm test                    # runs tests/fidoic.test.js
zip -X fidoic-X.Y.Z.xpi manifest.json bootstrap.js icon.svg   # the actual deliverable
```

**The test suite has never touched a real Zotero.** It mocks `Zotero`, a jsdom `window`, and
`global.fetch`/`Zotero.HTTP.request`, and drives the UI through real DOM events (`.click()`,
etc.) against the actual `bootstrap.js` source, eval'd once per test file. That catches
logic bugs (wrong request bodies, race conditions between streaming and re-render, cache
key mistakes) but cannot catch anything that depends on real Zotero internals actually
matching what the mock assumes. Treat every "PASS" as "the code does what I intended,"
not as "this works in Zotero." Section below lists the specific things that are assumed
but unverified.

## Architecture of bootstrap.js

- `startup`/`shutdown`/`onMainWindowLoad`/`onMainWindowUnload`/`install`/`uninstall` are the
  six functions Zotero's bootstrap loader expects, at the top of the file.
- `createPlugin(pluginID)` is a factory called once in `startup()`. It closes over one
  `state` object (chats, docs, geminiCaches, windows map, busy flag) for that plugin
  instance. `shutdown()` tears the instance down and drops the reference. This matters for
  testing: to simulate two separate plugin lifecycles (e.g. testing that shutdown really
  cleans up), you must call `shutdown()` before the next `startup()`, or the second
  instance's `addToWindow` guard (`doc.getElementById("fd-root")`) bails out silently
  because the first instance's DOM is still there. This exact mistake cost real debugging
  time once already (see git history if it's still informative) — a "second session" test
  that doesn't call shutdown first will look like a completely broken popup handler when
  the actual bug is leftover DOM from session one.
- `addToWindow(win)` builds the entire UI as one DOM tree under `#fd-root`, appended to
  `doc.documentElement`, and returns an API object stored in `state.windows`. It reads
  `Zotero.getMainWindows()` from `init()`.
- The panel docks by looking for `#tabs-deck` (Zotero's reader/library deck element, per
  Zotero's own `zoteroPane.xhtml`) and setting its `margin-right`. If that element doesn't
  exist in some future Zotero layout, `applyDock` falls back to overlaying the reader — this
  fallback exists because it was never actually confirmed against a real Zotero window.

## Zotero API surface used, and version landmines already hit

- `Zotero.Reader.getByTabID(win.Zotero_Tabs.selectedID)` then `.itemID` — gets the
  attachment behind the currently open reader tab.
- `Zotero.Items.get(id)`, `att.isAttachment()`, `att.isRegularItem()`,
  `it.getBestAttachment()`, `att.attachmentText` (async getter), `att.parentItem`,
  `.getDisplayTitle()`.
- `Zotero.Fulltext.indexItems([att.id])` — called if `attachmentText` comes back empty, to
  force indexing before reading again.
- `Zotero.Reader.registerEventListener("renderTextSelectionPopup", handler, pluginID)` —
  the hook for adding the "Ask fidoic" button to the PDF selection popup. Handler receives
  `{ reader, doc, params, append }`; `params.annotation.text` is the selected text.
- `Zotero.HTTP.request(method, url, opts)` — used only as a fallback when `fetch` doesn't
  exist (see below); returns `{ responseText }`, throws with `.xmlhttp.status` on failure.
- `Zotero.Prefs.get(key, true)` / `.set(key, value, true)` — the `true` argument matters,
  it's the "isDefaultBranch"-style flag needed for prefs written this way to actually round
  trip; this was correct from the first version and never had to be revisited.
- `Zotero.Item` (constructor), `note.setNote()`, `note.libraryID`, `note.parentID`,
  `note.addToCollection(id)`, `note.saveTx()` — for "Save as note."
- **Zotero 10 breaking change already handled:** `ZoteroPane.getSelectedCollection()` was
  removed in Zotero 10 (multi-select support); the replacement is
  `ZoteroPane.getSelectedCollections()`, plural, returning an array. `bootstrap.js` already
  calls the plural form. If you see any *other* singular Zotero API used somewhere, check
  Zotero's "Zotero 10 for Developers" changelog before assuming it still exists —
  `getSelectedLibraryID`, `getSelectedSavedSearch`, and `getSelectedGroup` all got the same
  treatment and none of those are currently used here, but a future feature might reach for
  one.
- **manifest.json gotcha already hit:** Zotero refused to install an early build with a
  "may be incompatible" error that had nothing to do with the declared version range. Root
  cause, based on third-party plugin READMEs (not Zotero's own docs, so treat as
  reasonably-confident-but-not-certain): a bootstrapped plugin's manifest needs an
  `update_url` field and an icon, or some Zotero 9/10 builds refuse it outright with a
  misleading message. The current manifest has both; a placeholder `update_url` that
  resolves to nothing is fine since automatic updates were never wired up.

## Providers: streaming, caching, fallback

Both providers go through `streamAsk(d, chat, att, hooks, signal)` in `bootstrap.js`, where
`hooks` is `{ onDelta(chunk, fullText), onThought(fullThoughtSummary), onPhase(label) }`. The
UI uses these for the live status line (phase plus a seconds counter) and the thinking view.

- **If `typeof fetch === "function"`** (expected on Zotero 7+, since Zotero's own
  `Zotero.HTTP.download()` is documented as having been "rewritten to stream via fetch()" in
  the Zotero 10 changelog, which implies `fetch` is available in this execution context —
  this has not been independently confirmed inside an actual bootstrap.js sandbox), it
  streams via Server-Sent Events, parsed by the shared `streamSSE()` helper.
- **If not**, it falls back to a single buffered request per turn (`callClaudeBuffered` /
  `callGeminiBuffered`), the same style of request the plugin used before streaming existed.
  This fallback path is what keeps the plugin functional if the `fetch` assumption above
  turns out to be wrong on some Zotero build; if that ever needs confirming, the fastest way
  is to open the Zotero 7+ error console and type `typeof fetch`.

### Gemini

- Streaming endpoint: `POST .../models/{model}:streamGenerateContent?alt=sse`.
- **Default models** (since 0.5.1): `gemini-3.5-flash-lite`, fallback `gemini-3.5-flash`.
  Both free tier (checked against the raw pricing page HTML, September 2026). 3.5 Flash-Lite
  has NO free context caching, so on a free key the background cache creation fails once an
  hour and the paper goes inline; 3.5 Flash has free caching and a separate rate limit.
- **Mistake already made once:** 0.5.0 defaulted to `gemini-2.5-flash-lite`/`gemini-2.5-flash`
  because the pricing page lists them as free. Google closed all 2.5 models to keys that
  never used them ("no longer available to new users", see the deprecations page), so a new
  user got an error on the first question. Before changing a default model, check BOTH the
  pricing page and the deprecations page, and read the raw page rather than trusting a
  summary of it (an automated summary also wrongly said 3.5 Flash-Lite was paid only).
- `fallbackReason()` sends a question to the fallback model on a 429 or when the main model
  is unavailable to the key (404, or a "no longer available"/"not found" message).
- `migratePrefs()` moves saved values equal to any earlier version's exact defaults
  (`OLD_DEFAULTS`) to the current ones, once per `PREFS_VERSION` (now 3), because Save
  writes the displayed model into prefs even if the user never chose it. Bump
  `PREFS_VERSION` and add the outgoing defaults to `OLD_DEFAULTS` whenever defaults change.
- **Thinking**: first live test (0.4.0, Zotero, Gemini 3.8 Flash) took over 5 minutes with no
  visible activity. Gemini 3 thinks at a high level by default and thought parts were
  filtered out, so the UI showed nothing. Now `geminiGenConfig()` sends `thinkingConfig`
  from the "Gemini thinking" setting (default low): `thinkingBudget` for `gemini-2.*`
  (0 turns it off on Flash/Flash-Lite, Pro's floor is 128), `thinkingLevel` for 3.x, and
  `includeThoughts: true` so thought summaries stream and show in the live bubble. A 400
  naming "think" retries once without `thinkingConfig` and adds the model to
  `state.noThinking`. Note Gemini counts thinking tokens against `maxOutputTokens`; a
  `MAX_TOKENS` finish with no text gets a specific error message.
- **Context caching**: the first question about a given document+model combination does
  NOT wait for a cache (it did in 0.4.0; cache creation was a buffered request with a long
  timeout). `geminiCacheNow()` returns a cache name only if one is ready; otherwise it
  starts `createGeminiCache()` in the background (`state.geminiCachePending` prevents
  duplicates) and the question goes out with the paper inline. The cache POSTs to
  `.../v1beta/cachedContents` with the system prompt and full document text, gets back a
  `cachedContents/...` name, and stores it in `state.geminiCaches` keyed by
  `attachmentId:model:textLength` (the text length is in the
  key so a settings change to the character limit naturally invalidates old cache entries
  without needing explicit bookkeeping). Subsequent questions about the same paper send
  `cachedContent: name` instead of re-sending the document. TTL is set to one hour
  server-side; the local bookkeeping treats it as expired five minutes early to avoid racing
  the server's own expiry.
- If a cached-content request fails with a message that looks cache-related (regex
  `/cach/i` on the error message — crude but it's what Gemini's error text actually
  contains), the code deletes the local cache entry and retries once with the document sent
  inline, rather than surfacing an error to the user for something recoverable.
- On a 429 from the primary model, retries once with the fallback model from settings, with
  no cache (a different model needs its own cache entry, and this is meant to be a rare
  escape hatch, not a steady-state path worth optimizing further).
- Very short documents may be too small for Gemini to accept a cache; `createGeminiCache`
  catches that and returns `null`, which is stored as a `{ name: null }` entry for the same
  hour a cache would live, so the text goes inline and creation is not retried every turn.
  (0.4.0 actually deleted the entry and retried every turn, despite what this file said.)

### Claude

- Uses Anthropic's own prompt caching (`cache_control: { type: "ephemeral" }` on the
  document block in `system`), which Anthropic handles automatically; there's no
  create/store/reuse dance the way Gemini needs, because Anthropic's cache is addressed by
  content hash rather than by a name the caller has to track.
- Streaming is plain Anthropic SSE (`content_block_delta` events with
  `delta.type === "text_delta"`).

### Aborting

`AbortController` is created per-turn in the UI layer and its `signal` is threaded through
to `fetch()`. The mocked test for this (`tests/fidoic.test.js`) had to specifically make its
fake `ReadableStream` honor the abort signal on a long-pending "next chunk" wait, because a
naive mock (a promise that never resolves) doesn't reject on abort the way a real `fetch()`
stream does — if you add more abort-related tests, make sure the mock stream actually wires
up `signal.addEventListener("abort", ...)`, or the test will hang or silently pass for the
wrong reason.

## UI notes

- Markdown rendering (`renderMarkdown`) is hand-rolled and intentionally minimal: headings,
  bullets, numbered lines, `**bold**`, `*italic*`, `` `code` ``. No tables, no nested lists,
  no code blocks with syntax highlighting. This was a deliberate scope decision, not an
  oversight — pulling in a real markdown library was judged not worth it for chat-length
  answers.
- During streaming, the live answer is a plain-text node (`liveInner.textContent = full`),
  not markdown-rendered, to avoid re-parsing markdown on every delta. Once the stream ends,
  the message gets pushed into `state.chats` and `renderMessages()` re-renders everything
  from scratch through `renderMarkdown`, so the final answer does get proper formatting.
- Prompt buttons are user-defined text parsed by `parsePrompts()` from a single settings
  textarea (`Label | prompt`, one per line). This was chosen over a fixed prompt list after
  the user specifically asked to supply their own prompts rather than use built-in ones.
- The passage a question was asked about is stored on the user turn as `passage` and shown
  as a clickable, collapsible `.fd-quote` above the question (0.4.0 only showed
  "[Selected passage attached]", which the user found useless).
- Selection handling: after a selection is used in a question, `state.selection = null` and
  the chip clears, because the selection now lives in that chat turn's history; carrying it
  forward would silently re-attach an old passage to unrelated later questions.

## Known open questions / things to verify in real Zotero before calling this done

1. Docking: confirmed fine in a real Zotero reader window (0.4.0 live test, September 2026).
   Library view not yet checked.
2. Does `fetch` actually exist in the bootstrap.js execution context on Zotero 7/8/9/10? See
   the streaming section above — this is inferred, not confirmed.
3. Does Gemini's `cachedContents` creation actually succeed for a typical academic paper's
   length, and does the "too small" failure path get exercised as gracefully as the mocked
   test suggests?
4. Has anyone actually clicked "Ask fidoic" in a real PDF selection popup and confirmed the
   button renders where expected, given Zotero's real popup layout (as opposed to the mock's
   `append` callback, which just stores the button in a test variable)?
5. The manifest's `update_url` is a placeholder that resolves to nothing, so there is no
   working auto-update. If this becomes a real public plugin, that needs an actual hosted
   `updates.json` (see Zotero's plugin-update docs, or the existing GitHub Actions release
   workflow in `.github/workflows/release.yml` as a starting point for hosting the built
   `.xpi` — the update manifest itself still needs to be written and hosted separately).

## Repo layout

```
manifest.json              # the only two files that actually ship
bootstrap.js
icon.svg
tests/fidoic.test.js       # mocked Zotero/DOM/network regression suite (45 checks)
package.json               # dev-only, for running tests/fidoic.test.js
.github/workflows/release.yml   # builds + releases the .xpi on a vX.Y.Z tag push
README.md, CHANGELOG.md, LICENSE (MIT)
```

## Style/process notes carried over from the chat session

- The person prefers direct, plain prose without em dashes or heavy hedging, in both
  product-facing text (README) and in conversation about the project. This file follows
  that.
- Every version bump so far shipped only after the mocked test suite passed in full; no
  "trust me" commits. Keep doing that — write or extend a test before believing a fix works,
  especially for anything touching streaming, caching, or the abort path, since those are
  the parts most likely to have subtle race conditions.
