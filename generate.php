<?php
// coder.kvtech.net/api/generate.php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// FIX: this endpoint is public and, once the extension is on the Marketplace,
// will be called by every installer's VS Code instance. There was previously
// no rate limiting at all (the old TODO comment), so a single misbehaving
// client (or the auto-detect firing repeatedly on a noisy terminal) could
// exhaust your CoderAI/NVIDIA quota for every other user. This is a simple
// per-IP sliding-window limiter using local temp files — no database needed.
// NOTE: Access-Control-Allow-Origin stays "*" above intentionally — requests
// come from vscode-webview:// origins that VS Code generates per-session and
// can't be allow-listed in advance, so per-IP rate limiting (not Origin
// checking) is the practical control here.
function coderai_rate_limit(string $ip, int $maxRequests = 20, int $windowSeconds = 60): bool {
    $dir = sys_get_temp_dir() . '/coderai_rl';
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    $file = $dir . '/' . md5($ip) . '.json';
    $now = time();
    $data = ['count' => 0, 'window_start' => $now];

    $raw = @file_get_contents($file);
    if ($raw !== false) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded) && isset($decoded['count'], $decoded['window_start'])) {
            $data = $decoded;
        }
    }

    if ($now - $data['window_start'] >= $windowSeconds) {
        $data = ['count' => 0, 'window_start' => $now];
    }

    $data['count']++;
    @file_put_contents($file, json_encode($data));

    return $data['count'] <= $maxRequests;
}

$clientIp = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
if (is_string($clientIp) && strpos($clientIp, ',') !== false) {
    $clientIp = trim(explode(',', $clientIp)[0]);
}
if (!coderai_rate_limit($clientIp)) {
    http_response_code(429);
    echo json_encode(['error' => ['message' => 'Too many requests. Please wait a moment and try again.']]);
    exit;
}

// The REAL provider key lives only here, in a private file OUTSIDE the web root —
// never in a response body, never in a file served to the client.
$secretsPath = dirname(__DIR__, 2) . '/private/coderai-secrets.php';
if (!file_exists($secretsPath)) {
    http_response_code(500);
    echo json_encode(['error' => ['message' => 'Server misconfigured: secrets file missing']]);
    exit;
}
$secrets = require $secretsPath;
$PROVIDER_API_KEY = $secrets['CODERAI_API_KEY'] ?? '';

if ($PROVIDER_API_KEY === '' || $PROVIDER_API_KEY === 'PUT_YOUR_REAL_CODERAI_KEY_HERE') {
    http_response_code(500);
    echo json_encode(['error' => ['message' => 'Server misconfigured: CoderAI API key not set']]);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!$input || empty($input['errorText'])) {
    http_response_code(400);
    echo json_encode(['error' => ['message' => 'Missing errorText']]);
    exit;
}

// TODO: basic abuse protection — e.g. rate limit by IP, cap $input sizes.

$errorText = substr($input['errorText'], 0, 2000);
$fileCode  = substr($input['fileCode'] ?? '', 0, 1500);
$fileInfo  = $input['fileInfo'] ?? '';

$prompt = "You are CoderAI, an expert programming assistant embedded in VS Code.\n"
    . "Analyze this error or warning and respond ONLY with a valid JSON object (no markdown, no backticks, no extra text).\n"
    . "Error/warning from terminal:\n{$errorText}\n"
    . ($fileCode ? "Code from active file:\n{$fileCode}\n" : '')
    . "{$fileInfo}\n"
    . "Respond with EXACTLY this JSON structure:\n"
    . '{"errorType":"code_error|dependency_error|configuration_error|permission_error|other",'
    . '"errorTitle":"...", "whyItHappened":"...", "howToFix":"step1\\nstep2",'
    . '"fixedCode":"...", "dependencyCommand":"...", "severity":"low|medium|high"}'
    // FIX: the model was frequently omitting fixedCode (leaving it blank or
    // absent), which meant the "Apply Fix to File" button never rendered in
    // the webview even for straightforward code_error cases. Making the
    // requirement explicit and giving an escape hatch for genuinely
    // code-less cases (pure dependency/config issues).
    . "\nIMPORTANT: fixedCode must NOT be left blank or omitted whenever the "
    . "issue is a code_error or configuration_error — always include the "
    . "full corrected code snippet there, even for a one-line change. Only "
    . "for a pure dependency_error with no code change required, you may set "
    . 'fixedCode to a short comment like "// No code change needed — install the dependency below".';

