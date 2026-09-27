# Changelog

## 0.5.1
- Default Gemini models are now `gemini-3.5-flash-lite`, falling back to `gemini-3.5-flash`.
  0.5.0's defaults (the 2.5 models) are closed to new API keys and failed with "no longer
  available to new users". 0.5.0 also wrongly said 3.5 Flash-Lite was not on the free tier;
  it is, but without free context caching.
- A main model that is not available to your key now falls back to the fallback model, the
  same way a 429 does, and the status line says why.
- Saved settings holding the 0.4.0 or 0.5.0 default models move to the new defaults once.

## 0.5.0
- The selected passage now shows in the question bubble, as a quote you can click to expand,
  instead of "[Selected passage attached]".
- The panel no longer looks frozen while waiting. The status line shows the current step
  (reading, waiting, thinking, answering) with a seconds counter, the answer bubble shows
  Gemini's thinking summaries as they arrive, and the finished status says how long the
  answer took and whether the cached paper was used.
- Default Gemini models changed to `gemini-2.5-flash-lite` with `gemini-2.5-flash` as
  fallback. (Replaced in 0.5.1: new keys can't use 2.5 models.)
- New "Gemini thinking" setting, low by default. Uses a thinking budget on Gemini 2.x and a
  thinking level on Gemini 3.x. A model that rejects the setting is retried once without it.
- The first question about a paper no longer waits for the Gemini cache to be created. It
  sends the text directly and builds the cache in the background for later questions. A
  failed cache creation is not retried for an hour.
- If this Zotero build has no `fetch`, the status line now says so instead of silently
  waiting for a buffered answer.

## 0.4.0
- Answers now stream in as they're generated instead of arriving all at once.
- A Stop button cancels a generation in progress and keeps whatever text already arrived.
- Gemini requests use context caching: the paper's text is uploaded and billed once per hour
  per document, not on every question. Falls back to sending it inline if a paper is too
  short to cache or the cache has gone stale.
- Claude requests keep using Anthropic's prompt caching on the document block.
- Lowered default reply length (2048 tokens) and default paper-text limit (120,000 characters).
  Both are configurable in settings; the old, larger defaults made every answer slower and
  more expensive than most questions need.

## 0.3.1
- Added `update_url` and an icon to the manifest (Zotero refused to install the plugin
  without them on some Zotero 9/10 builds).
- Saving a note into a collection uses Zotero 10's multi-select collection API.

## 0.3.0
- Renamed to fidoic.
- Page-aware with no clicks: reads whichever paper is open as soon as it comes into view.
- Select text, click "Ask fidoic" in the popup: sends the passage immediately, explaining it
  by default or answering a typed prompt if there is one.
- User-editable prompt buttons (`Label | prompt`, one per line).
- Save as note / Copy actions under each answer.

## 0.2.0
- Renamed to Paper Companion.
- Added Google Gemini as a provider alongside Claude, with a free-tier fallback model on 429.
- Docked panel (shrinks the reader) instead of an overlay.

## 0.1.0
- First version: Claude-only chat panel for the PDF open in Zotero.
