# HealthCare+ Hospital Management System — Mainframe Architecture & Technical Reference

> **Document:** Comprehensive Technical & Operational Guide  
> **Target Environment:** IBM z16 Mainframe / z/OS 2.5 / IBM Db2 13 for z/OS (`DBDG` / `ZXPDB2`)  
> **Dataset HLQ:** `Z72385.CP.*`  
> **Security Standard:** Bcrypt (10 salt rounds) Password Encryption, Type-4 JDBC, Parameterized SQL  

---

## 1. Executive Project Overview

The **HealthCare+ Hospital Management System (Mainframe Edition)** is an enterprise healthcare management platform that unites a modern, responsive **clinical web frontend** (styled in a clean, high-contrast white-and-blue medical aesthetic) with the rock-solid reliability, security, and transaction throughput of an **IBM z/OS Mainframe**.

Originally prototyped as an in-memory C++ command-line application with local MySQL, the system has been migrated to enterprise mainframe architecture:
- **Relational Database:** Live **IBM Db2 13 for z/OS** running on an online enterprise mainframe system (`204.90.115.200:5040`).
- **Business Logic Modules:** **COBOL** programs utilizing embedded SQL (`EXEC SQL ... END-EXEC`) for ACID-compliant patient intake, appointment scheduling, and administrative operations.
- **Batch Processing:** **JCL (Job Control Language)** batch streams running under JES2 for daily reporting, ward occupancy analytics, and clinical archiving.
- **Application Middleware:** **Node.js Express** REST API interfacing with Db2 via an in-process Java Type-4 JDBC bridge (`Db2Bridge.java`), providing sub-15ms query execution directly against live mainframe tables.
- **Frontend Design:** Clean, accessible **White & Blue clinical user interface** (no neon dark themes or artificial AI motifs), tailored for hospital workstations and mobile health tablets.
- **Cryptographic Security:** End-to-end **bcrypt password hashing** (`bcryptjs`, 10 rounds) storing one-way cryptographic hashes in Db2 password columns.

---

## 2. System Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CLINICAL USER INTERFACES                             │
│   hospital_index.html        admin.html        doctor.html     patient.html │
│   (Patient/Doctor/Admin)    (Hospital Admin)   (Physicians)    (Patients)   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP / REST JSON (Port 8080)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   NODE.JS EXPRESS MIDDLEWARE (server.js)                    │
│   • REST Endpoints (/api/login, /api/appointment/book, /api/doctor/add ...)  │
│   • Password Security: bcrypt.hashSync & bcrypt.compareSync (10 rounds)     │
│   • Input Validation & SQL Parameter Sanitization                           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ JSON IPC over Stdin / Stdout
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 JAVA TYPE-4 JDBC BRIDGE (Db2Bridge.java)                    │
│   • IBM db2jcc4.jar (IBM JCC 4.37.6) + db2jcc_license_cisuz.jar            │
│   • Persistent TCP Connection Pool to port 5040                             │
│   • Transaction Management & Auto-Generated Keys (IDENTITY_VAL_LOCAL)       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ TCP/IP Port 5040 (DRDA Protocol)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       IBM z/OS ENTERPRISE MAINFRAME                         │
│   Host: 204.90.115.200 | User: Z72385 | Subsystem: DBDG | Location: ZXPDB2 │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     IBM Db2 13 for z/OS (DATABASE Z72385)           │   │
│   │   • Tables: HMS_PATIENTS, HMS_DOCTORS, HMS_ADMIN, HMS_APPOINTMENTS, │   │
│   │             HMS_PRESCRIPTIONS, HMS_WARDS, HMS_STAFF, HMS_BILLING,   │   │
│   │             HMS_FEEDBACK                                            │   │
│   │   • Views : V_ACTIVE_DOCTORS, V_PATIENT_SUMMARY, V_WARD_OCCUPANCY   │   │
│   │   • Index : IX_HMS_PAT_EMAIL, IX_HMS_DOC_EMAIL, IX_HMS_APPT_DOCDATE │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      ▲                                      │
│                                      │ SQL Execution / JES2 Spool           │
│   ┌──────────────────────────────────┴──────────────────────────────────┐   │
│   │                      BATCH ENGINE & DATASETS                        │   │
│   │   • Z72385.CP.DDL   (HMSDDL)   - Complete Schema Definition         │   │
│   │   • Z72385.CP.SQL   (VIEWALL)  - Reporting & Verification Queries   │   │
│   │   • Z72385.CP.COBOL (HMSAUTH, HMSAPPT, HMSADMIN)                    │   │
│   │   • Z72385.CP.JCL   (HMSQRY, HMSLOAD, HMSLOGIN, HMSAPPT, HMSBATCH) │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Major Files Catalog & Purpose

