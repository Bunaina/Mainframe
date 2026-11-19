/**
 * ================================================================
 * HMS - Hospital Management System
 * Mainframe Middleware Bridge Server (Live Online IBM Db2 z/OS)
 * ================================================================
 * Technology Stack:
 *   - Node.js + Express (Local REST API Gateway / Web Server)
 *   - IBM Db2 13 for z/OS (Online: 204.90.115.200:5040 / ZXPDB2 / DBDG)
 *   - Pure-Java IBM Type-4 JDBC Bridge (db2jcc4.jar + db2jcc_license_cisuz.jar)
 *   - COBOL business logic programs in Z72385.CP.COBOL (HMSAUTH, HMSAPPT, HMSADMIN)
 *   - JCL batch & query jobs in Z72385.CP.JCL (HMSQRY, HMSBATCH, HMSLOAD, HMSLOGIN)
 * ================================================================
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const Db2Client = require('./db2Client');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const SCHEMA = (process.env.DB2_SCHEMA || process.env.DB2_USER || 'Z72385').toUpperCase();
const T = {
    PATIENTS: `${SCHEMA}.HMS_PATIENTS`,
    DOCTORS: `${SCHEMA}.HMS_DOCTORS`,
    ADMIN: `${SCHEMA}.HMS_ADMIN`,
    APPOINTMENTS: `${SCHEMA}.HMS_APPOINTMENTS`,
    PRESCRIPTIONS: `${SCHEMA}.HMS_PRESCRIPTIONS`,
    WARDS: `${SCHEMA}.HMS_WARDS`,
    STAFF: `${SCHEMA}.HMS_STAFF`,
    BILLING: `${SCHEMA}.HMS_BILLING`,
    FEEDBACK: `${SCHEMA}.HMS_FEEDBACK`,
};

const db = new Db2Client();

function normalizeTime(timeStr) {
    if (!timeStr) return '09:00:00';
    const trimmed = String(timeStr).trim();
    if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
    return trimmed;
}

// ================================================================
// HEALTH CHECK (Verifies Live IBM Db2 for z/OS Connection)
// ================================================================
app.get('/api/health', async (req, res) => {
    try {
        const row = await db.queryOne(
            `SELECT CURRENT SERVER AS server, CURRENT SQLID AS user,
                    CHAR(CURRENT TIMESTAMP) AS zos_timestamp
             FROM SYSIBM.SYSDUMMY1`
        );
        res.json({
            connected: true,
            host: db.config.host,
            port: db.config.port,
            subsystem: db.config.subsystem,
            database: db.config.database,
            schema: SCHEMA,
            product: db.readyInfo ? db.readyInfo.product : 'IBM Db2 for z/OS',
            ...row,
        });
    } catch (err) {
        res.status(500).json({ connected: false, error: err.message });
    }
});

// ================================================================
// COBOL HMSAUTH - LOGIN / REGISTER
// ================================================================

// POST /api/login
app.post('/api/login', async (req, res) => {
    const { email, password, role } = req.body;
    try {
        let row;
        if (role === 'patient') {
            row = await db.queryOne(
                `SELECT PATIENT_ID AS id, PAT_NAME AS name, PAT_EMAIL AS email
                 FROM ${T.PATIENTS}
                 WHERE PAT_EMAIL = ? AND PAT_PASSWORD = ?`,
                [email, password]
            );
            if (row) return res.json({ success: true, role: 'patient', user: row });
        } else if (role === 'doctor') {
            row = await db.queryOne(
                `SELECT DOCTOR_ID AS id, DOC_NAME AS name, DOC_EMAIL AS email,
                        SPECIALIZ AS specialization, DEPARTMENT AS department
                 FROM ${T.DOCTORS}
                 WHERE DOC_EMAIL = ? AND DOC_PASSWORD = ? AND DOC_STATUS = 'ACTIVE'`,
                [email, password]
            );
            if (row) return res.json({ success: true, role: 'doctor', user: row });
        } else if (role === 'admin') {
            row = await db.queryOne(
                `SELECT ADMIN_ID AS id, ADM_USERNAME AS username
                 FROM ${T.ADMIN}
                 WHERE ADM_USERNAME = ? AND ADM_PASSWORD = ?`,
                [email, password]
            );
            if (row) return res.json({ success: true, role: 'admin', user: row });
        } else {
            return res.json({ success: false, error: 'Invalid role' });
        }
        res.json({ success: false, error: 'Invalid credentials' });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// POST /api/register  -> COBOL HMSAUTH PROCESS-REGISTER-PARA
app.post('/api/register', async (req, res) => {
    const { name, age, gender, contact, email, password } = req.body;
    try {
        const result = await db.insert(
            `INSERT INTO ${T.PATIENTS}
                (PAT_NAME, PAT_AGE, PAT_GENDER, PAT_CONTACT, PAT_EMAIL, PAT_PASSWORD)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [name, parseInt(age, 10), gender, contact, email, password]
        );
        res.json({ success: true, patient_id: result.insertId });
    } catch (err) {
        if (err.sqlcode === -803 || (err.message && err.message.includes('-803'))) {
            res.json({ success: false, error: 'Email already registered' });
        } else {
            res.json({ success: false, error: err.message });
        }
    }
});

// ================================================================
// COBOL HMSAPPT - APPOINTMENT / PRESCRIPTION MODULE
// ================================================================

// GET /api/doctors  -> COBOL HMSADMIN GET-DOCTORS-PARA
app.get('/api/doctors', async (req, res) => {
    try {
        const rows = await db.query(
            `SELECT DOCTOR_ID AS id, DOC_NAME AS name,
                    SPECIALIZ AS specialization, DEPARTMENT AS department,
                    DOC_CONTACT AS contact
             FROM ${T.DOCTORS}
             WHERE DOC_STATUS = 'ACTIVE'
             ORDER BY SPECIALIZ, DOC_NAME`
        );
        res.json(rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// GET /api/patient/dashboard  -> COBOL HMSAPPT GET-PAT-DASH-PARA
app.get('/api/patient/dashboard', async (req, res) => {
    const patientId = parseInt(req.query.patient_id, 10);
    try {
        const apptCount = await db.queryOne(
            `SELECT COUNT(*) AS cnt FROM ${T.APPOINTMENTS} WHERE PATIENT_ID = ?`,
            [patientId]
        );
        const presCount = await db.queryOne(
            `SELECT COUNT(*) AS cnt FROM ${T.PRESCRIPTIONS} WHERE PATIENT_ID = ?`,
            [patientId]
        );
        res.json({
            total_appointments: apptCount ? apptCount.cnt : 0,
            total_prescriptions: presCount ? presCount.cnt : 0,
            pending_bills: '0',
        });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// GET /api/patient/appointments  -> COBOL HMSAPPT GET-PAT-APPTS-PARA
app.get('/api/patient/appointments', async (req, res) => {
    const patientId = parseInt(req.query.patient_id, 10);
    try {
        const rows = await db.query(
            `SELECT A.APPT_ID AS id,
                    CHAR(A.APPT_DATE, ISO) AS date,
                    CHAR(A.APPT_TIME, JIS) AS time,
                    A.APPT_STATUS AS status,
                    A.APPT_NOTES AS notes,
                    A.PATIENT_ID AS patient_id,
                    D.DOC_NAME AS doctor_name,
                    D.SPECIALIZ AS specialization
             FROM ${T.APPOINTMENTS} A
             JOIN ${T.DOCTORS} D ON A.DOCTOR_ID = D.DOCTOR_ID
             WHERE A.PATIENT_ID = ?
             ORDER BY A.APPT_DATE DESC, A.APPT_TIME DESC`,
            [patientId]
        );
        res.json(rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// GET /api/patient/prescriptions  -> COBOL HMSAPPT GET-PRESC-PARA
app.get('/api/patient/prescriptions', async (req, res) => {
    const patientId = parseInt(req.query.patient_id, 10);
    try {
        const rows = await db.query(
            `SELECT PR.PRESC_ID AS id,
                    PR.MEDICINE AS medicine,
                    PR.DOSAGE AS dosage,
                    PR.DURATION AS duration,
                    PR.DIAGNOSIS AS diagnosis,
                    PR.PRESC_NOTES AS notes,
                    CHAR(PR.CREATED_AT) AS created_at,
                    D.DOC_NAME AS doctor_name,
                    CHAR(A.APPT_DATE, ISO) AS date,
                    CHAR(A.APPT_TIME, JIS) AS time
             FROM ${T.PRESCRIPTIONS} PR
             JOIN ${T.DOCTORS} D ON PR.DOCTOR_ID = D.DOCTOR_ID
             JOIN ${T.APPOINTMENTS} A ON PR.APPT_ID = A.APPT_ID
             WHERE PR.PATIENT_ID = ?
             ORDER BY PR.CREATED_AT DESC`,
            [patientId]
        );
        res.json(rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// POST /api/appointment/book  -> COBOL HMSAPPT BOOK-APPT-PARA
app.post('/api/appointment/book', async (req, res) => {
    const { patient_id, doctor_id, date, time } = req.body;
    try {
        const result = await db.insert(
            `INSERT INTO ${T.APPOINTMENTS}
                (PATIENT_ID, DOCTOR_ID, APPT_DATE, APPT_TIME, APPT_STATUS)
             VALUES (?, ?, ?, ?, 'SCHEDULED')`,
            [parseInt(patient_id, 10), parseInt(doctor_id, 10), date, normalizeTime(time)]
        );
        res.json({ success: true, appointment_id: result.insertId });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// POST /api/appointment/update  -> COBOL HMSAPPT UPDATE-APPT-PARA
app.post('/api/appointment/update', async (req, res) => {
    const { appointment_id, status, notes } = req.body;
    try {
        await db.exec(
            `UPDATE ${T.APPOINTMENTS}
             SET APPT_STATUS = ?, APPT_NOTES = ?
             WHERE APPT_ID = ?`,
            [String(status).toUpperCase(), notes || '', parseInt(appointment_id, 10)]
        );
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// GET /api/doctor/appointments  -> COBOL HMSAPPT GET-DOC-APPTS-PARA
app.get('/api/doctor/appointments', async (req, res) => {
    const doctorId = parseInt(req.query.doctor_id, 10);
    try {
        const rows = await db.query(
            `SELECT A.APPT_ID AS id,
                    CHAR(A.APPT_DATE, ISO) AS date,
                    CHAR(A.APPT_TIME, JIS) AS time,
                    A.APPT_STATUS AS status,
                    A.APPT_NOTES AS notes,
                    A.PATIENT_ID AS patient_id,
                    P.PAT_NAME AS patient_name,
                    P.PAT_AGE AS age,
                    P.PAT_CONTACT AS contact
             FROM ${T.APPOINTMENTS} A
             JOIN ${T.PATIENTS} P ON A.PATIENT_ID = P.PATIENT_ID
             WHERE A.DOCTOR_ID = ?
             ORDER BY A.APPT_DATE DESC, A.APPT_TIME DESC`,
            [doctorId]
        );
        res.json(rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// GET /api/doctor/profile  -> COBOL HMSAPPT GET-DOC-PROFILE-PARA
app.get('/api/doctor/profile', async (req, res) => {
    const doctorId = parseInt(req.query.doctor_id, 10);
    try {
        const row = await db.queryOne(
            `SELECT DOCTOR_ID AS id, DOC_NAME AS name, SPECIALIZ AS specialization,
                    DEPARTMENT AS department, DOC_CONTACT AS contact, DOC_EMAIL AS email
             FROM ${T.DOCTORS}
             WHERE DOCTOR_ID = ?`,
            [doctorId]
        );
        res.json(row || {});
    } catch (err) {
        res.json({});
    }
});

// POST /api/prescription/add  -> COBOL HMSAPPT ADD-PRESC-PARA
app.post('/api/prescription/add', async (req, res) => {
    const { appointment_id, patient_id, doctor_id, medicine, dosage, duration, diagnosis, notes } = req.body;
    try {
        const result = await db.insert(
            `INSERT INTO ${T.PRESCRIPTIONS}
                (APPT_ID, PATIENT_ID, DOCTOR_ID, MEDICINE, DOSAGE, DURATION, DIAGNOSIS, PRESC_NOTES)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                parseInt(appointment_id, 10),
                parseInt(patient_id, 10),
                parseInt(doctor_id, 10),
                medicine,
                dosage,
                duration,
                diagnosis || '',
                notes || '',
            ]
        );
        res.json({ success: true, prescription_id: result.insertId });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ================================================================
// COBOL HMSADMIN - ADMIN MODULE
// ================================================================

// GET /api/admin/stats  -> COBOL HMSADMIN GET-ADMIN-STATS-PARA
app.get('/api/admin/stats', async (req, res) => {
    try {
        const pats = await db.queryOne(`SELECT COUNT(*) AS cnt FROM ${T.PATIENTS}`);
        const docs = await db.queryOne(`SELECT COUNT(*) AS cnt FROM ${T.DOCTORS} WHERE DOC_STATUS = 'ACTIVE'`);
        const today = await db.queryOne(`SELECT COUNT(*) AS cnt FROM ${T.APPOINTMENTS} WHERE APPT_DATE = CURRENT DATE`);
        const wards = await db.query(
            `SELECT WARD_ID AS ward_id, WARD_TYPE AS type,
                    TOTAL_BEDS AS total_beds, OCCPD_BEDS AS occupied_beds
             FROM ${T.WARDS}
             ORDER BY WARD_ID`
        );
        res.json({
            total_patients: pats ? pats.cnt : 0,
            total_doctors: docs ? docs.cnt : 0,
            today_appointments: today ? today.cnt : 0,
            wards,
        });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// GET /api/staff  -> COBOL HMSADMIN GET-STAFF-PARA
app.get('/api/staff', async (req, res) => {
    try {
        const rows = await db.query(
            `SELECT STAFF_ID AS id, STF_NAME AS name, STF_ROLE AS role,
                    STF_CONTACT AS contact, STF_DEPT AS department, STF_STATUS AS status
             FROM ${T.STAFF}
             WHERE STF_STATUS = 'ACTIVE'
             ORDER BY STF_ROLE, STF_NAME`
        );
        res.json(rows);
    } catch (err) {
        res.json([]);
    }
});

// POST /api/staff/add  -> COBOL HMSADMIN ADD-STAFF-PARA
app.post('/api/staff/add', async (req, res) => {
    const { name, role, contact, department } = req.body;
    try {
        const result = await db.insert(
            `INSERT INTO ${T.STAFF} (STF_NAME, STF_ROLE, STF_CONTACT, STF_DEPT)
             VALUES (?, ?, ?, ?)`,
            [name, role, contact, department || '']
        );
        res.json({ success: true, staff_id: result.insertId });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// POST /api/ward/update  -> COBOL HMSADMIN UPDATE-WARD-PARA
app.post('/api/ward/update', async (req, res) => {
    const { ward_id, occupied_beds } = req.body;
    try {
        await db.exec(
            `UPDATE ${T.WARDS} SET OCCPD_BEDS = ? WHERE WARD_ID = ?`,
            [parseInt(occupied_beds, 10), parseInt(ward_id, 10)]
        );
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// GET /api/feedback  -> COBOL HMSADMIN GET-FEEDBACK-PARA
app.get('/api/feedback', async (req, res) => {
    try {
        const rows = await db.query(
            `SELECT F.FDBK_ID AS id,
                    F.PATIENT_ID AS patient_id,
                    F.FDBK_MESSAGE AS message,
                    CHAR(F.FDBK_DATE, ISO) AS date,
                    F.FDBK_STATUS AS status,
                    P.PAT_NAME AS patient_name
             FROM ${T.FEEDBACK} F
             JOIN ${T.PATIENTS} P ON F.PATIENT_ID = P.PATIENT_ID
             ORDER BY F.CREATED_AT DESC`
        );
        res.json(rows);
    } catch (err) {
        res.json([]);
    }
});

// POST /api/feedback/submit  -> COBOL HMSADMIN ADD-FEEDBACK-PARA
app.post('/api/feedback/submit', async (req, res) => {
    const { patient_id, message } = req.body;
    try {
        const result = await db.insert(
            `INSERT INTO ${T.FEEDBACK} (PATIENT_ID, FDBK_MESSAGE, FDBK_DATE)
             VALUES (?, ?, CURRENT DATE)`,
            [parseInt(patient_id, 10), message]
        );
        res.json({ success: true, feedback_id: result.insertId });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Serve landing page
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'hospital_index.html')));

// ================================================================
// START SERVER (Only after verified live Db2 z/OS connection)
// ================================================================
const PORT = process.env.PORT || 8080;

async function start() {
    try {
        const info = await db.init();
        const server = app.listen(PORT, () => {
            console.log('\n╔═══════════════════════════════════════════════════════════╗');
            console.log('║    HMS - HOSPITAL MANAGEMENT SYSTEM (LIVE IBM z/OS DB2)   ║');
            console.log('╠═══════════════════════════════════════════════════════════╣');
            console.log(`║  Web Server   : http://localhost:${PORT}                     ║`);
            console.log(`║  Db2 Server   : ${db.config.host}:${db.config.port}/${info.server} (${db.config.subsystem})  ║`);
            console.log(`║  Db2 Product  : ${info.product}                           ║`);
            console.log(`║  Db2 Schema   : ${info.schema} (Database: ${info.schema})             ║`);
            console.log('║  z/OS Datasets: Z72385.CP.* (COBOL / JCL / DDL / SQL)    ║');
            console.log('║  Status       : DIRECTLY CONNECTED TO ONLINE z/OS DB2    ║');
            console.log('╚═══════════════════════════════════════════════════════════╝\n');
        });

        const shutdown = () => {
            db.close();
            server.close(() => process.exit(0));
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    } catch (err) {
        console.error('❌ Failed to connect to online IBM Db2 for z/OS:', err.message);
        process.exit(1);
    }
}

start();
