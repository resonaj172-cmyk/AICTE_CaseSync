-- AICTE CaseSync Initial Seed Data
USE aicte_casesync;

-- Default Users
-- admin@aicte.gov.in / Admin@123
-- officer.pgrc@aicte.gov.in / Officer@123
-- officer.reg@aicte.gov.in / Officer@123
INSERT INTO users (full_name, email, password_hash, role, bureau, is_active) VALUES
('Dr. Ramesh Sharma (Admin)', 'admin@aicte.gov.in', '$2b$10$ScH4U0KXSd0cb48wnW6kU.C/bp9azTysdNHUY8QTkUYMTEOoMMF8K', 'Admin', 'Central Administration', TRUE),
('Smt. Priya Verma (PGRC)', 'officer.pgrc@aicte.gov.in', '$2b$10$kkrv.8Xx88xqvbByWE7OjuPf/KpuIx25sZScHLUIKfDVhMfpr1sXS', 'Officer', 'PGRC', TRUE),
('Shri Rajesh Nair (Regulation)', 'officer.reg@aicte.gov.in', '$2b$10$kkrv.8Xx88xqvbByWE7OjuPf/KpuIx25sZScHLUIKfDVhMfpr1sXS', 'Officer', 'Regulation Bureau', TRUE)
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

-- Institutions
INSERT INTO institutions (institution_id, institution_code, institution_name, state, city, address, contact_email, contact_phone) VALUES
(1, 'AICTE-INST-1001', 'ABC Engineering College', 'Maharashtra', 'Pune', 'Survey No. 42, Hinjewadi Phase 1, Pune', 'principal@abccollege.edu', '+91 20 2234 5678'),
(2, 'AICTE-INST-1002', 'Sunrise Institute of Technology', 'Karnataka', 'Bengaluru', 'Plot 88, Electronic City Phase 2, Bengaluru', 'admin@sunrise-tech.ac.in', '+91 80 4123 9876'),
(3, 'AICTE-INST-1003', 'Delhi Technical Campus', 'Delhi', 'New Delhi', 'Knowledge Park III, Institutional Area, Greater Noida / Delhi NCR', 'director@delhitechnical.org', '+91 11 2890 1234'),
(4, 'AICTE-INST-1004', 'National Institute of Engineering', 'Tamil Nadu', 'Chennai', '144 Old Mahabalipuram Road, Chennai', 'registrar@nie-chennai.edu.in', '+91 44 2450 7890'),
(5, 'AICTE-INST-1005', 'Apex Institute of Management', 'Gujarat', 'Ahmedabad', 'SG Highway, Bodakdev, Ahmedabad', 'contact@apexmgt.in', '+91 79 2685 4321'),
(6, 'AICTE-INST-1006', 'St. Xavier Engineering College', 'Kerala', 'Kochi', 'Kakkanad Infopark Road, Kochi', 'info@stxavierengg.ac.in', '+91 484 290 6543')
ON DUPLICATE KEY UPDATE institution_name = VALUES(institution_name);

-- Complaint Cases
-- ABC Engineering College cases (Example 1: PGRC + Regulation Bureau -> 2 distinct bureaus -> Trigger Cross-Bureau Alert!)
INSERT INTO cases (case_id, case_reference, institution_id, bureau, category, description, status, priority, assigned_officer, due_date) VALUES
(101, 'CASE-101', 1, 'PGRC', 'Faculty Salary Grievance', 'Multiple faculty petitions regarding delayed salary disbursement exceeding 4 months and PF non-credit.', 'Pending', 'High', 'Smt. Priya Verma (PGRC)', DATE_ADD(CURRENT_DATE, INTERVAL 5 DAY)),
(205, 'CASE-205', 1, 'Regulation Bureau', 'Norms Compliance Violation', 'Reported unauthorized intake expansion exceeding sanctioned AICTE capacity by 30 seats in CSE department.', 'Under Process', 'High', 'Shri Rajesh Nair (Regulation)', DATE_ADD(CURRENT_DATE, INTERVAL 10 DAY)),
(310, 'CASE-310', 1, 'PGRC', 'Student Hostel Safety & Fees', 'Grievance submitted by 2nd year students alleging non-refund of cautionary deposit and inadequate hostel safety.', 'Under Process', 'Medium', 'Smt. Priya Verma (PGRC)', DATE_ADD(CURRENT_DATE, INTERVAL 14 DAY)),

-- Sunrise Institute of Technology cases (Example 2: Both cases in Regulation Bureau -> 1 distinct bureau -> NO Overlap Alert!)
(401, 'CASE-401', 2, 'Regulation Bureau', 'Faculty Cadre Ratio Shortfall', 'Annual regulatory review identified shortfall in required Professor to Assistant Professor cadre ratio.', 'Under Process', 'Medium', 'Shri Rajesh Nair (Regulation)', DATE_ADD(CURRENT_DATE, INTERVAL 12 DAY)),
(402, 'CASE-402', 2, 'Regulation Bureau', 'Laboratory Equipment Compliance', 'Inspection memo regarding incomplete calibration and safety certification in Electrical Engineering labs.', 'Pending', 'Low', 'Shri Rajesh Nair (Regulation)', DATE_ADD(CURRENT_DATE, INTERVAL 20 DAY)),