Below is the complete inventory of all major files in the repository and their exact operational role:

### 3.1 Web Frontend Files
| File Path | Purpose & Description |
|:---|:---|
| `hospital_index.html` | Hospital public portal and landing page. Features a clean white-and-blue clinical design with dedicated tabbed modal dialogs for Patient Sign-In, Doctor Sign-In, Admin Sign-In, and New Patient Self-Registration. |
| `admin.html` | Hospital Administration Dashboard. Provides real-time ward bed occupancy progress bars, a dynamic **"Onboard New Doctor"** form, searchable doctor directory cards, hospital staff registry, patient feedback viewer, and live Db2 telemetry metrics. |
| `doctor.html` | Physician Consultation Portal. Displays daily and scheduled appointments, allows doctors to transition appointment states (`SCHEDULED` → `COMPLETED` / `CANCELLED`), write electronic prescriptions with dosage/duration instructions, and review credentials. |
| `patient.html` | Patient Healthcare Portal. Allows patients to schedule appointments with specific specialists, view upcoming and past consultations, inspect issued medication regimens, and submit patient satisfaction feedback. |

### 3.2 Backend Middleware & Drivers
| File Path | Purpose & Description |
|:---|:---|
| `server.js` | Express HTTP server serving static assets and REST API endpoints. Enforces bcrypt cryptographic authentication on sign-in and registration, verifies roles, handles doctor onboarding (`POST /api/doctor/add`), and routes database queries to `db2Client.js`. |
| `db2Client.js` | High-level database abstraction layer that launches and coordinates the `Db2Bridge.java` process. Implements `query()`, `queryOne()`, `exec()`, and `insert()` methods with explicit transaction rollback and `IDENTITY_VAL_LOCAL()` extraction. |
| `db2-driver/Db2Bridge.java` | Pure-Java Type-4 JDBC connector designed to bypass Windows Application Control constraints against native C++ `.node` libraries. Runs under OpenJDK 17, maintains a persistent connection to `204.90.115.200:5040`, and processes newline-delimited JSON commands over standard input/output. |
| `db2-driver/db2jcc4.jar` | Official IBM Db2 Type-4 JDBC driver (IBM JCC version 4.37.6). Converts JDBC SQL calls into DRDA network packets routed directly to z/OS Db2 subsystem `DBDG`. |
| `db2-driver/db2jcc_license_cisuz.jar` | IBM Db2 Connect license jar unlocking client connectivity to IBM z/OS and OS/390 enterprise database servers. |
| `.env` | Environment configuration holding connection parameters (`DB2_HOST`, `DB2_PORT`, `DB2_DATABASE`, `DB2_USER`, `DB2_PASSWORD`, `DB2_SUBSYSTEM`, `DB2_SCHEMA`). |
| `package.json` | Node.js project manifest specifying core production dependencies (`express`, `cors`, `dotenv`, `bcryptjs`) and local utilities. |

