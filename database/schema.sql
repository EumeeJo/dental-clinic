-- Ambayec Dental Care Clinic - database schema
-- Import this in phpMyAdmin, OR just open  http://localhost/dental-clinic/api/setup.php  (it runs this file for you).

CREATE DATABASE IF NOT EXISTS ambayec_dental CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ambayec_dental;

CREATE TABLE IF NOT EXISTS patients (
  patient_id   VARCHAR(20)  NOT NULL PRIMARY KEY,
  first_name   VARCHAR(60)  NOT NULL,
  middle_name  VARCHAR(60)  NOT NULL DEFAULT '',
  last_name    VARCHAR(60)  NOT NULL,
  dob          DATE         NULL,
  gender       VARCHAR(20)  NOT NULL DEFAULT '',
  contact      VARCHAR(30)  NOT NULL DEFAULT '',
  email        VARCHAR(120) NOT NULL DEFAULT '',
  address      VARCHAR(255) NOT NULL DEFAULT '',
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username       VARCHAR(60)  NULL UNIQUE,
  email          VARCHAR(120) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  role           ENUM('patient','dentist') NOT NULL DEFAULT 'patient',
  patient_id     VARCHAR(20)  NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_patient FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dentist_profile (
  id         TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  full_name  VARCHAR(120) NOT NULL,
  email      VARCHAR(120) NOT NULL DEFAULT '',
  contact    VARCHAR(40)  NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS appointments (
  id               VARCHAR(20)  NOT NULL PRIMARY KEY,
  patient_id       VARCHAR(20)  NOT NULL,
  patient_name     VARCHAR(160) NOT NULL DEFAULT '',
  patient_contact  VARCHAR(30)  NOT NULL DEFAULT '',
  service          VARCHAR(80)  NOT NULL,
  dentist          VARCHAR(120) NOT NULL,
  appt_date        DATE         NOT NULL,
  appt_time        VARCHAR(10)  NOT NULL,
  status           ENUM('Pending','Confirmed','Completed','Cancelled') NOT NULL DEFAULT 'Pending',
  created_by       ENUM('patient','dentist') NOT NULL DEFAULT 'patient',
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_slot (appt_date, appt_time, status),
  KEY idx_patient (patient_id),
  CONSTRAINT fk_appt_patient FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS blocked_slots (
  slot_date  DATE        NOT NULL,
  slot_time  VARCHAR(10) NOT NULL,
  PRIMARY KEY (slot_date, slot_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id          VARCHAR(40)  NOT NULL PRIMARY KEY,
  recipient   VARCHAR(20)  NOT NULL,
  type        VARCHAR(20)  NOT NULL,
  title       VARCHAR(120) NOT NULL,
  message     VARCHAR(500) NOT NULL,
  appt_id     VARCHAR(20)  NOT NULL DEFAULT '',
  is_read     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_recipient (recipient, is_read, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS counters (
  name   VARCHAR(20)  NOT NULL PRIMARY KEY,
  value  INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO counters (name, value) VALUES ('appt', 0), ('patient', 0);
