# Changelog

## [3.1.1] - 2026-07-15 (patch review)
### Fixed — these were listed as fixed below but were not actually corrected in the shipped files
- **`.vscodeignore` was still the corrupted copy of `tsconfig.json`**, not ignore rules — despite the packaging note below claiming this was fixed. This is very likely why the extension still misbehaves after "fixing" it: the file the packager actually reads was never replaced. Restored proper ignore patterns.
- **Model responses were getting cut off mid-JSON**: `max_tokens` on the upstream call was 1500, which was frequently too small to fit `whyItHappened` + `howToFix` + a full `fixedCode` snippet in one JSON object. A truncated response fails `json_decode`, which either 502s as "unparseable output" or (if the fallback merge still partially succeeds) leaves `fixedCode` empty — which is exactly why the Apply Fix button and fixed code were missing for anything beyond a trivial error. Raised to 3000 and added detection for `finish_reason === "length"` so this fails with a clear, honest message instead of a silent empty result.
- **`renderWebviewHtml` had no error handling** around reading `media/webview.html`. If that file isn't present at that exact path in the installed extension (e.g. because of the `.vscodeignore` bug above silently changing what gets packaged, or a build that ran before the file existed), the read throws, the panel is left blank, and there's no dialog telling you why — it just looks like "nothing works." Now catches the error, logs it, and shows a visible message instead of a silent blank panel.

## [3.1.1] - 2026-07-15
### Fixed
- **Apply Fix / Copy firing multiple times**: the webview's message listener was being re-registered on every "analyze" call instead of once per panel, so after the panel had been used more than once, clicking "Apply Fix to File" or a copy button could trigger the action multiple times (repeated QuickPicks, the same edit applied repeatedly). The listener is now registered exactly once when the panel is created.
- **Warnings were never auto-detected**: terminal commands that succeed (exit code 0) but print warnings — deprecation warnings, lint warnings, compiler warnings — were skipped entirely because the auto-detect handler returned early on `exitCode === 0`. It now always inspects the output, and `looksLikeError()` recognizes common warning patterns (`warning:`, `npm warn`, `deprecated`, etc.) in addition to errors.
- **Attribute-injection risk on the "Copy Command" button**: the dependency install command was being interpolated directly into an inline `onclick="..."` HTML attribute. A command containing a `"` could break the markup. The value is now stored in a JS variable and read from there instead.
- Added a proper Content-Security-Policy (nonce-based script, scoped `connect-src`) to the webview.
- Fixed the README's Marketplace install command / link, which referenced a different publisher ID (`Professor-Raimal-Raja`) than the one actually declared in `package.json` (`RaimalRaja`).
- Removed temporary debug fields (raw upstream response, HTTP status, curl error) from the proxy's error responses.
- Added per-IP rate limiting to `generate.php` (the backend was public with zero throttling, which would have let one user exhaust the shared API quota for everyone after publishing).

### Packaging (required for Marketplace publish)
- Added the missing `media/icon.png` (referenced in `package.json` but not present — `vsce package` needs it).
- Fixed `.vscodeignore`, which had accidentally been overwritten with a copy of `tsconfig.json` instead of ignore rules.
- Added `repository`, `bugs`, `homepage`, and `license` fields to `package.json` for the Marketplace listing.

## [3.0.1] - 2026-07-11
### Changed
- Renamed extension to **CoderAI - Auto Bug Fixer** (publisher: Professor Raimal Raja)
- Replaced the Gemini API key with a **CoderAI API key**, calling Professor Raimal Raja's own LLM, model **Professor-Raimal**
- Added `CoderAI: Set API Key` command for saving the API key
- Updated all command IDs to `coderai.*` namespace
- Updated status bar label to "CoderAI"
- Updated webview panel title to "✨ CoderAI"
- Updated configuration keys to `coderAI.autoDetect` and `coderAI.apiKey`
- Updated output channel name to "CoderAI"

## [2.4.0] - 2026-04-07
### Changed
- Renamed extension to **Code-RRK** (publisher: Professor Raimal Raja)
- Upgraded AI model from Gemini 1.5 Flash → Gemini 2.5 Flash for faster, smarter analysis
- Updated all command IDs to `code-rrk.*` namespace
- Updated status bar label to "Code-RRK"
- Updated webview UI header with v2.4.0 badge
- Updated configuration key to `codeRRK.autoDetect`
- Improved "Apply Fix" button label clarity

## [1.1.0]
- Initial published version as Professor Raimal Raja — AI Error Fixer

## [1.0.0]
- Initial release