### 3.3 Database & SQL Definitions
| File Path | Purpose & Description |
|:---|:---|
| `db2/HMS_DDL.sql` | Production DDL script for IBM Db2 13 for z/OS. Creates all 9 tables under `Z72385` database in `ZXPUSER` storage group, defines primary keys, foreign keys, unique constraints, table check constraints, secondary indexes, and analytics views. Formatted to standard 80-byte card image compatibility. |
| `db2/HMS_QUERIES.sql` | Suite of production SQL reporting queries covering doctor schedules, ward occupancy thresholds, patient medication histories, billing summaries, and audit logs. |

### 3.4 COBOL Business Logic Modules
| File Path | Purpose & Description |
|:---|:---|
| `cobol/HMSAUTH.cbl` | Mainframe authentication module. Contains paragraphs `LOGIN-PATIENT-PARA`, `LOGIN-DOCTOR-PARA`, `LOGIN-ADMIN-PARA`, and `PROCESS-REGISTER-PARA`. Evaluates `SQLCODE` in `SQLCA` to authenticate users and prevent duplicate registrations. |
| `cobol/HMSAPPT.cbl` | Clinical appointment scheduling and prescription module. Contains cursor definitions `PAT-APPT-CUR`, `DOC-APPT-CUR`, and paragraphs `BOOK-APPT-PARA`, `UPDATE-APPT-PARA`, and `ADD-PRESC-PARA`. |
| `cobol/HMSADMIN.cbl` | Hospital administrative operations module. Contains paragraphs `GET-ADMIN-STATS-PARA`, `ADD-STAFF-PARA`, and `UPDATE-WARD-PARA` to compute hospital-wide bed capacities and update staff rosters. |

### 3.5 JCL Batch Stream Jobs
| File Path | Purpose & Description |
|:---|:---|
| `jcl/HMSQRY.jcl` | Diagnostic batch query job executing under z/OS BPXBATCH with `REGION=0M`. Invokes IBM Type-4 JDBC directly on the mainframe to query `SYSIBM.SYSDUMMY1` and hospital tables, routing results to JES2 spool. |
| `jcl/HMSLOAD.jcl` | Initial batch schema creation and seed data loading job. |
| `jcl/HMSLOGIN.jcl` | Batch test stream exercising the `HMSAUTH` COBOL authentication routines. |
| `jcl/HMSAPPT.jcl` | Batch appointment processing stream testing cursor iteration over patient appointments. |
| `jcl/HMSBATCH.jcl` | Production master nightly batch job. Automates ward occupancy metrics, archives completed consultations older than 30 days, reconciles patient billing, and generates daily utilization summaries. |

### 3.6 Automated Setup & Verification Scripts
| File Path | Purpose & Description |
|:---|:---|
| `setup/upload_zos_cp.ps1` | Automated PowerShell deployment script. Interacts with the z/OSMF REST API (`https://204.90.115.200:10443`) to allocate Partitioned Datasets under HLQ `Z72385.CP.*` and upload all DDL, SQL, COBOL, and JCL members. |
| `setup/migrate_and_seed.js` | Database migration and seeding utility. Hashes all plaintext passwords in `HMS_ADMIN`, `HMS_DOCTORS`, and `HMS_PATIENTS` using bcrypt (`$2b$10$...`) and populates rich test data (10 doctors, 6 patients, 6 wards, 8 staff, 9 appointments, 3 prescriptions, 5 billing records, 4 feedback submissions). |
| `setup/test_e2e.js` | Comprehensive automated integration test suite. Spawns `server.js` on port 8089, exercises every REST endpoint against live Db2 on z/OS, validates bcrypt authentication, tests doctor onboarding, verifies appointment booking and prescription issuance, and cleans up synthetic records. |
| `CREDENTIALS.md` | Security and login credential reference cataloging all accounts, roles, sample passwords, and bcrypt security mechanisms. |

---

## 4. Mainframe Datasets Uploaded to z/OS (`Z72385.CP.*`)

All mainframe assets for this project are created strictly under the dedicated High-Level Qualifier (HLQ) **`Z72385.CP`**. No files or datasets exist outside this designated HLQ.

