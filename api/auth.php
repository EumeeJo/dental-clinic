<?php
/* ============================================================
   auth.php - login, register, logout, who-am-I, change password
   ============================================================ */
require_once __DIR__ . '/core.php';

$action = $_GET['action'] ?? '';

switch ($action) {

    /* ---------- who is logged in? ---------- */
    case 'me': {
        $u = current_user();
        if (!$u) json_out(['ok' => true, 'loggedIn' => false]);
        $first = 'Doctor';
        if ($u['role'] === 'patient') {
            $st = db()->prepare('SELECT first_name FROM patients WHERE patient_id = ?');
            $st->execute([$u['patient_id']]);
            $first = (string)($st->fetchColumn() ?: 'Patient');
        }
        json_out(['ok' => true, 'loggedIn' => true, 'role' => $u['role'], 'firstName' => $first]);
    }

    /* ---------- login ---------- */
    case 'login': {
        require_post();
        $in = body();
        $login = strtolower(clean($in['username'] ?? '', 120));
        $password = (string)($in['password'] ?? '');
        if ($login === '' || $password === '') fail('Please enter your email/username and password.');

        $st = db()->prepare('SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(username) = ? LIMIT 1');
        $st->execute([$login, $login]);
        $u = $st->fetch();

        if (!$u || !password_verify($password, $u['password_hash'])) {
            usleep(400000);                     // slows down password guessing
            fail('Incorrect email/username or password.', 401);
        }

        session_regenerate_id(true);
        $_SESSION['uid'] = (int)$u['id'];

        $first = 'Doctor';
        if ($u['role'] === 'patient') {
            $p = db()->prepare('SELECT first_name FROM patients WHERE patient_id = ?');
            $p->execute([$u['patient_id']]);
            $first = (string)($p->fetchColumn() ?: 'Patient');
        }
        json_out([
            'ok' => true, 'role' => $u['role'], 'firstName' => $first,
            'redirect' => $u['role'] === 'dentist' ? 'dentist-dashboard.html' : 'patient-dashboard.html',
        ]);
    }

    /* ---------- register a new patient ---------- */
    case 'register': {
        require_post();
        $in = body();
        $first = clean($in['firstName'] ?? '', 60);
        $middle = clean($in['middleName'] ?? '', 60);
        $last = clean($in['lastName'] ?? '', 60);
        $dob = clean($in['dob'] ?? '', 10);
        $gender = clean($in['gender'] ?? '', 20);
        $contact = clean($in['contact'] ?? '', 30);
        $email = strtolower(clean($in['email'] ?? '', 120));
        $address = clean($in['address'] ?? '', 255);
        $password = (string)($in['password'] ?? '');

        if ($first === '' || $last === '') fail('First name and last name are required.');
        $age = age_of($dob);
        if ($age === null || $age > 120) fail('Please enter a valid date of birth.');
        if ($age < 18) fail('Patients under 18 cannot create an account. A parent or guardian must register.');
        if (!valid_email($email)) fail('Please enter a valid email address.');
        if (strlen($password) < 8) fail('Your password must be at least 8 characters.');
        if (strlen($password) > 200) fail('That password is too long.');

        $pdo = db();
        $st = $pdo->prepare('SELECT 1 FROM users WHERE LOWER(email) = ?');
        $st->execute([$email]);
        if ($st->fetchColumn()) fail('An account with that email already exists. Try logging in instead.', 409);

        try {
            $pdo->beginTransaction();
            $pid = next_id('patient');
            $pdo->prepare('INSERT INTO patients (patient_id, first_name, middle_name, last_name, dob, gender, contact, email, address)
                           VALUES (?,?,?,?,?,?,?,?,?)')
                ->execute([$pid, $first, $middle, $last, $dob, $gender, $contact, $email, $address]);
            $pdo->prepare("INSERT INTO users (email, password_hash, role, patient_id) VALUES (?,?, 'patient', ?)")
                ->execute([$email, password_hash($password, PASSWORD_DEFAULT), $pid]);
            $pdo->commit();
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            fail('Could not create the account: ' . $e->getMessage(), 500);
        }
        json_out(['ok' => true, 'patientId' => $pid]);
    }

    /* ---------- change password (needs the current one) ---------- */
    case 'change_password': {
        require_post();
        $u = require_login();
        $in = body();
        $current = (string)($in['current'] ?? '');
        $next = (string)($in['next'] ?? '');
        if (strlen($next) < 8) fail('Use at least 8 characters.');
        if (strlen($next) > 200) fail('That password is too long.');

        $st = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
        $st->execute([$u['id']]);
        if (!password_verify($current, (string)$st->fetchColumn())) fail('Your current password is incorrect.', 403);

        db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($next, PASSWORD_DEFAULT), $u['id']]);
        json_out(['ok' => true]);
    }

    /* ---------- logout ---------- */
    case 'logout': {
        require_post();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        session_destroy();
        json_out(['ok' => true]);
    }

    default:
        fail('Unknown action.', 404);
}
