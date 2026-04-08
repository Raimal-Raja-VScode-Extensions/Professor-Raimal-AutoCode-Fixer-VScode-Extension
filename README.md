# Professor Raimal — AutoAI Error Fixer

> By **Professor Raimal Raja** | v2.4.0 | AI Powered tool

Automatically detects errors in your VS Code terminal and fixes, It's Free, no API key required. 

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
3. The *Professor Raimal* panel opens beside your editor
4. Get an instant AI-powered explanation and fix
5. Click **⚡ Apply Fix to File** to patch your code directly

Or click the **Professor Raimal** button in the status bar at any time.

## Commands

- `Professor: Analyze Terminal` — Analyze the current terminal output or paste an error
- `Professor: Fix This Error` — Fix a specific error programmatically

## Settings

| Setting | Default | Description |
|---|---|---|
| `professorRaimal.autoDetect` | `true` | Auto-detect errors in terminal output |

## 📦 Installation
 
### Option A — VS Code Marketplace
 
1. Open VS Code
2. Press `Ctrl+P` and run:
   ```
   ext install Professor-Raimal.raimal-ai-error-fixer
   ```
3. Reload VS Code
 
### Option B — Manual (.vsix)
 
```bash
# Download the latest .vsix from Releases
code --install-extension raimal-ai-error-fixer-1.0.0.vsix
```

```
Before error:  ✨ Prof. Raimal
After error:   ⚠ Error detected — Ask me   ← click this
```
 
Patterns detected include (but are not limited to):
 
- Python: `TypeError`, `ValueError`, `SyntaxError`, `ImportError`, `ModuleNotFoundError`, `Traceback`
- JavaScript/Node: `Cannot find module`, `npm ERR!`, `UnhandledPromiseRejection`, `ReferenceError`
- Java: `java.lang.*Exception`, stack traces
- C/C++: `Segmentation fault`, `undefined reference`
- General: `Permission denied`, `command not found`, `failed to compile`

## Requirements

Internet connection required.

## License

MIT

<div align="center">
 
Made with ❤️ by **Professor Raimal Raja**
 
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Professor-Raimal.raimal-ai-error-fixer) 
· [Report a Bug](https://github.com/Raimal-Raja-VScode-Extensions/Professor-Raimal-AutoCode-Fixer-VScode-Extension/issues) 
· [Request a Feature](https://github.com/Raimal-Raja-VScode-Extensions/Professor-Raimal-AutoCode-Fixer-VScode-Extension/issues)
 
</div>