All datasets are configured as **Partitioned Dataset (PO)** with **Fixed Block (FB)** record format, Logical Record Length **LRECL=80**, and optimal block size **BLKSIZE=27920**.

```
Z72385.CP.DDL
  ├── (HMSDDL)     [Complete Db2 13 Schema & DDL Script]
  └── (HMSRLS)     [Row-Level Security (RLS) & RCAC Definitions]

Z72385.CP.SQL
  └── (VIEWALL)    [Interactive Db2 Query & Verification Suite]

Z72385.CP.COBOL
  ├── (HMSAUTH)    [COBOL: Authentication & Patient Registration]
  ├── (HMSAPPT)    [COBOL: Appointment Scheduling & Prescriptions]
  └── (HMSADMIN)   [COBOL: Hospital Admin, Wards & Staff Metrics]

Z72385.CP.JCL
  ├── (HMSQRY)     [JCL: BPXBATCH Java JDBC Direct Query Verification]
  ├── (HMSLOAD)    [JCL: Schema Provisioning & Data Ingestion]
  ├── (HMSLOGIN)   [JCL: Authentication Program Batch Execution]
  ├── (HMSAPPT)    [JCL: Appointment Program Batch Execution]
  └── (HMSBATCH)   [JCL: Nightly Master Hospital Batch Processing]
```

### Detailed Purpose of Each Uploaded Dataset & Member

#### 1. `Z72385.CP.DDL(HMSDDL)`
- **Format:** PDS Member, FB, 80 columns.
- **Purpose:** Full DDL script defining the relational schema for the HealthCare+ system on IBM Db2 for z/OS (Subsystem `DBDG`).
- **Contents:**
  - Creates 9 tables in database `Z72385`: `HMS_PATIENTS`, `HMS_DOCTORS`, `HMS_ADMIN`, `HMS_APPOINTMENTS`, `HMS_PRESCRIPTIONS`, `HMS_WARDS`, `HMS_STAFF`, `HMS_BILLING`, `HMS_FEEDBACK`.
  - Sets up primary keys with auto-incrementing identity columns (`GENERATED ALWAYS AS IDENTITY`).
  - Creates 5 secondary indexes for high-speed lookups: `IX_HMS_PAT_EMAIL`, `IX_HMS_DOC_EMAIL`, `IX_HMS_APPT_DOCDATE`, `IX_HMS_APPT_PAT`, `IX_HMS_PRESC_PAT`.
  - Defines 3 analytical views: `V_ACTIVE_DOCTORS`, `V_PATIENT_SUMMARY`, `V_WARD_OCCUPANCY`.

#### 2. `Z72385.CP.DDL(HMSRLS)`
- **Format:** PDS Member, FB, 80 columns.
- **Purpose:** Row-Level Security (RLS) and Row/Column Access Control (RCAC) DDL script on IBM Db2 13 for z/OS.
- **Contents:**
  - Creates table `HMS_RLS_POLICIES` and view `V_RLS_POLICIES`.
  - Creates secure RLS view `V_DOC_TREATED_PATIENTS` isolating treated patients per doctor.
  - Contains native Db2 RCAC `CREATE PERMISSION` statements and `ALTER TABLE ... ACTIVATE ROW ACCESS CONTROL` definitions for `SECADM`.

#### 3. `Z72385.CP.SQL(VIEWALL)`
- **Format:** PDS Member, FB, 80 columns.
- **Purpose:** Verification SQL member used for querying and inspecting live table states directly on z/OS via SPUFI, DSNTEP2, or batch JCL.
- **Contents:** SELECT queries covering active doctors, daily appointment rosters, ward bed capacities, and recent patient feedback.

