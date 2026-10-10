<?php
/* ============================================================
   setup.php - one-click database setup
   Open  http://localhost/dental-clinic/api/setup.php  once.
   It creates the database + tables and adds the starter accounts.
   Add  ?demo=1  to also load sample patients and appointments.
   Safe to run again: nothing is duplicated.
   ============================================================ */
require_once __DIR__ . '/config.php';
header('Content-Type: text/html; charset=utf-8');

if (!SETUP_ENABLED) { http_response_code(403); exit('Setup is turned off (see api/config.php).'); }

$log = [];
$ok = true;
function say(string $msg, bool $good = true): void { global $log; $log[] = [$good, $msg]; }

try {
    /* 1) connect to the MySQL server (no database yet) and run schema.sql */
    $server = new PDO('mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';charset=utf8mb4', DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

    $sql = file_get_contents(__DIR__ . '/../database/schema.sql');
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);                    // drop comment lines
    $sql = str_replace('ambayec_dental', DB_NAME, $sql);
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $statement) {
        $server->exec($statement);
    }
    say('Database "' . DB_NAME . '" and all tables are ready.');

    require_once __DIR__ . '/core.php';
    $pdo = db();

    /* 2) starter accounts */
    $pdo->prepare('INSERT IGNORE INTO dentist_profile (id, full_name, email, contact) VALUES (1, ?, ?, ?)')
        ->execute(['Jenina R. Ambayec', 'jenina.ambayec@email.com', '(0921) 249 3296']);

    $has = $pdo->prepare('SELECT 1 FROM users WHERE username = ?');
    $has->execute(['dentist']);
    if (!$has->fetchColumn()) {
        $pdo->prepare("INSERT INTO users (username, email, password_hash, role) VALUES ('dentist', 'jenina.ambayec@email.com', ?, 'dentist')")
            ->execute([password_hash('dentist123', PASSWORD_DEFAULT)]);
        say('Dentist account created.');
    } else {
        say('Dentist account already exists.');
    }

    $pdo->prepare("INSERT IGNORE INTO patients (patient_id, first_name, middle_name, last_name, dob, gender, contact, email, address)
                   VALUES ('P-2026-0000', 'Juan', 'Dela', 'Cruz', '1995-05-20', 'Male', '09123456789', 'juan.delacruz@email.com', 'San Pedro, Laguna')")->execute();
    $has = $pdo->prepare('SELECT 1 FROM users WHERE patient_id = ?');
    $has->execute(['P-2026-0000']);
    if (!$has->fetchColumn()) {
        $pdo->prepare("INSERT INTO users (email, password_hash, role, patient_id) VALUES ('juan.delacruz@email.com', ?, 'patient', 'P-2026-0000')")
            ->execute([password_hash('patient123', PASSWORD_DEFAULT)]);
        say('Sample patient account (Juan Dela Cruz) created.');
    }
    $ins = $pdo->prepare("INSERT IGNORE INTO appointments (id, patient_id, patient_name, patient_contact, service, dentist, appt_date, appt_time, status)
                          VALUES (?, 'P-2026-0000', 'Juan D. Cruz', '09123456789', 'Dental Cleaning', ?, ?, '10:00 AM', ?)");
    $ins->execute(['APT-2026-0067', DENTIST_NAME, '2026-10-16', 'Pending']);
    $ins->execute(['APT-2026-0052', DENTIST_NAME, '2026-09-16', 'Completed']);
    $ins->execute(['APT-2026-0041', DENTIST_NAME, '2026-08-16', 'Completed']);

    /* 3) optional demo clinic data (dates are relative to today) */
    if (isset($_GET['demo'])) {
        $names = [
            101 => ['Light', 'Yagami', '+63 293 012 3223'], 102 => ['Shigeo', 'Kageyama', '+63 912 345 6702'],
            103 => ['Kyryll', 'Flins', '+63 917 345 6703'], 104 => ['Vyn', 'Richter', '+63 918 345 6704'],
            105 => ['Misa', 'Amane', '+63 212 345 2131'],   106 => ['Shinjiro', 'Aragaki', '+63 919 345 6706'],
            107 => ['L', 'Lawliet', '+63 920 345 6707'],    108 => ['Misaoto', 'Yuki', '+63 921 345 6708'],
            109 => ['Vyn', 'Kitzner', '+63 922 345 6709'],  110 => ['Kotone', 'Shiomi', '+63 432 234 1234'],
        ];
        $pp = $pdo->prepare('INSERT IGNORE INTO patients (patient_id, first_name, last_name, contact, email) VALUES (?,?,?,?,?)');
        foreach ($names as $n => [$f, $l, $c]) {
            $pp->execute([sprintf('P-2026-%04d', $n), $f, $l, $c, strtolower($f . '.' . $l) . '@gmail.com']);
        }

        $day = function (int $offset): string {
            $d = new DateTime('today');
            $d->modify(($offset >= 0 ? '+' : '') . $offset . ' day');
            if ($d->format('w') === '0') $d->modify('+1 day');          // skip Sundays
            return $d->format('Y-m-d');
        };
        $today = date('Y-m-d');
        $rows = [
            [101, 'Dental Cleaning', $today, '9:00 AM', 'Completed'], [102, 'Consultation', $today, '10:00 AM', 'Completed'],
            [103, 'Dental Filling', $today, '11:00 AM', 'Pending'],   [104, 'Dental Cleaning', $today, '12:00 PM', 'Pending'],
            [105, 'Tooth Extraction', $today, '1:00 PM', 'Completed'], [106, 'Dental Filling', $today, '2:00 PM', 'Completed'],
            [107, 'Consultation', $today, '3:00 PM', 'Completed'],    [108, 'Dental Cleaning', $today, '4:00 PM', 'Cancelled'],
            [109, 'Dental Cleaning', $day(1), '9:00 AM', 'Confirmed'], [101, 'Consultation', $day(2), '9:00 AM', 'Confirmed'],
            [106, 'Dental Filling', $day(3), '9:00 AM', 'Confirmed'],  [107, 'Consultation', $day(4), '9:00 AM', 'Confirmed'],
            [108, 'Dental Cleaning', $day(5), '9:30 AM', 'Confirmed'], [110, 'Dental Cleaning', $day(-8), '10:00 AM', 'Completed'],
        ];
        $ap = $pdo->prepare('INSERT IGNORE INTO appointments (id, patient_id, patient_name, patient_contact, service, dentist, appt_date, appt_time, status)
                             VALUES (?,?,?,?,?,?,?,?,?)');
        $i = 100;
        foreach ($rows as [$n, $service, $date, $time, $status]) {
            $i++;
            [$f, $l, $c] = $names[$n];
            $ap->execute([sprintf('APT-2026-%04d', $i), sprintf('P-2026-%04d', $n), "$f $l", $c, $service, DENTIST_NAME, $date, $time, $status]);
        }

        $hasNote = (int)$pdo->query("SELECT COUNT(*) FROM notifications WHERE recipient = 'dentist'")->fetchColumn();
        if ($hasNote === 0) {
            $nn = $pdo->prepare("INSERT INTO notifications (id, recipient, type, title, message, appt_id, created_at) VALUES (?, 'dentist', 'request', 'New appointment request', ?, ?, ?)");
            $nn->execute(['N-demo-1', 'Kyryll Flins requested Dental Filling today at 11:00 AM.', 'APT-2026-0103', gmdate('Y-m-d H:i:s', time() - 4200)]);
            $nn->execute(['N-demo-2', 'Vyn Richter requested Dental Cleaning today at 12:00 PM.', 'APT-2026-0104', gmdate('Y-m-d H:i:s', time() - 1500)]);
        }
        say('Demo patients and appointments loaded.');
    }

    /* 4) make sure new IDs start after the biggest one already used */
    foreach (['appt' => ['appointments', 'id'], 'patient' => ['patients', 'patient_id']] as $kind => [$table, $col]) {
        $max = 0;
        foreach ($pdo->query("SELECT $col AS k FROM $table")->fetchAll() as $r) {
            $max = max($max, (int)substr((string)strrchr($r['k'], '-'), 1));
        }
        $pdo->prepare('UPDATE counters SET value = GREATEST(value, ?) WHERE name = ?')->execute([$max, $kind]);
    }
    say('ID counters are in sync.');
} catch (Throwable $e) {
    $ok = false;
    say('Setup failed: ' . $e->getMessage(), false);
}
?><!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Setup - Ambayec Dental Care Clinic</title>
<style>
  body{font-family:Poppins,system-ui,Arial,sans-serif;background:#f7fafc;color:#016a8a;margin:0;padding:40px 16px}
  .card{max-width:560px;margin:0 auto;background:#fff;border:1.5px solid #bde0ea;border-radius:20px;padding:30px;box-shadow:0 20px 50px rgba(1,106,138,.12)}
  h1{margin:0 0 4px;font-size:22px} p{color:#19a5cf;margin:0 0 18px;font-size:14px}
  .row{display:flex;gap:10px;padding:9px 12px;border-radius:10px;background:#f1f7fa;margin-bottom:8px;font-size:13.5px;color:#28485a}
  .row.bad{background:#fdecea;color:#c0392b} .dot{font-weight:800}
  table{width:100%;border-collapse:collapse;margin-top:18px;font-size:13px} td,th{padding:8px;border-bottom:1px solid #e2eef3;text-align:left}
  a.btn{display:inline-block;margin-top:20px;background:#016a8a;color:#fff;text-decoration:none;padding:11px 26px;border-radius:8px;font-weight:700;font-size:13.5px}
</style></head><body><div class="card">
  <h1><?= $ok ? 'Setup complete' : 'Setup problem' ?></h1>
  <p>Ambayec Dental Care Clinic</p>
  <?php foreach ($log as [$good, $msg]): ?>
    <div class="row <?= $good ? '' : 'bad' ?>"><span class="dot"><?= $good ? '✓' : '✕' ?></span><span><?= htmlspecialchars($msg) ?></span></div>
  <?php endforeach; ?>
  <?php if ($ok): ?>
    <table>
      <tr><th>Account</th><th>Login</th><th>Password</th></tr>
      <tr><td>Dentist</td><td>dentist</td><td>dentist123</td></tr>
      <tr><td>Sample patient</td><td>juan.delacruz@email.com</td><td>patient123</td></tr>
    </table>
    <p style="margin-top:14px;font-size:12.5px">Change the dentist password from the Profile page after your first login. No sample clinic data yet? Open this page with <b>?demo=1</b>.</p>
    <a class="btn" href="../login.html">Go to Login</a>
  <?php else: ?>
    <p style="margin-top:14px;font-size:12.5px">Check that MySQL is running and that the settings in <b>api/config.php</b> are right.</p>
  <?php endif; ?>
</div></body></html>
