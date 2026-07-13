import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;
let panel: vscode.WebviewPanel | undefined;
let lastCapturedError = '';

// Tracks the last real code editor the user had focus on. Needed because once the
// CoderAI webview panel gets focus, vscode.window.activeTextEditor becomes
// undefined (a webview isn't a text editor), which was breaking "Apply Fix".
let lastActiveEditor: vscode.TextEditor | undefined;

// Dedupe/cooldown for the auto-popup notification so the same error occurring
// again (e.g. re-running the same failing script) doesn't spam a new toast
// every single time.
let lastNotifiedError = '';
let lastNotifiedAt = 0;
const NOTIFY_COOLDOWN_MS = 8000;

// All AI calls go through your own backend — no provider key ships in the extension.
const CODERAI_PROXY_URL = 'https://coder.kvtech.net/api/generate.php';

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('CoderAI');

    // ── Status bar button ────────────────────────────────────────────────────
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = '$(sparkle) CoderAI';
    statusBarItem.tooltip = 'Click to analyze terminal for errors';
    statusBarItem.command = 'coderai.analyzeTerminal';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Keep track of the last real text editor the user was working in, since
    // vscode.window.activeTextEditor goes undefined once the webview panel
    // steals focus (e.g. when clicking "Apply Fix to File").
    if (vscode.window.activeTextEditor) {
        lastActiveEditor = vscode.window.activeTextEditor;
    }
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                lastActiveEditor = editor;
            }
        })
    );

    // ── Commands ─────────────────────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('coderai.fixError', (errorText: string) => {
            analyzeAndFix(context, errorText);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('coderai.analyzeTerminal', () => {
            captureAndAnalyzeTerminal(context);
        })
    );

    // Internal command called by the terminal link provider
    context.subscriptions.push(
        vscode.commands.registerCommand('coderai.fixFromLink', (errorText: string) => {
            analyzeAndFix(context, errorText);
        })
    );

    // Open settings shortcut so users can paste their CoderAI API key
    context.subscriptions.push(
        vscode.commands.registerCommand('coderai.setApiKey', async () => {
            const config = vscode.workspace.getConfiguration('coderAI');
            const current = config.get<string>('apiKey', '');
            const input = await vscode.window.showInputBox({
                prompt: 'Enter your CoderAI API key',
                placeHolder: 'coderai-sk-...',
                value: current,
                password: true,
                ignoreFocusOut: true
            });
            if (input !== undefined) {
                await config.update('apiKey', input, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage('✅ CoderAI API key saved.');
            }
        })
    );

    // ── METHOD 1: Shell Integration (VS Code 1.93+) ──────────────────────────
    // Fires when a shell command finishes. If exit code ≠ 0, we read its output.
    context.subscriptions.push(
        vscode.window.onDidEndTerminalShellExecution(async (event) => {
            const config = vscode.workspace.getConfiguration('coderAI');
            if (!config.get('autoDetect', true)) return;

            // exit code 0 = success, undefined = unknown, anything else = error
            if (event.exitCode === 0) return;

            let output = '';
            try {
                // Read the streamed output of the finished execution
                const stream = event.execution.read();
                for await (const chunk of stream) {
                    output += chunk;
                    if (output.length > 4000) break;
                }
            } catch {
                // stream may not be available in all shell types
            }

            const cleaned = stripAnsi(output).trim();
            const textToAnalyze = cleaned.length > 10 ? cleaned : lastCapturedError;

            if (textToAnalyze && looksLikeError(textToAnalyze)) {
                lastCapturedError = textToAnalyze;

                // Always light up the status bar so the user can still click it
                // manually, but only pop the toast notification if this is a
                // genuinely new error (or the cooldown has passed) — otherwise
                // re-running the same broken command spams a new popup every time.
                flashStatusBar();

                const now = Date.now();
                const isSameAsLast = textToAnalyze === lastNotifiedError;
                const withinCooldown = now - lastNotifiedAt < NOTIFY_COOLDOWN_MS;
                if (isSameAsLast && withinCooldown) {
                    return;
                }
                lastNotifiedError = textToAnalyze;
                lastNotifiedAt = now;

                vscode.window.showInformationMessage(
                    '🔴 CoderAI detected an error in your terminal.',
                    'Fix It Now',
                    'Dismiss'
                ).then(selection => {
                    resetStatusBar();
                    if (selection === 'Fix It Now') {
                        analyzeAndFix(context, textToAnalyze);
                    }
                });
            }
        })
    );

    // ── METHOD 2: Terminal Link Provider ────────────────────────────────────
    // Scans every line printed to the terminal. When it matches an error pattern
    // it makes that line clickable — user sees "⚡ Ask CoderAI" as a hyperlink.
    context.subscriptions.push(
        vscode.window.registerTerminalLinkProvider({
            provideTerminalLinks(
                ctx: vscode.TerminalLinkContext,
                _token: vscode.CancellationToken
            ): vscode.TerminalLink[] {
                const config = vscode.workspace.getConfiguration('coderAI');
                if (!config.get('autoDetect', true)) return [];

                const line = stripAnsi(ctx.line);
                if (!looksLikeError(line)) return [];

                // Buffer the error line so analyzeTerminal can use it
                lastCapturedError = (lastCapturedError + '\n' + line).slice(-4000);

                // Underline the whole line and add tooltip
                return [{
                    startIndex: 0,
                    length: ctx.line.length,
                    tooltip: '⚡ Ask CoderAI to fix this error'
                }];
            },
            handleTerminalLink(_link: vscode.TerminalLink) {
                vscode.commands.executeCommand('coderai.fixFromLink', lastCapturedError);
            }
        })
    );

    // ── METHOD 3: Status-bar flash on terminal focus ─────────────────────────
    // When the user switches to a terminal that has buffered error text,
    // light up the status bar so they know they can click it.
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTerminal(() => {
            if (lastCapturedError && looksLikeError(lastCapturedError)) {
                flashStatusBar();
            }
        })
    );

    outputChannel.appendLine('CoderAI v3.0.1 active — watching terminal via shell integration + link provider 👀');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function flashStatusBar() {
    statusBarItem.text = '$(warning) Error — Ask CoderAI';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    statusBarItem.tooltip = 'Error detected! Click to fix with CoderAI';
}