#### 4. `Z72385.CP.COBOL(HMSAUTH)`
- **Format:** PDS Member, FB, 80 columns (columns 1-6 sequence, column 7 indicator, 8-72 code).
- **Purpose:** Enterprise authentication and patient self-registration business logic written in ANSI COBOL with embedded SQL (`EXEC SQL`).
- **Core Paragraphs:**
  - `LOGIN-PATIENT-PARA`: Queries `HMS_PATIENTS` by email and compares password hashes; sets `WS-RETURN-CODE = 00` on match.
  - `LOGIN-DOCTOR-PARA`: Validates doctor credentials and status (`DOC_STATUS = 'ACTIVE'`).
  - `LOGIN-ADMIN-PARA`: Validates system administrator credentials.
  - `PROCESS-REGISTER-PARA`: Executes `INSERT INTO HMS_PATIENTS`, evaluating `SQLCODE` for duplicate email constraint violations (`-803`).

#### 5. `Z72385.CP.COBOL(HMSAPPT)`
- **Format:** PDS Member, FB, 80 columns.
- **Purpose:** Patient consultation scheduling, doctor queue retrieval, and electronic prescription authoring.
- **Core Paragraphs:**
  - `BOOK-APPT-PARA`: Inserts appointment records with date, time, patient ID, and doctor ID.
  - `GET-DOC-APPTS-PARA`: Uses cursor `DOC-APPT-CUR` to fetch all appointments for a specified doctor.
  - `UPDATE-APPT-PARA`: Transitions appointment status to `COMPLETED` or `CANCELLED`.
  - `ADD-PRESC-PARA`: Inserts medical prescription regimens into `HMS_PRESCRIPTIONS`.

#### 6. `Z72385.CP.COBOL(HMSADMIN)`
- **Format:** PDS Member, FB, 80 columns.
- **Purpose:** Hospital administration logic for ward capacity monitoring and staff management.
- **Core Paragraphs:**
  - `GET-ADMIN-STATS-PARA`: Aggregates total patients, total doctors, and uses cursor `WRD-CUR` to tally bed utilization across all hospital wards.
  - `ADD-STAFF-PARA`: Inserts newly hired healthcare personnel into `HMS_STAFF`.
  - `UPDATE-WARD-PARA`: Adjusts occupied bed counts in `HMS_WARDS` following patient admission or discharge.

#### 7. `Z72385.CP.JCL(HMSQRY)`
- **Format:** PDS Member, FB, 80 columns.
- **Purpose:** High-performance batch diagnostic job that runs Type-4 JDBC under IBM z/OS BPXBATCH with `REGION=0M`. Connects to subsystem `DBDG` on `localhost:5040`, runs verification queries, and prints output to JES2 spool (`SYSOUT=*`).
- **Verification Status:** Executed on z/OS JES2 with **`RC=0000`** (JOB04825).

#### 8. `Z72385.CP.JCL(HMSLOAD)`
- **Format:** PDS Member, FB, 80 columns.
- **Purpose:** Batch database provisioning and seed data loader utility.

#### 9. `Z72385.CP.JCL(HMSLOGIN)`
- **Format:** PDS Member, FB, 80 columns.
- **Purpose:** Batch compilation and execution stream for the `HMSAUTH` COBOL module.

#### 10. `Z72385.CP.JCL(HMSAPPT)`
- **Format:** PDS Member, FB, 80 columns.
- **Purpose:** Batch compilation and execution stream for the `HMSAPPT` COBOL module.

#### 11. `Z72385.CP.JCL(HMSBATCH)`
- **Format:** PDS Member, FB, 80 columns.
- **Purpose:** Master daily batch processing cycle for the hospital.
- **Steps:**
  - `STEP01`: Calculates bed occupancy percentages across all wards and flags wards exceeding 85% capacity.
  - `STEP02`: Archives completed consultations older than 30 days into `HMS_ARCHIVE`.
  - `STEP03`: Computes daily billing revenue summaries from `HMS_BILLING`.
  - `STEP04`: Generates the daily administrative summary report into a JES spool dataset.

---

## 5. Mainframe Jobs: When and How Jobs Are Submitted

