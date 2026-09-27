# Fidoic-AI Assistant for Zotero PDFs

fidoic is a reading companion docked beside the PDF you have open in Zotero. It works with
the free Google Gemini API tier or with Anthropic Claude, using your own API key.

Built for close reading of dense material (philosophy, theory, psychoanalysis, anything
where you want to check a passage against the actual words rather than a paraphrase). It
reads the paper you have open, answers with short verbatim quotes, and separates what the
text says from outside context (translator choices, secondary literature, and so on).

## Install

1. Download `fidoic.xpi` from the latest release on the [Releases](../../releases) page (or
   build it yourself, see below).
2. In Zotero: **Tools → Plugins → gear icon → Install Plugin From File…**, then pick
   `fidoic.xpi`.
3. Get a free Gemini key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   (no card required), or an Anthropic key at
   [console.anthropic.com](https://console.anthropic.com/).
4. Click the blue **fidoic** button (bottom right of Zotero), open the gear icon, paste the
   key, Save.

Requires Zotero 7, 8, 9, or 10.

To update, remove the old version in **Tools → Plugins**, then install the new
`fidoic.xpi` the same way.

## What it does

- **Page aware, no clicks.** The paper open in the reader (or selected in your library) is
  the context. fidoic reads its full text as soon as it's in view and reports the word
  count, or warns immediately if the PDF has no text layer (scanned PDFs need OCR first).
- **Select and ask.** Select a passage in the PDF, click **Ask fidoic** in the selection
  popup. If you had typed a question, it's answered against that passage. If the box was
  empty, fidoic explains what the passage is saying.
- **Shows the passage you asked about.** Your question appears under a quote of the
  selected passage. Click the quote to see all of it.
- **Streams live.** Answers appear as they're generated, with a Stop button if you want to
  cut one short. The partial answer is kept. Before the first word arrives, the panel shows
  what it is doing (reading, waiting, thinking) with a seconds counter, and for Gemini the
  model's short thinking summaries.
- **Your own prompts.** The buttons above the input box come from a list you set in
  settings (`Label | prompt`, one per line). With a passage selected, a button applies to
  the passage; otherwise it applies to the whole paper.
- **Fast and cheap by default.** The default Gemini model is Gemini 3.5 Flash-Lite, on the
  free tier, with thinking turned low. Gemini requests use context caching where the model
  and tier allow it: the first question about a paper sends its text directly while a cache
  is built in the background, and later questions within the hour use the cache. Claude
  requests use Anthropic's prompt caching. Default reply length and paper-text limits are
  both kept modest and both adjustable in settings.
- **Save as note / Copy** under each answer. Notes are labelled as AI-generated, with the
  model and date.
- No compose or rewrite mode. This isn't a general writing tool, just a reading companion.

## Settings

Gear icon in the panel:

| Setting | What it does |
|---|---|
| Provider | Gemini (free tier available) or Claude (paid API) |
| API key | Stored in Zotero's own preferences, in plain text, on your machine only |
| Model / Fallback model | Defaults: `gemini-3.5-flash-lite`, falling back to `gemini-3.5-flash` automatically if the main model hits a 429 or is not available to your key |
| Gemini thinking | Low (default, fastest), medium, high, or the model's own default. Higher can be more careful but can take minutes on a long paper |
| Prompt buttons | One per line, `Label \| the actual prompt` |
| Max characters of paper text sent | Higher lets you ask about longer papers in full; lower is faster and cheaper |
| Max reply length | In tokens; lower answers faster and costs less |

## Free-tier facts

Checked against Google's pricing and deprecation pages in September 2026:

- Free input and output tokens: Gemini 3.5 Flash-Lite and 3.5/3.6/3.7/3.8 Flash.
- Free context caching: the 3.5 to 3.8 Flash models. Not 3.5 Flash-Lite, so on a free key
  each question sends the paper text again (still free, just slower on long papers).
- Gemini 2.5 models are only open to keys that used them before; new keys get "no longer
  available to new users".
- Free-tier requests may be used by Google to improve its products (paid keys are
  excluded). Keep unpublished or sensitive material off the free tier, or use a paid key or
  Claude instead.
- Per-model rate limits are shown in your own AI Studio account and change over time.
  Check there rather than trusting a number written here.

## Known limitations

- Answers can still misquote or misattribute. The system prompt requires short verbatim
  quotes and forbids invented page numbers or citations, but check quotes against the page
  yourself before citing them anywhere that matters.
- Reads the whole extracted text of the attachment, not just the visible page.
- API keys sit in Zotero's preferences in plain text, like any Zotero plugin that needs one.
- No automatic updates yet. Install new versions by hand from the Releases page.

## Building the .xpi yourself

No build step. It's a plain bootstrapped Zotero plugin (`manifest.json` + `bootstrap.js` +
`icon.svg`).

```bash
zip -X fidoic.xpi manifest.json bootstrap.js icon.svg
```

Pushing a version tag (for example `v0.5.2`) makes GitHub Actions run the tests, build
`fidoic.xpi`, and attach it to a new release.

## Tests

`tests/fidoic.test.js` runs `bootstrap.js` against a mocked Zotero, a jsdom window and
mocked network calls. It needs Node.js:

```bash
npm install
npm test
```

The mocks catch logic bugs, not Zotero-specific ones, so a real Zotero install is still the
source of truth.

## Contributing

Issues and pull requests welcome. Please run `npm test` and say which Zotero version you
tried the change in.

## License

MIT. See [LICENSE](LICENSE).
