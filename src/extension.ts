import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;
let panel: vscode.WebviewPanel | undefined;
let lastTerminalOutput = '';
let pollingInterval: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('Professor Raimal');

    // Status bar button
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = '$(sparkle) Prof. Raimal';
    statusBarItem.tooltip = 'Click to analyze terminal for errors';
    statusBarItem.command = 'professor-raimal.analyzeTerminal';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('professor-raimal.fixError', (errorText: string) => {
            analyzeAndFix(context, errorText);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('professor-raimal.analyzeTerminal', () => {
            captureAndAnalyzeTerminal(context);
        })
    );

    // Register the terminal link provider to detect errors in terminal links
    context.subscriptions.push(
        vscode.window.registerTerminalLinkProvider({
            provideTerminalLinks(terminalContext, _token) {
                const config = vscode.workspace.getConfiguration('professorRaimal');
                if (!config.get('autoDetect')) return [];

                const line = terminalContext.line;
                if (looksLikeError(line)) {
                    lastTerminalOutput = line;
                    return [{
                        startIndex: 0,
                        length: line.length,
                        tooltip: '✨ Professor Raimal: Click to fix this error'
                    }];
                }
                return [];
            },
            handleTerminalLink(_link) {
                if (lastTerminalOutput) {
                    const ctx = (activate as any)._context;
                    if (ctx) analyzeAndFix(ctx, lastTerminalOutput);
                }
            }
        })
    );

    // Store context for use in link handler
    (activate as any)._context = context;

    outputChannel.appendLine('Professor Raimal is active 👀');
}

function captureAndAnalyzeTerminal(context: vscode.ExtensionContext) {
    // Ask user to paste their error — most reliable cross-platform approach
    // since terminal read API is proposed/unstable in VS Code
    vscode.window.showInputBox({
        prompt: '📋 Paste your error message here (or copy terminal output first):',
        placeHolder: 'e.g. TypeError: Cannot read property of undefined...',
        ignoreFocusOut: true,
        value: lastTerminalOutput.trim() ? lastTerminalOutput.trim().substring(0, 500) : ''
    }).then(input => {
        if (input && input.trim()) {
            analyzeAndFix(context, input.trim());
        }
    });
}

function analyzeAndFix(context: vscode.ExtensionContext, errorText: string) {
    if (!errorText || errorText.trim().length < 5) {
        vscode.window.showWarningMessage('No error text to analyze.');
        return;
    }

    const activeEditor = vscode.window.activeTextEditor;
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
            'professorRaimal',
            '✨ Professor Raimal',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
            }
        );
        panel.onDidDispose(() => { panel = undefined; });
    }

    const webviewPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'webview.html');
    let html = fs.readFileSync(webviewPath.fsPath, 'utf8');
    panel.webview.html = html;

    panel.webview.onDidReceiveMessage(async (message) => {
        if (message.command === 'ready') {
            panel!.webview.postMessage({
                command: 'analyze',
                errorText: errorText,
                fileInfo: fileInfo,
                fileCode: fileCode
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

async function applyCodeFix(fixedCode: string, language: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor. Open the file you want to fix first.');
        return;
    }

    const choice = await vscode.window.showQuickPick(
        ['Replace entire file content', 'Insert at cursor', 'Cancel'],
        { placeHolder: 'How should Professor Raimal apply the fix?' }
    );

    if (!choice || choice === 'Cancel') return;

    const edit = new vscode.WorkspaceEdit();

    if (choice === 'Replace entire file content') {
        const fullRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(editor.document.getText().length)
        );
        edit.replace(editor.document.uri, fullRange, fixedCode);
    } else {
        edit.insert(editor.document.uri, editor.selection.active, '\n' + fixedCode + '\n');
    }

    await vscode.workspace.applyEdit(edit);
    vscode.window.showInformationMessage('✅ Professor Raimal applied the fix!');
}

function looksLikeError(text: string): boolean {
    const errorPatterns = [
        /traceback \(most recent call last\)/i,
        /error:/i,
        /exception:/i,
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
    ];
    return errorPatterns.some(p => p.test(text));
}

export function deactivate() {
    if (pollingInterval) clearInterval(pollingInterval);
}