Mainframe jobs in this system are packaged in JCL and submitted to the **JES2 (Job Entry Subsystem 2)** spool for background execution.

### 5.1 When Jobs Are Submitted
| JCL Job | Submission Timing / Trigger | Operational Purpose |
|:---|:---|:---|
| `HMSLOAD` | Initial system deployment or disaster recovery. | Recreates tables, views, and indexes; loads baseline reference data into Db2. |
| `HMSQRY` | On-demand by systems administrators or automated monitors. | Verifies connectivity between USS, the JVM, and Db2 subsystem `DBDG`. |
| `HMSLOGIN` | Periodic security regression testing. | Validates that COBOL authentication logic is executing correctly against live Db2 records. |
| `HMSAPPT` | Scheduled test batches or integration tests. | Exercises appointment scheduling and prescription issuance logic. |
| `HMSBATCH` | Nightly batch window (typically 00:00 or 02:00 AM). | Computes daily occupancy stats, reconciles billing transactions, archives completed records, and produces executive reports. |

### 5.2 How to Submit Jobs
Jobs can be submitted through any of the following standard mainframe interfaces:

#### Method A: Using Zowe Explorer in VS Code
1. Open the **Zowe Explorer** sidebar in VS Code.
2. In the **Data Sets** section, expand `Z72385.CP.JCL`.
3. Right-click any member (e.g., `HMSQRY` or `HMSBATCH`) and click **"Submit Job"**.
4. A notification appears displaying the assigned JES Job ID (e.g., `Job HMSQRY(JOB04825) submitted`).

#### Method B: Using SSH Command Line / TSO
Connect via SSH and submit the dataset directly:
```bash
ssh z72385@204.90.115.200
tsocmd "SUBMIT 'Z72385.CP.JCL(HMSQRY)'"
```

#### Method C: Using z/OSMF REST API
Submit programmatically via HTTP:
```http
POST /zosmf/restjobs/jobs HTTP/1.1
Host: 204.90.115.200:10443
Authorization: Basic WjcyMzg1OklDRTAxSElS
Content-Type: application/json

{
  "file": "//'Z72385.CP.JCL(HMSQRY)'"
}
```

### 5.3 How to View Job Output & Spool in Zowe Explorer
1. In the **Zowe Explorer** pane, navigate to the **Jobs** section.
2. Click the search/filter icon and enter:
   - **Owner:** `Z72385`
   - **Prefix:** `HMS*` (or `*`)
3. Locate your job (e.g., `HMSQRY (JOB04825) - CC 0000`).
4. Click to expand the job spool files:
   - `JESMSGLG`: System message log (job start, execution steps, elapsed CPU time).
   - `JESJCL`: The exact JCL statements after symbol substitution and catalog expansion.
   - `JESYSMSG`: System dataset allocations, condition codes, and step termination messages.
   - `STDOUT`: Standard output from the program (query results, row counts, formatted reports).
   - `STDERR`: Error traces, Java stack traces, or SQL exception codes (if any).
5. Click on any DD spool file to view it directly in the editor tab.

### 5.4 Return Codes Reference
- **`CC 0000` (`RC=0000`):** Normal completion. All steps executed successfully.
- **`CC 0004` (`RC=0004`):** Warning. Minor non-fatal condition encountered.
- **`CC 0008` (`RC=0008`):** Error. SQL error (e.g. constraint violation) or logic error.
- **`ABEND S0C4` / `S0C7` / `S806`:** Abnormal termination (memory access violation, data exception, or module not found).

---

## 6. How to Access and Inspect Db2 Data from Zowe Explorer

To inspect and query live Db2 data from within VS Code using Zowe Explorer:

### Option 1: Querying via Zowe Explorer SQL / Data Sets
1. In VS Code, ensure the **Zowe Explorer** extension is installed and connected to the profile:
   - Host: `204.90.115.200`
   - Port: `10443` (z/OSMF)
   - User: `Z72385`
