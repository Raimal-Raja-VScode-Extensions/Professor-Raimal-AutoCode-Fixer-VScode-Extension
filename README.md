Set-Content -Path "README.md" -Value @"
# Professor Raimal — AI Error Fixer

Automatically detects errors in your VS Code terminal and fixes them using Gemini AI. Free, no API key required.

## Features

- Auto-detects errors in your terminal output
- Shows why the error happened in plain English
- Provides step-by-step fix instructions
- Generates corrected code you can apply with one click
- Works with Python, JavaScript, TypeScript, Java, C++, and more

## Usage

1. Run your code and get an error
2. Click the **Prof. Raimal** button in the status bar
3. Paste your error when prompted
4. Get an instant AI-powered explanation and fix

## Commands

- `Professor Raimal: Analyze Terminal` — Analyze a pasted error message
- `Professor Raimal: Fix This Error` — Fix a specific error

## Requirements

Internet connection required (calls Gemini 1.5 Flash API).

## License

MIT
"@