// NVIDIA NIM / build.nvidia.com uses an OpenAI-compatible chat completions endpoint.
$CODERAI_BASE_URL  = $secrets['CODERAI_BASE_URL'] ?? 'https://integrate.api.nvidia.com/v1';
// Set this to whichever model you picked on build.nvidia.com for your "Professor-Raimal" model.
$CODERAI_MODEL_ID  = $secrets['CODERAI_MODEL_ID'] ?? 'meta/llama-3.1-70b-instruct';

$ch = curl_init(rtrim($CODERAI_BASE_URL, '/') . '/chat/completions');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $PROVIDER_API_KEY,
    ],
    CURLOPT_POSTFIELDS => json_encode([
        'model' => $CODERAI_MODEL_ID,
        'messages' => [
            ['role' => 'user', 'content' => $prompt],
        ],
        'temperature' => 0.2,
        // FIX: 1500 tokens was regularly not enough headroom for
        // whyItHappened + howToFix + a full fixedCode snippet inside a single
        // JSON object. When the model ran out of tokens mid-response, the
        // JSON was truncated (e.g. a fixedCode string cut off with no closing
        // quote/brace), so json_decode() below would fail — either returning
        // the generic "Model returned unparseable output" 502, or in cases
        // where an earlier partial parse still worked, silently dropping
        // fixedCode entirely. That's the direct cause of "no fixed code" /
        // "no Apply button" for anything beyond a trivial one-line error.
        'max_tokens' => 3000,
    ]),
    CURLOPT_TIMEOUT => 30,
]);
$response = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

if (!$response || $status >= 400) {
    // FIX: previously this echoed debug_http_status / debug_curl_error /
    // debug_raw_response back to the client (marked "TEMPORARY ... remove
    // once confirmed working" in the original comment, but never removed).
    // That leaked upstream infrastructure details (provider status codes,
    // raw response bodies) to anyone hitting this endpoint. Log server-side
    // instead and return a generic message to the client.
    error_log(sprintf(
        'CoderAI upstream call failed: status=%s curl_error=%s body=%s',
        $status,
        $curlErr,
        $response ? substr($response, 0, 500) : '(no response)'
    ));
    http_response_code(502);
    echo json_encode(['error' => ['message' => 'Upstream model call failed. Please try again in a moment.']]);
    exit;
}

$data = json_decode($response, true);
// OpenAI-compatible shape: choices[0].message.content  (this replaces Gemini's candidates[0].content.parts[0].text)
$rawText = $data['choices'][0]['message']['content'] ?? '';
$finishReason = $data['choices'][0]['finish_reason'] ?? null;
$rawText = preg_replace('/```json\s*|```\s*/', '', $rawText);

$result = json_decode(trim($rawText), true);
if (!$result) {
    // FIX: if the model got cut off by the token limit (finish_reason ===
    // "length"), say so explicitly server-side and to the client, instead of
    // the generic message — this is what was happening most of the time
    // fixedCode never showed up, before max_tokens was raised above.
    error_log('CoderAI: json_decode failed, finish_reason=' . ($finishReason ?? 'unknown') . ' raw=' . substr($rawText, 0, 500));
    http_response_code(502);
    $clientMessage = $finishReason === 'length'
        ? 'Model response was cut off before finishing. Try again — if this keeps happening, the error/code you pasted may be too long.'
        : 'Model returned unparseable output';
    echo json_encode(['error' => ['message' => $clientMessage]]);
    exit;
}

// Fill in any keys the model omitted so the webview always has a consistent
// shape to render, instead of quietly missing sections.
$result = array_merge([
    'errorType' => 'other',
    'errorTitle' => 'Unknown Error',
    'whyItHappened' => '',
    'howToFix' => '',
    'fixedCode' => '',
    'dependencyCommand' => '',
    'severity' => 'medium',
], $result);

if (trim($result['fixedCode']) === '' && in_array($result['errorType'], ['code_error', 'configuration_error'], true)) {
    // Server-side only — never sent to the client — so this is safe to log
    // and lets you see how often the model is skipping fixedCode.
    error_log('CoderAI: model returned empty fixedCode for errorType=' . $result['errorType']);
}

echo json_encode($result);