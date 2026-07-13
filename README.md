# CoderAI - Auto Bug Fixer

> By **Professor Raimal Raja** | v3.0.1 | AI Powered tool

Automatically detects errors in your VS Code terminal and fixes them using CoderAI, powered by the **Professor-Raimal** model.

## Features

- ⚡ Auto-detects errors in your terminal output
- 🔍 Shows **why** the error happened in plain English
- 🛠️ Provides step-by-step fix instructions
- 💻 Generates corrected code you can apply with one click (**Apply Fix to File**)
- 📦 Detects missing packages and shows install command
- 🌐 Works with Python, JavaScript, TypeScript, Java, C++, C#, and more

## How To Use

1. Run your code and get an error
2. A notification pops up: **"Fix It Now"** — click it
3. The *CoderAI* panel opens beside your editor
4. Get an instant AI-powered explanation and fix
5. Click **⚡ Apply Fix to File** to patch your code directly

Or click the **CoderAI** button in the status bar at any time.

## Commands

- `CoderAI: Analyze Terminal` — Analyze the current terminal output or paste an error
- `CoderAI: Fix This Error` — Fix a specific error programmatically
- `CoderAI: Set API Key` — Save your CoderAI API key

## Settings

| Setting | Default | Description |
|---|---|---|
| `coderAI.autoDetect` | `true` | Auto-detect errors in terminal output |
| `coderAI.apiKey` | `""` | Your CoderAI API key, used to call the Professor-Raimal model |

## 📦 Installation

### Option A — VS Code Marketplace

1. Open VS Code
2. Press `Ctrl+P` and run:
   ```
   ext install Professor-Raimal-Raja.coderai-auto-bug-fixer
   ```
3. Reload VS Code

### Option B — Manual (.vsix)

```bash
# Download the latest .vsix from Releases
code --install-extension coderai-auto-bug-fixer-3.0.1.vsix
```

```
Before error:  ✨ CoderAI
After error:   ⚠ Error detected — Ask me   ← click this
```

Patterns detected include (but are not limited to):

- Python: `TypeError`, `ValueError`, `SyntaxError`, `ImportError`, `ModuleNotFoundError`, `Traceback`
- JavaScript/Node: `Cannot find module`, `npm ERR!`, `UnhandledPromiseRejection`, `ReferenceError`
- Java: `java.lang.*Exception`, stack traces
- C/C++: `Segmentation fault`, `undefined reference`
- General: `Permission denied`, `command not found`, `failed to compile`

## Requirements

- Internet connection required
- A CoderAI API key (set via `CoderAI: Set API Key`)

## License

MIT

<div align="center">

Made with ❤️ by **Professor Raimal Raja**

[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Professor-Raimal-Raja.coderai-auto-bug-fixer)
· [Report a Bug](https://github.com/Raimal-Raja-VScode-Extensions/CoderAI-Auto-Bug-Fixer-VScode-Extension/issues)
· [Request a Feature](https://github.com/Raimal-Raja-VScode-Extensions/CoderAI-Auto-Bug-Fixer-VScode-Extension/issues)

</div>