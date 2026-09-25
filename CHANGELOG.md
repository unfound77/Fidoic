# Changelog

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
