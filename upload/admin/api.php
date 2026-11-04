<?php
// =========================================================
//  SKG ADMIN API - lets admin/index.html (the editor) save the
//  website on the hosting. Password protected.
//  status | setup | login | logout | save | upload
//  Private data (password hash, backups) lives in admin/.data,
//  which .htaccess blocks from the web.
// =========================================================
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$SITE = dirname(__DIR__);
$DATA = __DIR__ . '/.data';
$AUTH = "$DATA/auth.json";
$CODE = "$DATA/setup-code.txt";
$LOCK = "$DATA/lock.json";

// Pages the editor may overwrite, and file types it may add to uploads/.
$PAGES = ['index.html', 'projects.html', 'projects.js'];
$UPLOAD_TYPES = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov', 'm4v'];
$MAX_PAGE = 2 * 1024 * 1024;

function out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}
function fail($msg, $code = 400) { out(['ok' => false, 'error' => $msg], $code); }

if (!is_dir($DATA)) @mkdir($DATA, 0700, true);
if (!file_exists("$DATA/.htaccess")) {
    @file_put_contents("$DATA/.htaccess", "Require all denied\nDeny from all\n");
}

$action = isset($_GET['action']) ? $_GET['action'] : '';
$isPost = $_SERVER['REQUEST_METHOD'] === 'POST';

// Writes need a custom header, which other websites cannot send here (no CORS).
if ($isPost && (!isset($_SERVER['HTTP_X_SKG_ADMIN']) || $_SERVER['HTTP_X_SKG_ADMIN'] !== '1')) {
    fail('Bad request', 400);
}

function loggedIn() { return !empty($_SESSION['skg_admin']); }
function body() {
    $j = json_decode(file_get_contents('php://input'), true);
    return is_array($j) ? $j : [];
}
function readJson($f) {
    if (!file_exists($f)) return [];
    $j = json_decode(@file_get_contents($f), true);
    return is_array($j) ? $j : [];
}
function stamp() { return date('Ymd-His'); }

switch ($action) {

case 'status':
    out(['ok' => true, 'setup' => !file_exists($AUTH), 'loggedIn' => loggedIn()]);

// First visit: the one-time setup code (from the upload) lets the owner choose the password.
case 'setup':
    if (!$isPost) fail('POST only', 405);
    if (file_exists($AUTH)) fail('Password is already set. Log in instead.', 409);
    $b = body();
    $code = isset($b['code']) ? trim($b['code']) : '';
    $pass = isset($b['password']) ? $b['password'] : '';
    $real = file_exists($CODE) ? trim(file_get_contents($CODE)) : '';
    if ($real === '' || !hash_equals($real, $code)) { sleep(1); fail('Wrong setup code.', 403); }
    if (strlen($pass) < 8) fail('Use at least 8 characters.');
    file_put_contents($AUTH, json_encode(['hash' => password_hash($pass, PASSWORD_DEFAULT)]), LOCK_EX);
    @unlink($CODE);
    session_regenerate_id(true);
    $_SESSION['skg_admin'] = true;
    out(['ok' => true]);

// 5 wrong passwords lock the login for 15 minutes.
case 'login':
    if (!$isPost) fail('POST only', 405);
    $auth = readJson($AUTH);
    if (empty($auth['hash'])) fail('No password set yet.', 409);
    $lock = readJson($LOCK);
    if (!empty($lock['until']) && time() < $lock['until']) {
        fail('Too many wrong passwords. Try again in ' . ceil(($lock['until'] - time()) / 60) . ' min.', 429);
    }
    $b = body();
    $pass = isset($b['password']) ? $b['password'] : '';
    if (!password_verify($pass, $auth['hash'])) {
        sleep(1);
        $fails = (isset($lock['fails']) ? $lock['fails'] : 0) + 1;
        $lock = $fails >= 5 ? ['fails' => 0, 'until' => time() + 15 * 60] : ['fails' => $fails];
        file_put_contents($LOCK, json_encode($lock), LOCK_EX);
        fail('Wrong password.', 403);
    }
    @unlink($LOCK);
    session_regenerate_id(true);
    $_SESSION['skg_admin'] = true;
    out(['ok' => true]);

case 'logout':
    $_SESSION = [];
    session_destroy();
    out(['ok' => true]);

// Overwrite one page; the old copy goes to admin/.data/backups.
case 'save':
    if (!$isPost) fail('POST only', 405);
    if (!loggedIn()) fail('Please log in again.', 401);
    $b = body();
    $file = isset($b['file']) ? $b['file'] : '';
    $content = isset($b['content']) ? $b['content'] : null;
    if (!in_array($file, $PAGES, true)) fail('That file cannot be edited.');
    if (!is_string($content) || strlen($content) < 20 || strlen($content) > $MAX_PAGE) fail('Content is empty or too big.');
    if (substr($file, -5) === '.html' && stripos($content, '<html') === false) fail('That does not look like a full page.');
    $path = "$SITE/$file";
    $bdir = "$DATA/backups";
    if (!is_dir($bdir)) @mkdir($bdir, 0700, true);
    $backup = '';
    if (file_exists($path)) {
        $dot = strrpos($file, '.');
        $backup = substr($file, 0, $dot) . '-' . stamp() . substr($file, $dot);
        @copy($path, "$bdir/$backup");
    }
    if (file_put_contents($path, $content, LOCK_EX) === false) fail('Could not write ' . $file, 500);
    out(['ok' => true, 'backup' => $backup]);

// Add a picture or video to uploads/ under a safe, unique name.
case 'upload':
    if (!$isPost) fail('POST only', 405);
    if (!loggedIn()) fail('Please log in again.', 401);
    if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        $err = empty($_FILES['file']) ? -1 : $_FILES['file']['error'];
        if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) fail('File is too big for the hosting (max about 10 MB).');
        fail('Upload failed.');
    }
    $f = $_FILES['file'];
    $name = preg_replace('/[^\w.\-]/', '-', basename($f['name']));
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!in_array($ext, $UPLOAD_TYPES, true)) fail('Only pictures (jpg, png, gif, webp) and videos (mp4, webm, mov) can be added.');
    $isImage = in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp'], true);
    if ($isImage && @getimagesize($f['tmp_name']) === false) fail('That file is not a valid picture.');
    $dir = "$SITE/uploads";
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $stem = pathinfo($name, PATHINFO_FILENAME);
    if ($stem === '') $stem = 'file';
    $final = "$stem.$ext";
    for ($n = 1; file_exists("$dir/$final"); $n++) $final = "$stem-$n.$ext";
    if (!move_uploaded_file($f['tmp_name'], "$dir/$final")) fail('Could not save the file.', 500);
    @chmod("$dir/$final", 0644);
    out(['ok' => true, 'path' => "uploads/$final"]);

default:
    fail('Unknown action', 404);
}
