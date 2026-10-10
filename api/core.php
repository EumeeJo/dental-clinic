<?php
/* ============================================================
   core.php - shared helpers for every API file
   (database, session, JSON replies, row <-> JSON converters)
   ============================================================ */
require_once __DIR__ . '/config.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
    session_start();
}

const SLOT_TIMES = [
    '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
    '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM',
    '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM'
];
const STATUSES = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];
const NOTE_TYPES = ['request', 'scheduled', 'confirmed', 'completed', 'declined', 'cancelled', 'patient-cancelled'];

/* ---------- replies ---------- */
function json_out(array $data, int $code = 200): void {
    if (!headers_sent()) {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(string $message, int $code = 400): void {
    json_out(['ok' => false, 'error' => $message], $code);
}

/* ---------- request ---------- */
function body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/* POSTs must carry our custom header: a plain cross-site form cannot send it (CSRF guard). */
function require_post(): void {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Use POST for this action.', 405);
    if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'ambayec') fail('Bad request.', 400);
}

/* ---------- database ---------- */
function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    try {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
        $pdo->exec("SET time_zone = '+00:00'");
    } catch (PDOException $e) {
        fail('Cannot connect to the database. Start MySQL, then open api/setup.php once. (' . $e->getMessage() . ')', 500);
    }
    return $pdo;
}

/* ---------- validation ---------- */
function clean($value, int $max = 255): string {
    $s = trim((string)($value ?? ''));
    return function_exists('mb_substr') ? mb_substr($s, 0, $max, 'UTF-8') : substr($s, 0, $max);
}
function valid_date(string $d): bool {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) return false;
    [$y, $m, $day] = array_map('intval', explode('-', $d));
    return checkdate($m, $day, $y);
}
function age_of(string $dob): ?int {
    if (!valid_date($dob)) return null;
    $birth = new DateTime($dob);
    $now = new DateTime('today');
    if ($birth > $now) return null;
    return (int)$birth->diff($now)->y;
}
function initial(string $s): string {
    $s = trim($s);
    if ($s === '') return '';
    return (function_exists('mb_substr') ? mb_strtoupper(mb_substr($s, 0, 1, 'UTF-8'), 'UTF-8') : strtoupper(substr($s, 0, 1))) . '. ';
}
function valid_email(string $e): bool { return (bool)filter_var($e, FILTER_VALIDATE_EMAIL); }

/* ---------- ids (reserved atomically so two people never get the same one) ---------- */
function next_id(string $kind): string {
    $pdo = db();
    $prefix = $kind === 'patient' ? 'P' : 'APT';
    $table = $kind === 'patient' ? 'patients' : 'appointments';
    $col = $kind === 'patient' ? 'patient_id' : 'id';
    for ($i = 0; $i < 10; $i++) {
        $pdo->prepare('UPDATE counters SET value = LAST_INSERT_ID(value + 1) WHERE name = ?')->execute([$kind]);
        $n = (int)$pdo->query('SELECT LAST_INSERT_ID()')->fetchColumn();
        $id = sprintf('%s-%s-%04d', $prefix, date('Y'), $n);
        $st = $pdo->prepare("SELECT 1 FROM $table WHERE $col = ?");
        $st->execute([$id]);
        if (!$st->fetchColumn()) return $id;
    }
    fail('Could not create a new ID. Please try again.', 500);
}

/* ---------- who is logged in ---------- */
function current_user(): ?array {
    if (empty($_SESSION['uid'])) return null;
    $st = db()->prepare('SELECT id, username, email, role, patient_id FROM users WHERE id = ?');
    $st->execute([$_SESSION['uid']]);
    $u = $st->fetch();
    return $u ?: null;
}
function require_login(): array {
    $u = current_user();
    if (!$u) fail('Please log in first.', 401);
    return $u;
}
function require_dentist(): array {
    $u = require_login();
    if ($u['role'] !== 'dentist') fail('Only the dentist can do that.', 403);
    return $u;
}
/* the name the notification bell listens to: 'dentist' or the patient's ID */
function recipient_of(array $u): string {
    return $u['role'] === 'dentist' ? 'dentist' : (string)$u['patient_id'];
}