function resetStatusBar() {
    statusBarItem.text = '$(sparkle) CoderAI';
    statusBarItem.backgroundColor = undefined;
    statusBarItem.tooltip = 'Click to analyze terminal for errors';
}

function captureAndAnalyzeTerminal(context: vscode.ExtensionContext) {
    if (lastCapturedError.trim().length > 10) {
        analyzeAndFix(context, lastCapturedError.trim());
        lastCapturedError = '';
        resetStatusBar();
        return;
    }

    // Nothing buffered — ask the user to paste
    vscode.window.showInputBox({
        prompt: 'Paste your error message here:',
        placeHolder: 'e.g. TypeError: Cannot read property of undefined...',
        ignoreFocusOut: true
    }).then(input => {
        if (input) analyzeAndFix(context, input);
    });
}

function analyzeAndFix(context: vscode.ExtensionContext, errorText: string) {
    if (!errorText || errorText.trim().length < 5) {
        vscode.window.showWarningMessage('No error text to analyze.');
        return;
    }

    resetStatusBar();

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        lastActiveEditor = activeEditor;
    }
    const fileInfo = activeEditor
        ? `Active file: ${path.basename(activeEditor.document.fileName)} (${activeEditor.document.languageId})`
        : 'No file open';
    const activeFileCode = activeEditor
        ? activeEditor.document.getText().substring(0, 2000)
        : '';

    showOverlay(context, errorText, fileInfo, activeFileCode);
}

function showOverlay(
    context: vscode.ExtensionContext,
    errorText: string,
    fileInfo: string,
    fileCode: string
) {
    if (panel) {
        panel.reveal(vscode.ViewColumn.Beside);
    } else {
        panel = vscode.window.createWebviewPanel(
            'coderAI',
            '✨ CoderAI',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
            }
        );
        panel.onDidDispose(() => { panel = undefined; });
    }

    const webviewPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'webview.html');
    panel.webview.html = fs.readFileSync(webviewPath.fsPath, 'utf8');

    panel.webview.onDidReceiveMessage(async (message) => {
        if (message.command === 'ready') {
            panel!.webview.postMessage({
                command: 'analyze',
                errorText,
                fileInfo,
                fileCode,
                proxyUrl: CODERAI_PROXY_URL,
                model: 'Professor-Raimal'
            });
        }
        if (message.command === 'applyFix') {
            applyCodeFix(message.code, message.language);
        }
        if (message.command === 'copyToClipboard') {
            vscode.env.clipboard.writeText(message.text);
            vscode.window.showInformationMessage('📋 Copied to clipboard!');
        }
    }, undefined, context.subscriptions);
}

async function applyCodeFix(fixedCode: string, _language: string) {
    // vscode.window.activeTextEditor is undefined right now because the webview
    // panel (where the "Apply Fix" button lives) currently has focus. Fall back
    // to the last real text editor the user was in.
    const editor = vscode.window.activeTextEditor || lastActiveEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor. Open the file you want to fix first, then try again.');
        return;
    }

    // Bring the target editor back into focus so the QuickPick and the resulting
    // edit are clearly applied to the right file, and the user can see it happen.
    const targetDoc = editor.document;
    const shownEditor = await vscode.window.showTextDocument(targetDoc, {
        viewColumn: editor.viewColumn,
        preserveFocus: false,
        preview: false
    });

    const choice = await vscode.window.showQuickPick(
        ['Replace entire file content', 'Insert at cursor', 'Cancel'],
        { placeHolder: 'How should CoderAI apply the fix?' }
    );
    if (!choice || choice === 'Cancel') return;

    const edit = new vscode.WorkspaceEdit();
    if (choice === 'Replace entire file content') {
        const fullRange = new vscode.Range(
            targetDoc.positionAt(0),
            targetDoc.positionAt(targetDoc.getText().length)
        );
        edit.replace(targetDoc.uri, fullRange, fixedCode);
    } else {
        edit.insert(targetDoc.uri, shownEditor.selection.active, '\n' + fixedCode + '\n');
    }

    const applied = await vscode.workspace.applyEdit(edit);
    if (applied) {
        vscode.window.showInformationMessage('✅ CoderAI applied the fix!');
    } else {
        vscode.window.showErrorMessage('⚠️ CoderAI could not apply the fix to the file.');
    }
}

function looksLikeError(text: string): boolean {
    const errorPatterns = [
        /traceback \(most recent call last\)/i,
        /\berror:/i,
        /\bexception:/i,
        /syntaxerror/i,
        /typeerror/i,
        /nameerror/i,
        /valueerror/i,
        /importerror/i,
        /modulenotfounderror/i,
        /cannot find module/i,
        /npm err!/i,
        /command not found/i,
        /permission denied/i,
        /failed to compile/i,
        /unhandledpromiserejection/i,
        /segmentation fault/i,
        /java\.lang\.\w+exception/i,
        /\berror\b.*line \d+/i,
        /at .+:\d+:\d+/,
        /exit code [1-9]/i,
    ];
    return errorPatterns.some(p => p.test(text));
}

function stripAnsi(text: string): string {
    return text
        .replace(/\x1B\[[0-9;]*[mGKHF]/g, '')
        .replace(/\x1B\][^\x07]*\x07/g, '')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

export function deactivate() {}