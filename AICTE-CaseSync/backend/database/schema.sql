-- AICTE CaseSync Database Schema
-- Problem Statement 26264: Integrated Dashboard for Monitoring and Tracking Institution-Related Complaint Cases Across AICTE Bureaus/Cells

CREATE DATABASE IF NOT EXISTS aicte_casesync CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE aicte_casesync;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('Admin', 'Officer') NOT NULL DEFAULT 'Officer',
  bureau VARCHAR(100) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Institutions Table
CREATE TABLE IF NOT EXISTS institutions (
  institution_id INT AUTO_INCREMENT PRIMARY KEY,
  institution_code VARCHAR(50) NOT NULL UNIQUE,
  institution_name VARCHAR(255) NOT NULL,
  state VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  address TEXT,
  contact_email VARCHAR(150),
  contact_phone VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. Cases Table
CREATE TABLE IF NOT EXISTS cases (
  case_id INT AUTO_INCREMENT PRIMARY KEY,
  case_reference VARCHAR(50) NOT NULL UNIQUE,
  institution_id INT NOT NULL,
  bureau VARCHAR(100) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  status ENUM('Pending', 'Under Process', 'Resolved', 'Rejected') NOT NULL DEFAULT 'Pending',
  priority ENUM('Low', 'Medium', 'High') NOT NULL DEFAULT 'Medium',
  assigned_officer VARCHAR(150) NULL,
  due_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cases_institution FOREIGN KEY (institution_id) REFERENCES institutions(institution_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 4. Case History / Audit Trail
CREATE TABLE IF NOT EXISTS case_history (
  history_id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  previous_status VARCHAR(50) NULL,
  new_status VARCHAR(50) NULL,
  action_taken VARCHAR(255) NOT NULL,
  changed_by VARCHAR(150) NOT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_history_case FOREIGN KEY (case_id) REFERENCES cases(case_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5. Overlap Alert Reviews
CREATE TABLE IF NOT EXISTS overlap_reviews (
  review_id INT AUTO_INCREMENT PRIMARY KEY,
  institution_id INT NOT NULL UNIQUE,
  review_status ENUM('Pending Review', 'Reviewed') NOT NULL DEFAULT 'Pending Review',
  notes TEXT NULL,
  reviewed_by VARCHAR(150) NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_overlap_institution FOREIGN KEY (institution_id) REFERENCES institutions(institution_id) ON DELETE CASCADE
) ENGINE=InnoDB;
