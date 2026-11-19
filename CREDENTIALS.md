# HealthCare+ Hospital Management System — Mainframe Edition
# Login Credentials Reference & User Catalog

> **Security Note:** All passwords in IBM Db2 for z/OS (`Z72385.HMS_*`) are cryptographically hashed using **bcrypt** (salt rounds: 10). Plaintext passwords are never stored in the database. When users log in or register, bcrypt authentication is enforced via `bcrypt.compareSync` and `bcrypt.hashSync`.

---

## 🔐 Administrator Account

| Username | Password | Role  | Notes |
|----------|----------|-------|-------|
| `admin`  | `admin123` | Admin | Full hospital oversight: onboard doctors, monitor wards, staff, and patient feedback |

**Access:** Full hospital control — doctor onboarding, staff registry, live ward capacity management, patient feedback review, and IBM Db2 live metrics.

---

## 👨‍⚕️ Doctor Accounts (Seeded in IBM Db2 for z/OS)

All seeded doctors use password: **`doc123`** (bcrypt hashed in `HMS_DOCTORS`).

| ID | Name | Email | Specialization | Department | Contact |
|:---|:-----|:------|:---------------|:-----------|:--------|
| 1 | Dr. Sarah Johnson | `sarah@hospital.com` | Cardiology | Cardiology Dept | 555-0101 |
| 2 | Dr. Michael Chen | `michael@hospital.com` | Orthopedics | Orthopedics Dept | 555-0102 |
| 3 | Dr. Emily Rodriguez | `emily@hospital.com` | Neurology | Neurology Dept | 555-0103 |
| 4 | Dr. James Wilson | `james@hospital.com` | Pediatrics | Pediatrics Dept | 555-0104 |
| 5 | Dr. Priya Sharma | `priya.sharma@hospital.com` | Oncology | Oncology Institute | 555-0105 |
| 6 | Dr. David Miller | `david.miller@hospital.com` | Pulmonology | Respiratory Medicine | 555-0106 |
| 7 | Dr. Lisa Wang | `lisa.wang@hospital.com` | Dermatology | Dermatology Clinic | 555-0107 |
| 8 | Dr. Robert Taylor | `robert.taylor@hospital.com` | Gastroenterology | Digestive Health | 555-0108 |
| 9 | Dr. Anita Patel | `anita.patel@hospital.com` | Endocrinology | Metabolic Center | 555-0109 |
| 10 | Dr. Marcus Vance | `marcus.vance@hospital.com` | Nephrology | Renal Care Unit | 555-0110 |

**Access:** Doctor dashboard, patient appointments review, status progression (`COMPLETED` / `CANCELLED`), medical prescription writing, physician profile.

---

## 👤 Patient Accounts (Seeded in IBM Db2 for z/OS)

All seeded patients use password: **`patient123`** (bcrypt hashed in `HMS_PATIENTS`).

| ID | Name | Email | Age | Gender | Contact |
|:---|:-----|:------|:---:|:-------|:--------|
| 1 | John Doe | `john@email.com` | 35 | Male | 555-1001 |
| 2 | Alice Walker | `alice.walker@email.com` | 28 | Female | 555-1002 |
| 3 | Carlos Mendez | `carlos.mendez@email.com` | 52 | Male | 555-1003 |
| 4 | Emma Watson | `emma.watson@email.com` | 41 | Female | 555-1004 |
| 5 | Tariq Mansoor | `tariq.mansoor@email.com` | 63 | Male | 555-1005 |
| 6 | Grace Hopper | `grace.hopper@email.com` | 33 | Female | 555-1006 |

**Access:** Patient portal, online appointment scheduling, digital prescriptions & health history, hospital care feedback.

> **Self-Registration:** New patients can also self-register directly via the landing page modal ("Register"). Their passwords will automatically be hashed with bcrypt before being committed to Db2.

---

## 👥 Hospital Staff (Managed via Admin Panel)

| ID | Name | Role | Contact | Department |
|:---|:-----|:-----|:--------|:-----------|
| 1 | Alice Brown | Senior Nurse | 555-2001 | Cardiology |
| 2 | Bob Smith | Trauma Nurse | 555-2002 | Emergency |
| 3 | Carol Davis | Lead Receptionist | 555-2003 | Reception & Admissions |
| 4 | David Green | ICU Specialist Nurse | 555-2004 | Intensive Care Unit |
| 5 | Elena Rostova | Clinical Pharmacist | 555-2005 | Central Pharmacy |
| 6 | Frank Wright | Lab Technician | 555-2006 | Pathology & Labs |
| 7 | Grace Kim | Radiologic Technologist | 555-2007 | Diagnostic Imaging |
| 8 | Henry Adams | Patient Transport Lead | 555-2008 | Facilities & Logistics |

---

## 🏥 Hospital Wards (Db2 Table: `HMS_WARDS`)

| Ward ID | Ward Type | Total Beds | Current Occupied | Occupancy Rate |
|:-------:|:----------|:----------:|:----------------:|:--------------:|
| 1 | ICU | 20 | 8 | 40% |
| 2 | GENERAL | 50 | 28 | 56% |
| 3 | EMERGENCY | 30 | 18 | 60% |
| 4 | PEDIATRICS | 25 | 12 | 48% |
| 5 | ONCOLOGY | 20 | 14 | 70% |
| 6 | MATERNITY | 30 | 16 | 53% |

---

## 🔄 How to Add Users

### 1. Onboard a New Doctor (Admin UI or API)
1. Sign in to the Admin Portal (`admin` / `admin123`).
2. Go to the **Doctors** tab.
3. Fill in the **"Onboard New Doctor"** form:
   - Full Name, Medical Specialization, Department, Email, Contact Phone, Initial Password.
4. Click **Onboard Doctor**.
   - The password is automatically hashed with bcrypt (`10` rounds) and inserted into `Z72385.HMS_DOCTORS`.
   - Alternatively, call `POST /api/doctor/add` with JSON payload `{ name, specialization, department, contact, email, password }`.

### 2. Register a New Patient
1. On the landing page (`hospital_index.html`), click **"Register"**.
2. Enter Name, Email, Password, Age, Gender, and Contact.
3. Password is automatically bcrypt-hashed and inserted into `Z72385.HMS_PATIENTS`.

### 3. Add Hospital Staff
1. Sign in to the Admin Portal.
2. Go to the **Staff** tab.
3. Fill out the "Add New Staff Member" form and submit.

---

## 🚀 Starting the Application

```powershell
# Start the Express server connected directly to online z/OS Db2
node server.js

# Access the Web Application
http://localhost:8080
```