/* ---------- row -> JSON shapes the frontend already uses ---------- */
function patient_js(array $r): array {
    return [
        'patientId' => $r['patient_id'], 'firstName' => $r['first_name'], 'middleName' => $r['middle_name'],
        'lastName' => $r['last_name'], 'dob' => $r['dob'] ?? '', 'gender' => $r['gender'],
        'contact' => $r['contact'], 'email' => $r['email'], 'address' => $r['address'],
    ];
}
function appt_js(array $r): array {
    $a = [
        'id' => $r['id'], 'patientId' => $r['patient_id'], 'patientName' => $r['patient_name'],
        'patientContact' => $r['patient_contact'], 'service' => $r['service'], 'dentist' => $r['dentist'],
        'date' => $r['appt_date'], 'time' => $r['appt_time'], 'status' => $r['status'],
    ];
    if ($r['created_by'] === 'dentist') $a['createdBy'] = 'dentist';
    return $a;
}
function note_js(array $r): array {
    return [
        'id' => $r['id'], 'to' => $r['recipient'], 'type' => $r['type'], 'title' => $r['title'],
        'message' => $r['message'], 'apptId' => $r['appt_id'],
        'time' => gmdate('Y-m-d\TH:i:s\Z', strtotime($r['created_at'] . ' UTC')),
        'read' => (bool)$r['is_read'],
    ];
}

/* ---------- everything the logged-in person is allowed to see ---------- */
function snapshot(array $u): array {
    $pdo = db();
    $out = ['role' => $u['role']];

    $blocked = [];
    foreach ($pdo->query('SELECT slot_date, slot_time FROM blocked_slots ORDER BY slot_date, slot_time') as $b) {
        $blocked[] = ['date' => $b['slot_date'], 'time' => $b['slot_time']];
    }
    $out['blocked'] = $blocked;

    if ($u['role'] === 'dentist') {
        $out['me'] = null;
        $out['appointments'] = array_map('appt_js', $pdo->query('SELECT * FROM appointments ORDER BY appt_date, id')->fetchAll());
        $out['patients'] = array_map('patient_js', $pdo->query('SELECT * FROM patients ORDER BY patient_id')->fetchAll());
        $out['taken'] = [];
        $p = $pdo->query('SELECT full_name, email, contact FROM dentist_profile WHERE id = 1')->fetch();
        $out['dentist'] = $p ? ['fullName' => $p['full_name'], 'email' => $p['email'], 'contact' => $p['contact']] : null;
    } else {
        $pid = (string)$u['patient_id'];
        $st = $pdo->prepare('SELECT * FROM patients WHERE patient_id = ?');
        $st->execute([$pid]);
        $me = $st->fetch();
        $out['me'] = $me ? patient_js($me) : null;
        $out['patients'] = $out['me'] ? [$out['me']] : [];

        $st = $pdo->prepare('SELECT * FROM appointments WHERE patient_id = ? ORDER BY appt_date, id');
        $st->execute([$pid]);
        $out['appointments'] = array_map('appt_js', $st->fetchAll());

        /* other people's booked times, with NO names - only so the calendar can grey them out */
        $st = $pdo->prepare("SELECT appt_date, appt_time FROM appointments WHERE status IN ('Pending','Confirmed') AND patient_id <> ?");
        $st->execute([$pid]);
        $taken = [];
        foreach ($st->fetchAll() as $t) $taken[] = ['date' => $t['appt_date'], 'time' => $t['appt_time']];
        $out['taken'] = $taken;
        $out['dentist'] = null;
    }

    $st = $pdo->prepare('SELECT * FROM notifications WHERE recipient = ? ORDER BY created_at DESC, id DESC LIMIT 200');
    $st->execute([recipient_of($u)]);
    $out['notifications'] = array_map('note_js', $st->fetchAll());
    return $out;
}
