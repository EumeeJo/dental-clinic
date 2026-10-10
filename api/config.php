<?php
/* ============================================================
   config.php - database settings
   Defaults match a fresh XAMPP / Laragon / WAMP install
   (user "root", empty password). Change them if yours differ.
   ============================================================ */
define('DB_HOST', '127.0.0.1');
define('DB_PORT', '3306');
define('DB_NAME', 'ambayec_dental');
define('DB_USER', 'root');
define('DB_PASS', '');

date_default_timezone_set('Asia/Manila');

/* api/setup.php builds the database. Set this to false once you are done. */
define('SETUP_ENABLED', true);

/* The clinic's dentist (shown on every appointment) */
define('DENTIST_NAME', 'Dr. Jenina R. Ambayec');
