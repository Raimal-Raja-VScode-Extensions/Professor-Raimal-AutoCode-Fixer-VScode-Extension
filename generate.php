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
    . "Analyze this error and respond ONLY with a valid JSON object (no markdown, no backticks, no extra text).\n"
    . "Error from terminal:\n{$errorText}\n"
    . ($fileCode ? "Code from active file:\n{$fileCode}\n" : '')
    . "{$fileInfo}\n"
    . "Respond with EXACTLY this JSON structure:\n"
    . '{"errorType":"code_error|dependency_error|configuration_error|permission_error|other",'
    . '"errorTitle":"...", "whyItHappened":"...", "howToFix":"step1\\nstep2",'
    . '"fixedCode":"...", "dependencyCommand":"...", "severity":"low|medium|high"}';

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
        'max_tokens' => 1500,
    ]),
    CURLOPT_TIMEOUT => 30,
]);
$response = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

if (!$response || $status >= 400) {
    http_response_code(502);
    echo json_encode([
        'error' => [
            'message' => 'Upstream model call failed',
            // TEMPORARY debug fields — remove these once this is confirmed working.
            'debug_http_status' => $status,
            'debug_curl_error' => $curlErr,
            'debug_raw_response' => $response ? substr($response, 0, 500) : null,
        ]
    ]);
    exit;
}

$data = json_decode($response, true);
// OpenAI-compatible shape: choices[0].message.content  (this replaces Gemini's candidates[0].content.parts[0].text)
$rawText = $data['choices'][0]['message']['content'] ?? '';
$rawText = preg_replace('/```json\s*|```\s*/', '', $rawText);

$result = json_decode(trim($rawText), true);
if (!$result) {
    http_response_code(502);
    echo json_encode(['error' => ['message' => 'Model returned unparseable output']]);
    exit;
}

echo json_encode($result);