<?php
/* ============================================================
   data.php - everything the dashboards read and save
   Every action checks WHO is logged in and what they may do:
     patient  -> only their own profile / appointments / notifications
     dentist  -> the whole clinic
   ============================================================ */
require_once __DIR__ . '/core.php';

$action = $_GET['action'] ?? '';

/* ---------- small helpers ---------- */
function slot_is_taken(PDO $pdo, string $date, string $time, string $exceptId = ''): bool {
    $st = $pdo->prepare("SELECT 1 FROM appointments WHERE appt_date = ? AND appt_time = ? AND status IN ('Pending','Confirmed') AND id <> ? LIMIT 1");
    $st->execute([$date, $time, $exceptId]);
    return (bool)$st->fetchColumn();
}
function slot_is_blocked(PDO $pdo, string $date, string $time): bool {
    $st = $pdo->prepare('SELECT 1 FROM blocked_slots WHERE slot_date = ? AND slot_time = ? LIMIT 1');
    $st->execute([$date, $time]);
    return (bool)$st->fetchColumn();
}
function is_active_status(string $s): bool { return $s === 'Pending' || $s === 'Confirmed'; }

switch ($action) {

    /* ============ read everything I may see ============ */
    case 'load': {
        $u = require_login();
        json_out(['ok' => true] + snapshot($u));
    }

    /* ============ reserve a new ID ============ */
    case 'next_id': {
        require_post();
        $u = require_login();
        $kind = (string)(body()['kind'] ?? '');
        if (!in_array($kind, ['appt', 'patient'], true)) fail('Unknown ID type.');
        if ($kind === 'patient' && $u['role'] !== 'dentist') fail('Only the dentist can do that.', 403);
        json_out(['ok' => true, 'id' => next_id($kind)]);
    }

    /* ============ create / update appointments ============ */
    case 'save_appointments': {
        require_post();
        $u = require_login();
        $list = body()['appointments'] ?? [];
        if (!is_array($list)) fail('Nothing to save.');
        $pdo = db();
        $isDentist = $u['role'] === 'dentist';
        $today = date('Y-m-d');

        try {
            $pdo->beginTransaction();

            foreach ($list as $a) {
                if (!is_array($a)) continue;
                $id = clean($a['id'] ?? '', 20);
                if (!preg_match('/^APT-\d{4}-\d{4,}$/', $id)) throw new RuntimeException('Invalid appointment ID.');

                $st = $pdo->prepare('SELECT * FROM appointments WHERE id = ? FOR UPDATE');
                $st->execute([$id]);
                $old = $st->fetch();

                /* ----- a patient: only their own, and only Pending / Cancelled ----- */
                if (!$isDentist) {
                    $pid = (string)$u['patient_id'];

                    if ($old) {
                        if ($old['patient_id'] !== $pid) throw new RuntimeException('That appointment is not yours.');
                        $newStatus = clean($a['status'] ?? $old['status'], 12);
                        if ($newStatus === $old['status']) continue;                       // nothing changed
                        if ($newStatus !== 'Cancelled' || !is_active_status($old['status'])) {
                            throw new RuntimeException('You can only cancel an upcoming appointment.');
                        }
                        $pdo->prepare('UPDATE appointments SET status = ? WHERE id = ?')->execute(['Cancelled', $id]);
                        continue;
                    }

                    $date = clean($a['date'] ?? '', 10);
                    $time = clean($a['time'] ?? '', 10);
                    $service = clean($a['service'] ?? '', 80);
                    if (!valid_date($date) || !in_array($time, SLOT_TIMES, true) || $service === '') {
                        throw new RuntimeException('Please choose a service, date and time.');
                    }
                    if ($date < $today) throw new RuntimeException('That date has already passed.');
                    if (slot_is_blocked($pdo, $date, $time) || slot_is_taken($pdo, $date, $time)) {
                        throw new RuntimeException('Sorry, that time is no longer available. Please pick another time.');
                    }

                    $p = $pdo->prepare('SELECT * FROM patients WHERE patient_id = ?');
                    $p->execute([$pid]);
                    $me = $p->fetch();
                    if (!$me) throw new RuntimeException('Your patient record was not found.');
                    $name = trim($me['first_name'] . ' ' . initial($me['middle_name']) . $me['last_name']);

                    $pdo->prepare("INSERT INTO appointments (id, patient_id, patient_name, patient_contact, service, dentist, appt_date, appt_time, status, created_by)
                                   VALUES (?,?,?,?,?,?,?,?, 'Pending', 'patient')")
                        ->execute([$id, $pid, $name, $me['contact'], $service, DENTIST_NAME, $date, $time]);
                    continue;
                }

                /* ----- the dentist: full control ----- */
                $patientId = clean($a['patientId'] ?? '', 20);
                $name = clean($a['patientName'] ?? '', 160);
                $contact = clean($a['patientContact'] ?? '', 30);
                $service = clean($a['service'] ?? '', 80);
                $date = clean($a['date'] ?? '', 10);
                $time = clean($a['time'] ?? '', 10);
                $status = clean($a['status'] ?? '', 12);
                $createdBy = (($a['createdBy'] ?? '') === 'dentist') ? 'dentist' : 'patient';

                if (!valid_date($date) || !in_array($time, SLOT_TIMES, true)) throw new RuntimeException('Invalid date or time.');
                if (!in_array($status, STATUSES, true)) throw new RuntimeException('Invalid status.');
                if ($service === '') throw new RuntimeException('Please choose a service.');

                $chk = $pdo->prepare('SELECT 1 FROM patients WHERE patient_id = ?');
                $chk->execute([$patientId]);
                if (!$chk->fetchColumn()) throw new RuntimeException('That patient could not be found.');

                if (is_active_status($status) && slot_is_taken($pdo, $date, $time, $id)) {
                    throw new RuntimeException('Another appointment already holds that time slot.');
                }

                if ($old) {
                    $pdo->prepare('UPDATE appointments SET patient_id=?, patient_name=?, patient_contact=?, service=?, appt_date=?, appt_time=?, status=? WHERE id=?')
                        ->execute([$patientId, $name, $contact, $service, $date, $time, $status, $id]);
                } else {
                    $pdo->prepare('INSERT INTO appointments (id, patient_id, patient_name, patient_contact, service, dentist, appt_date, appt_time, status, created_by)
                                   VALUES (?,?,?,?,?,?,?,?,?,?)')
                        ->execute([$id, $patientId, $name, $contact, $service, DENTIST_NAME, $date, $time, $status, $createdBy]);
                }
            }

            $pdo->commit();
        } catch (RuntimeException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            fail($e->getMessage(), 409);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            fail('Could not save the appointment: ' . $e->getMessage(), 500);
        }
        json_out(['ok' => true] + snapshot($u));
    }

    /* ============ add / update a patient record ============ */
    case 'upsert_patient': {
        require_post();
        $u = require_login();
        $p = body()['patient'] ?? null;
        if (!is_array($p)) fail('Nothing to save.');
        $pdo = db();
        $isDentist = $u['role'] === 'dentist';

        $pid = clean($p['patientId'] ?? '', 20);
        $first = clean($p['firstName'] ?? '', 60);
        $middle = clean($p['middleName'] ?? '', 60);
        $last = clean($p['lastName'] ?? '', 60);
        $dob = clean($p['dob'] ?? '', 10);
        $gender = clean($p['gender'] ?? '', 20);
        $contact = clean($p['contact'] ?? '', 30);
        $email = strtolower(clean($p['email'] ?? '', 120));
        $address = clean($p['address'] ?? '', 255);

        if (!$isDentist && $pid !== (string)$u['patient_id']) fail('You can only edit your own profile.', 403);
        if (!preg_match('/^P-\d{4}-\d{4,}$/', $pid)) fail('Invalid patient ID.');
        if ($first === '' || $last === '') fail('First name and last name are required.');
        if ($email !== '' && !valid_email($email)) fail('Please enter a valid email address.');

        if ($dob !== '') {
            $age = age_of($dob);
            if ($age === null || $age > 120) fail('Please enter a valid date of birth.');
            if (!$isDentist && $age < 18) fail('Account holders must be 18 or older.');
        } elseif (!$isDentist) {
            fail('Please enter a valid date of birth.');
        }

        try {
            $pdo->beginTransaction();

            $st = $pdo->prepare('SELECT 1 FROM patients WHERE patient_id = ?');
            $st->execute([$pid]);
            $exists = (bool)$st->fetchColumn();

            $dobValue = $dob === '' ? null : $dob;
            if ($exists) {
                $pdo->prepare('UPDATE patients SET first_name=?, middle_name=?, last_name=?, dob=?, gender=?, contact=?, email=?, address=? WHERE patient_id=?')
                    ->execute([$first, $middle, $last, $dobValue, $gender, $contact, $email, $address, $pid]);
            } else {
                if (!$isDentist) throw new RuntimeException('Patient not found.');
                $pdo->prepare('INSERT INTO patients (patient_id, first_name, middle_name, last_name, dob, gender, contact, email, address) VALUES (?,?,?,?,?,?,?,?,?)')
                    ->execute([$pid, $first, $middle, $last, $dobValue, $gender, $contact, $email, $address]);
            }

            /* keep the patient's login email in step with their profile email */
            if ($exists && $email !== '') {
                $dup = $pdo->prepare('SELECT 1 FROM users WHERE LOWER(email) = ? AND (patient_id IS NULL OR patient_id <> ?)');
                $dup->execute([$email, $pid]);
                if ($dup->fetchColumn()) throw new RuntimeException('That email address is already used by another account.');
                $pdo->prepare('UPDATE users SET email = ? WHERE patient_id = ?')->execute([$email, $pid]);
            }

            /* appointments keep a copy of the name / phone: refresh them */
            $mid = initial($middle);
            $full = trim($first . ' ' . $mid . $last);
            $pdo->prepare('UPDATE appointments SET patient_name = ?, patient_contact = ? WHERE patient_id = ?')->execute([$full, $contact, $pid]);

            $pdo->commit();
        } catch (RuntimeException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            fail($e->getMessage(), 409);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            fail('Could not save the patient: ' . $e->getMessage(), 500);
        }
        json_out(['ok' => true] + snapshot($u));
    }

    /* ============ dentist: block / unblock time slots ============ */
    case 'set_blocked': {
        require_post();
        $u = require_dentist();
        $in = body();
        $items = $in['items'] ?? [];
        $on = !empty($in['on']);
        if (!is_array($items)) fail('Nothing to save.');
        $pdo = db();

        try {
            $pdo->beginTransaction();
            foreach ($items as $i) {
                $date = clean($i['date'] ?? '', 10);
                $time = clean($i['time'] ?? '', 10);
                if (!valid_date($date) || !in_array($time, SLOT_TIMES, true)) continue;
                if ($on) $pdo->prepare('INSERT IGNORE INTO blocked_slots (slot_date, slot_time) VALUES (?,?)')->execute([$date, $time]);
                else $pdo->prepare('DELETE FROM blocked_slots WHERE slot_date = ? AND slot_time = ?')->execute([$date, $time]);
            }
            $pdo->commit();
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            fail('Could not update the schedule: ' . $e->getMessage(), 500);
        }
        json_out(['ok' => true] + snapshot($u));
    }

    /* ============ dentist: own profile ============ */
    case 'save_dentist_profile': {
        require_post();
        $u = require_dentist();
        $p = body()['profile'] ?? [];
        $name = clean($p['fullName'] ?? '', 120);
        $email = clean($p['email'] ?? '', 120);
        $contact = clean($p['contact'] ?? '', 40);
        if ($name === '') fail('Full name is required.');
        if ($email !== '' && !valid_email($email)) fail('Please enter a valid email address.');
        db()->prepare('UPDATE dentist_profile SET full_name = ?, email = ?, contact = ? WHERE id = 1')->execute([$name, $email, $contact]);
        json_out(['ok' => true] + snapshot($u));
    }

    /* ============ notifications ============ */
    case 'add_notification': {
        require_post();
        $u = require_login();
        $n = body();
        $to = clean($n['to'] ?? '', 20);
        $type = clean($n['type'] ?? '', 20);
        $title = clean($n['title'] ?? '', 120);
        $message = clean($n['message'] ?? '', 500);
        $apptId = clean($n['apptId'] ?? '', 20);
        $pdo = db();

        if (!in_array($type, NOTE_TYPES, true)) fail('Unknown notification type.');
        if ($title === '' || $message === '') fail('A notification needs a title and a message.');

        if ($u['role'] === 'patient') {
            if ($to !== 'dentist') fail('You can only notify the clinic.', 403);
            if (!in_array($type, ['request', 'patient-cancelled'], true)) fail('Not allowed.', 403);
            if ($apptId !== '') {
                $chk = $pdo->prepare('SELECT 1 FROM appointments WHERE id = ? AND patient_id = ?');
                $chk->execute([$apptId, $u['patient_id']]);
                if (!$chk->fetchColumn()) fail('Not allowed.', 403);
            }
        } elseif ($to !== 'dentist') {
            $chk = $pdo->prepare('SELECT 1 FROM patients WHERE patient_id = ?');
            $chk->execute([$to]);
            if (!$chk->fetchColumn()) fail('That patient could not be found.');
        }

        $pdo->prepare('INSERT INTO notifications (id, recipient, type, title, message, appt_id) VALUES (?,?,?,?,?,?)')
            ->execute(['N-' . bin2hex(random_bytes(8)), $to, $type, $title, $message, $apptId]);
        json_out(['ok' => true] + snapshot($u));
    }

    case 'mark_read': {
        require_post();
        $u = require_login();
        $id = clean(body()['id'] ?? '', 40);
        db()->prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient = ?')->execute([$id, recipient_of($u)]);
        json_out(['ok' => true] + snapshot($u));
    }

    case 'mark_all_read': {
        require_post();
        $u = require_login();
        db()->prepare('UPDATE notifications SET is_read = 1 WHERE recipient = ?')->execute([recipient_of($u)]);
        json_out(['ok' => true] + snapshot($u));
    }

    default:
        fail('Unknown action.', 404);
}
