# fidoic

A reading companion docked beside the PDF you have open in Zotero. Works with the free
Google Gemini API tier or with Anthropic Claude, using your own API key.

Built for close reading of dense material (philosophy, theory, psychoanalysis, anything
where you want to check a passage against the actual words rather than a paraphrase). It
reads the paper you have open, answers with short verbatim quotes, and separates what the
text says from outside context (translator choices, secondary literature, and so on).

## Install

1. Download the latest `fidoic-X.Y.Z.xpi` from [Releases](../../releases) (or build it
   yourself — see below).
2. In Zotero: **Tools → Plugins → gear icon → Install Plugin From File…**, then pick the
   `.xpi`.
3. Get a free Gemini key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   (no card required), or an Anthropic key at
   [console.anthropic.com](https://console.anthropic.com/).
4. Click the blue **fidoic** button (bottom right of Zotero), open the gear icon, paste the
   key, Save.

Requires Zotero 7, 8, 9, or 10.

## What it does

- **Page aware, no clicks.** The paper open in the reader (or selected in your library) is
  the context. fidoic reads its full text as soon as it's in view and reports the word
  count, or warns immediately if the PDF has no text layer (scanned PDFs need OCR first).
- **Select and ask.** Select a passage in the PDF, click **Ask fidoic** in the selection
  popup. If you had typed a question, it's answered against that passage. If the box was
  empty, fidoic explains what the passage is saying.
- **Streams live.** Answers appear as they're generated, with a Stop button if you want to
  cut one short — the partial answer is kept.
- **Your own prompts.** The buttons above the input box come from a list you set in
  settings (`Label | prompt`, one per line). With a passage selected, a button applies to
  the passage; otherwise it applies to the whole paper.
- **Fast and cheap by default.** Gemini requests use context caching, so the paper's text
  is uploaded and billed once per hour, not on every question. Claude requests use
  Anthropic's prompt caching the same way. Default reply length and paper-text limits are
  both kept modest and both adjustable in settings.
- **Save as note / Copy** under each answer. Notes are labelled as AI-generated, with the
  model and date.
- No compose or rewrite mode — this isn't a general writing tool, just a reading companion.

## Settings

Gear icon in the panel:

| Setting | What it does |
|---|---|
| Provider | Gemini (free tier available) or Claude (paid API) |
| API key | Stored in Zotero's own preferences, in plain text, on your machine only |
| Model / Fallback model | Fallback is used automatically if the main Gemini model hits a 429 |
| Prompt buttons | One per line, `Label \| the actual prompt` |
| Max characters of paper text sent | Higher lets you ask about longer papers in full; lower is faster and cheaper |
| Max reply length | In tokens; lower answers faster and costs less |

## Free-tier facts

Checked against Google's own pages as of writing:

- Gemini 3.8/3.7/3.6/3.5 Flash and 3.5/3.1 Flash-Lite have free input and output tokens.
- Free-tier requests may be used by Google to improve its products (paid keys are
  excluded). Keep unpublished or sensitive material off the free tier, or use a paid key /
  Claude instead.
- Per-model rate limits are shown in your own AI Studio account and change over time —
  check there rather than trusting a number written here.

## Known limitations

- Answers can still misquote or misattribute. The system prompt requires short verbatim
  quotes and forbids invented page numbers or citations, but check quotes against the page
  yourself before citing them anywhere that matters.
- Reads the whole extracted text of the attachment, not just the visible page.
- API keys sit in Zotero's preferences in plain text, like any Zotero plugin that needs one.

## Building the .xpi yourself

No build step — it's a plain bootstrapped Zotero plugin (`manifest.json` + `bootstrap.js`).

```bash
zip -X fidoic-X.Y.Z.xpi manifest.json bootstrap.js icon.svg
```

## Contributing

Issues and pull requests welcome. There's no test framework wired up yet beyond manual
checks against a mocked Zotero/DOM environment during development; a real Zotero install is
the actual source of truth, so please note what you tested against.

## License

MIT — see [LICENSE](LICENSE).
