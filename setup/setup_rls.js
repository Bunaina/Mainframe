/**
 * Setup Db2 Row-Level Security (RLS) tables, views, and catalog entries
 * for HealthCare+ on IBM Db2 13 for z/OS.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const Db2Client = require(path.join(__dirname, '..', 'db2Client'));

async function main() {
    const db = new Db2Client();
    await db.init();
    const schema = db.config.schema || 'Z72385';

    console.log(`Connecting to Db2 for z/OS schema: ${schema}...`);

    // 1. Create table HMS_RLS_POLICIES if not exists
    try {
        await db.exec(`
            CREATE TABLE ${schema}.HMS_RLS_POLICIES (
                POLICY_ID     INTEGER        NOT NULL GENERATED ALWAYS AS IDENTITY
                                             (START WITH 1 INCREMENT BY 1),
                POLICY_NAME   VARCHAR(100)   NOT NULL,
                TARGET_TABLE  VARCHAR(100)   NOT NULL,
                TARGET_ROLE   VARCHAR(50)    NOT NULL,
                POLICY_TYPE   VARCHAR(30)    NOT NULL WITH DEFAULT 'ROW_PERM',
                RULE_FILTER   VARCHAR(500)   NOT NULL,
                ENFORCED      CHAR(1)        NOT NULL WITH DEFAULT 'Y',
                STATUS        VARCHAR(20)    NOT NULL WITH DEFAULT 'ACTIVE',
                DESCRIPTION   VARCHAR(500)   NOT NULL,
                CREATED_AT    TIMESTAMP      NOT NULL WITH DEFAULT,
                CONSTRAINT PK_HMS_RLS PRIMARY KEY (POLICY_ID),
                CONSTRAINT UQ_RLS_NAME UNIQUE (POLICY_NAME)
            ) IN DATABASE ${schema}
        `);
        console.log('✓ Created table HMS_RLS_POLICIES');
    } catch (e) {
        if (e.sqlcode === -601 || (e.message && e.message.includes('-601'))) {
            console.log('  Table HMS_RLS_POLICIES already exists');
        } else {
            console.error('Error creating HMS_RLS_POLICIES:', e);
            throw e;
        }
    }

    // 2. Create view V_RLS_POLICIES
    try {
        await db.exec(`DROP VIEW ${schema}.V_RLS_POLICIES`);
    } catch (_) {}
    try {
        await db.exec(`
            CREATE VIEW ${schema}.V_RLS_POLICIES AS
            SELECT POLICY_ID, POLICY_NAME, TARGET_TABLE, TARGET_ROLE,
                   POLICY_TYPE, RULE_FILTER, ENFORCED, STATUS, DESCRIPTION,
                   CHAR(CREATED_AT) AS CREATED_AT
            FROM ${schema}.HMS_RLS_POLICIES
        `);
        console.log('✓ Created view V_RLS_POLICIES');
    } catch (e) {
        console.error('Error creating V_RLS_POLICIES:', e);
    }

    // 3. Create view V_DOC_TREATED_PATIENTS (Doctor RLS view)
    try {
        await db.exec(`DROP VIEW ${schema}.V_DOC_TREATED_PATIENTS`);
    } catch (_) {}
    try {
        await db.exec(`
            CREATE VIEW ${schema}.V_DOC_TREATED_PATIENTS AS
            SELECT DISTINCT
                A.DOCTOR_ID,
                P.PATIENT_ID,
                P.PAT_NAME,
                P.PAT_AGE,
                P.PAT_GENDER,
                P.PAT_CONTACT,
                P.PAT_EMAIL,
                MAX(A.APPT_DATE) AS LAST_CONSULTATION
            FROM ${schema}.HMS_PATIENTS P
            JOIN ${schema}.HMS_APPOINTMENTS A ON P.PATIENT_ID = A.PATIENT_ID
            GROUP BY A.DOCTOR_ID, P.PATIENT_ID, P.PAT_NAME, P.PAT_AGE, P.PAT_GENDER, P.PAT_CONTACT, P.PAT_EMAIL
        `);
        console.log('✓ Created view V_DOC_TREATED_PATIENTS');
    } catch (e) {
        console.error('Error creating V_DOC_TREATED_PATIENTS:', e);
    }

    // 4. Seed RLS Policies
    const policies = [
        {
            name: 'RLS_ADMIN_ALL_TABLES',
            table: '* (ALL TABLES)',
            role: 'ADMIN',
            type: 'ROW_PERM',
            filter: 'TRUE (Unrestricted institutional visibility)',
            enforced: 'Y',
            status: 'ACTIVE',
            desc: 'System administrators possess full access to all patient records, doctor profiles, ward capacities, staff, and financial billing.'
        },
        {
            name: 'RLS_DOCTOR_ASSIGNED_APPTS',
            table: 'HMS_APPOINTMENTS',
            role: 'DOCTOR',
            type: 'ROW_PERM',
            filter: 'APPT.DOCTOR_ID = CURRENT_DOCTOR_ID',
            enforced: 'Y',
            status: 'ACTIVE',
            desc: 'Doctors can query and review only appointments specifically scheduled with their physician ID.'
        },
        {
            name: 'RLS_DOCTOR_TREATED_PATIENTS',
            table: 'HMS_PATIENTS',
            role: 'DOCTOR',
            type: 'ROW_PERM',
            filter: 'EXISTS (SELECT 1 FROM HMS_APPOINTMENTS A WHERE A.PATIENT_ID = P.PATIENT_ID AND A.DOCTOR_ID = CURRENT_DOCTOR_ID)',
            enforced: 'Y',
            status: 'ACTIVE',
            desc: 'Doctors can view only demographic and medical records of patients who have booked appointments or been treated by them previously.'
        },
        {
            name: 'RLS_DOCTOR_OWN_PROFILE',
            table: 'HMS_DOCTORS',
            role: 'DOCTOR',
            type: 'ROW_PERM',
            filter: 'DOCTOR_ID = CURRENT_DOCTOR_ID OR DOC_STATUS = \'ACTIVE\'',
            enforced: 'Y',
            status: 'ACTIVE',
            desc: 'Doctors can read the active doctor roster but update exclusively their own credentials, contact, and schedule.'
        },
        {
            name: 'RLS_DOCTOR_OWN_PRESCRIPTIONS',
            table: 'HMS_PRESCRIPTIONS',
            role: 'DOCTOR',
            type: 'ROW_PERM',
            filter: 'PRESC.DOCTOR_ID = CURRENT_DOCTOR_ID',
            enforced: 'Y',
            status: 'ACTIVE',
            desc: 'Doctors can write, edit, and inspect prescriptions only for patients under their active consultation.'
        },
        {
            name: 'RLS_PATIENT_OWN_APPOINTMENTS',
            table: 'HMS_APPOINTMENTS',
            role: 'PATIENT',
            type: 'ROW_PERM',
            filter: 'APPT.PATIENT_ID = CURRENT_PATIENT_ID',
            enforced: 'Y',
            status: 'ACTIVE',
            desc: 'Patients can view, book, and cancel exclusively their own consultations. Other patient bookings remain invisible.'
        },
        {
            name: 'RLS_PATIENT_OWN_PRESCRIPTIONS',
            table: 'HMS_PRESCRIPTIONS',
            role: 'PATIENT',
            type: 'ROW_PERM',
            filter: 'PRESC.PATIENT_ID = CURRENT_PATIENT_ID',
            enforced: 'Y',
            status: 'ACTIVE',
            desc: 'Patients can access only prescriptions and medications prescribed directly to their patient ID.'
        },
        {
            name: 'RLS_PATIENT_OWN_PROFILE',
            table: 'HMS_PATIENTS',
            role: 'PATIENT',
            type: 'ROW_PERM',
            filter: 'PATIENT_ID = CURRENT_PATIENT_ID',
            enforced: 'Y',
            status: 'ACTIVE',
            desc: 'Patients can inspect and update only their own patient profile and demographic contact details.'
        },
        {
            name: 'RLS_PATIENT_OWN_FEEDBACK',
            table: 'HMS_FEEDBACK',
            role: 'PATIENT',
            type: 'ROW_PERM',
            filter: 'FDBK.PATIENT_ID = CURRENT_PATIENT_ID',
            enforced: 'Y',
            status: 'ACTIVE',
            desc: 'Patients can submit and view only their own feedback messages and support requests.'
        }
    ];

    for (const p of policies) {
        try {
            await db.exec(`
                INSERT INTO ${schema}.HMS_RLS_POLICIES
                    (POLICY_NAME, TARGET_TABLE, TARGET_ROLE, POLICY_TYPE, RULE_FILTER, ENFORCED, STATUS, DESCRIPTION)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [p.name, p.table, p.role, p.type, p.filter, p.enforced, p.status, p.desc]);
            console.log(`  + Seeded RLS policy: ${p.name}`);
        } catch (e) {
            if (e.sqlcode === -803 || (e.message && e.message.includes('-803'))) {
                console.log(`  ~ Policy ${p.name} already seeded`);
            } else {
                console.error(`Error inserting policy ${p.name}:`, e.message);
            }
        }
    }

    const count = await db.queryOne(`SELECT COUNT(*) AS CNT FROM ${schema}.HMS_RLS_POLICIES`);
    console.log(`\nRLS Setup completed! Total policies active in Db2: ${count.cnt || count.CNT}`);

    db.close();
}

main().catch(err => {
    console.error('Setup failed:', err);
    process.exit(1);
});