-- National Institute of Engineering cases (Spans 3 bureaus: PGRC, Approval Bureau, Finance Cell -> Overlap Alert!)
(501, 'CASE-501', 4, 'PGRC', 'Capitation Fee Complaint', 'Parent allegation regarding mandatory donation charged under developmental fee head.', 'Pending', 'High', 'Smt. Priya Verma (PGRC)', DATE_ADD(CURRENT_DATE, INTERVAL 3 DAY)),
(502, 'CASE-502', 4, 'Approval Bureau', 'Building Completion Certificate', 'Extension of Approval application pending verified occupancy certificate for new academic wing.', 'Under Process', 'Medium', 'Dr. Ramesh Sharma (Admin)', DATE_ADD(CURRENT_DATE, INTERVAL 15 DAY)),
(503, 'CASE-503', 4, 'Finance Cell', 'Grant Utilization Discrepancy', 'MODROBS laboratory modernization grant utilization certificate submitted with missing vouchers.', 'Pending', 'High', 'Dr. Ramesh Sharma (Admin)', DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY)),

-- Delhi Technical Campus case (1 case only -> NO Overlap Alert!)
(601, 'CASE-601', 3, 'Approval Bureau', 'New Course Approval Verification', 'Inspection request for starting new Artificial Intelligence and Data Science undergraduate program.', 'Resolved', 'Low', 'Dr. Ramesh Sharma (Admin)', DATE_SUB(CURRENT_DATE, INTERVAL 5 DAY)),

-- St. Xavier Engineering College cases (2 cases, both in PGRC -> NO Overlap Alert!)
(701, 'CASE-701', 6, 'PGRC', 'Internal Complaints Committee Inactive', 'Student petition alleging grievance committee and anti-ragging squad not constituted per AICTE Gazette norms.', 'Resolved', 'High', 'Smt. Priya Verma (PGRC)', DATE_SUB(CURRENT_DATE, INTERVAL 2 DAY)),
(702, 'CASE-702', 6, 'PGRC', 'Exam Schedule Clarification', 'Clarification on supplementary exam timing and credits transfer under NEP framework.', 'Resolved', 'Low', 'Smt. Priya Verma (PGRC)', DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY))
ON DUPLICATE KEY UPDATE case_reference = VALUES(case_reference);

-- Case History Entries
INSERT INTO case_history (case_id, previous_status, new_status, action_taken, changed_by, changed_at) VALUES
(101, NULL, 'Pending', 'Case registered and assigned to PGRC Bureau', 'Dr. Ramesh Sharma (Admin)', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(205, 'Pending', 'Under Process', 'Preliminary regulatory notice issued to institution management', 'Shri Rajesh Nair (Regulation)', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(310, 'Pending', 'Under Process', 'Notice issued to hostel warden and college committee for inquiry report', 'Smt. Priya Verma (PGRC)', DATE_SUB(NOW(), INTERVAL 18 HOUR)),
(401, 'Pending', 'Under Process', 'Compliance document requested from college HR department', 'Shri Rajesh Nair (Regulation)', DATE_SUB(NOW(), INTERVAL 3 DAY)),
(402, NULL, 'Pending', 'Inspection report logged for review', 'Dr. Ramesh Sharma (Admin)', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(501, NULL, 'Pending', 'Confidential complaint received; preliminary scrutiny initiated', 'Smt. Priya Verma (PGRC)', DATE_SUB(NOW(), INTERVAL 12 HOUR)),
(502, 'Pending', 'Under Process', 'Structural safety engineering validation under inspection', 'Dr. Ramesh Sharma (Admin)', DATE_SUB(NOW(), INTERVAL 4 DAY)),
(503, NULL, 'Pending', 'Audit query raised on grant expenditure statement', 'Dr. Ramesh Sharma (Admin)', DATE_SUB(NOW(), INTERVAL 6 HOUR)),
(601, 'Under Process', 'Resolved', 'Physical verification completed and approval order issued', 'Dr. Ramesh Sharma (Admin)', DATE_SUB(NOW(), INTERVAL 5 DAY)),
(701, 'Under Process', 'Resolved', 'Institution reconstituted ICC & uploaded notification on portal', 'Smt. Priya Verma (PGRC)', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(702, 'Pending', 'Resolved', 'NEP credit transfer circular communicated to exam branch', 'Smt. Priya Verma (PGRC)', DATE_SUB(NOW(), INTERVAL 1 DAY));