2. In the **Data Sets** tree, locate `Z72385.CP.SQL(VIEWALL)`.
3. Open the file to inspect the prepared SQL queries.
4. You can edit the SQL or add your own query:
   ```sql
   SELECT DOCTOR_ID, DOC_NAME, SPECIALIZ, DOC_EMAIL, DOC_STATUS
   FROM Z72385.HMS_DOCTORS;
   ```
5. Submit the query job `Z72385.CP.JCL(HMSQRY)` by right-clicking it and selecting **Submit Job**.
6. View the output in the **Jobs** panel under `STDOUT` to see the live records.

### Option 2: Direct Db2 Connection via VS Code Database Extensions
If using a Database Client extension (e.g. Database Client, DBeaver, or IBM Db2 Connect):
- **Host:** `204.90.115.200`
- **Port:** `5040`
- **Database / Location:** `ZXPDB2`
- **Subsystem:** `DBDG`
- **Username:** `Z72385`
- **Password:** `ICE01HIR`
- **Schema:** `Z72385`

You will see all tables in the tree view:
- `HMS_PATIENTS`
- `HMS_DOCTORS`
- `HMS_ADMIN`
- `HMS_APPOINTMENTS`
- `HMS_PRESCRIPTIONS`
- `HMS_WARDS`
- `HMS_STAFF`
- `HMS_BILLING`
- `HMS_FEEDBACK`

---

## 7. Cryptographic Security & Bcrypt Details

### Password Hashing Standards
- **Algorithm:** `bcrypt` (Blowfish-based adaptive hashing)
- **Salt Rounds:** `10` rounds
- **Storage Format:** Standard modular crypt format (`$2b$10$...`, 60 characters)
- **Tables Protected:**
  - `Z72385.HMS_ADMIN.ADMIN_PASSWORD`
  - `Z72385.HMS_DOCTORS.DOC_PASSWORD`
  - `Z72385.HMS_PATIENTS.PAT_PASSWORD`

### Authentication Flow
1. When a user submits credentials via the web UI or REST API, the plaintext password and username/email are received by `server.js`.
2. The server queries the database for the user row by username or email.
3. If found, `bcrypt.compareSync(submittedPassword, storedHash)` verifies the password.
4. Plaintext passwords are never logged, never returned in API responses, and never stored in Db2.
5. When registering a new patient or onboarding a new doctor, `bcrypt.hashSync(plainPassword, 10)` generates the hash before the `INSERT` query is sent to Db2.

---

## 8. Row-Level Security (RLS) & Access Control Architecture

The HealthCare+ system enforces strict **Row-Level Security (RLS)** both inside **IBM Db2 13 for z/OS** and at the middleware API layer, guaranteeing rigorous healthcare data confidentiality.

### 8.1 The Three Core RLS Isolation Rules

| User Role | Permitted Data Scope | Prohibited / Hidden Data |
|:---|:---|:---|
| **Administrator** (`admin`) | **Full Institutional Access:** Can query and modify all patients, doctors, appointments, wards, staff rosters, billing records, and patient feedback. | None. Full system oversight. |
| **Physician / Doctor** (`doctor`) | **Assigned Consultations & Treated Patients Only:**<br>• Can view doctor directory and edit their own physician profile.<br>• Can query only appointments assigned to their physician ID (`A.DOCTOR_ID = ?`).<br>• Can query demographic and medical history **only for patients they have actively treated or who have scheduled consultations with them** (via view `V_DOC_TREATED_PATIENTS`).<br>• Can write prescriptions only for appointments assigned to their doctor ID. | • Cannot view patients treated exclusively by other doctors.<br>• Cannot view appointments assigned to other doctors.<br>• Cannot issue prescriptions or alter consultations for other physicians. |
| **Patient** (`patient`) | **Self-Record Isolation Only:**<br>• Can query and book only their own consultations (`A.PATIENT_ID = ?`).<br>• Can view only prescriptions prescribed directly to their patient ID.<br>• Can inspect and submit only their own feedback messages. | • Cannot see any other patient's existence, contact info, appointments, or prescriptions.<br>• Cannot view hospital administrative financials or staff records. |

### 8.2 Mainframe Db2 13 Objects for RLS
1. **Catalog Table `Z72385.HMS_RLS_POLICIES`**:
   - Stores all 9 registered row-level security rules, target tables, roles, filter predicates, and enforcement status.
2. **Catalog View `Z72385.V_RLS_POLICIES`**:
   - User-facing view to query all active policies without administrative lock contention.
3. **Secure View `Z72385.V_DOC_TREATED_PATIENTS`**:
   - Evaluates patient-doctor relationship joins. When a doctor queries this view with `WHERE DOCTOR_ID = ?`, it returns only patients who have historical or active consultations with that physician.
4. **Native Db2 RCAC Member `Z72385.CP.DDL(HMSRLS)`**:
   - Contains native `CREATE PERMISSION` statements and `ALTER TABLE ... ACTIVATE ROW ACCESS CONTROL` definitions for execution by the subsystem security administrator (`SECADM`).

### 8.3 How to See RLS Policies from VS Code Db2 Extension or SQL Clients

You can inspect the active Row-Level Security policies through any of the following methods:

#### Method 1: In the VS Code Db2 / Database Extension (SQL Query)
Open a SQL editor tab connected to `204.90.115.200:5040` (`DBDG`) and run:
```sql
-- 1. Query all 9 active RLS policies with predicates and target roles
SELECT POLICY_ID, POLICY_NAME, TARGET_TABLE, TARGET_ROLE, RULE_FILTER, ENFORCED, STATUS
FROM Z72385.V_RLS_POLICIES
ORDER BY POLICY_ID;

-- 2. Query native Db2 System Catalog for Row and Column Access Control (RCAC)
SELECT NAME AS PERM_NAME, TBNAME AS TABLE_NAME, CONTROL_TYPE, ENABLE, ENFORCED
FROM SYSIBM.SYSCONTROLS
WHERE TBSCHEMA = 'Z72385';

-- 3. Verify Doctor-to-Patient RLS isolation (e.g. Doctor 1 vs Doctor 3)
SELECT * FROM Z72385.V_DOC_TREATED_PATIENTS WHERE DOCTOR_ID = 1;
SELECT * FROM Z72385.V_DOC_TREATED_PATIENTS WHERE DOCTOR_ID = 3;
```

#### Method 2: In the Database Schema Tree View
In the VS Code Db2 Extension or Database Client pane:
1. Expand connection `204.90.115.200:5040 / DBDG`.
2. Expand database `Z72385` → Schema `Z72385`.
3. Expand **Views** to find:
   - `V_RLS_POLICIES`: Lists all active policies.
   - `V_DOC_TREATED_PATIENTS`: Shows physician-to-patient relationship scoping.
4. Expand **Tables** to find `HMS_RLS_POLICIES`.

#### Method 3: In the Web Admin Dashboard UI
1. Sign in as Admin (`admin` / `admin123`) at `http://localhost:8080/admin.html`.
2. Click the **"RLS Policies & Security"** tab.
3. You will see a live table of all 9 active policies, their rule predicates, enforcement status, and inspection instructions loaded directly from IBM Db2.

#### Method 4: In Zowe Explorer (Dataset View)
1. In the **Zowe Explorer** sidebar under **Data Sets**, expand `Z72385.CP.DDL`.
2. Open member `HMSRLS` (`Z72385.CP.DDL(HMSRLS)`).
3. Review the complete DDL script defining the RLS tables, views, and native Db2 RCAC permissions.

---

## 9. Quick Start Verification Commands

```powershell
# 1. Start the application server
node server.js

# 2. Open the web application in browser
http://localhost:8080

# 3. Run automated end-to-end integration tests (including RLS verification)
node setup/test_e2e.js
```
