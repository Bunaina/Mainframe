/**
 * Migrates Db2 passwords to bcrypt hashes and seeds comprehensive realistic data.
 * Directly executes on IBM Db2 13 for z/OS (ZXPDB2).
 */

const bcrypt = require('bcryptjs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });
const Db2Client = require(path.join(ROOT, 'db2Client'));

async function run() {
    const db = new Db2Client();
    const info = await db.init();
    console.log(`Connected to Db2 z/OS: ${info.product} | Schema: ${info.schema}`);
    const S = info.schema;

    // 1. Password Hashing
    const adminPassHash = bcrypt.hashSync('admin123', 10);
    const docPassHash = bcrypt.hashSync('doc123', 10);
    const patPassHash = bcrypt.hashSync('patient123', 10);

    console.log('\n--- 1. Migrating existing passwords to bcrypt hashes ---');
    // Update admin
    await db.exec(`UPDATE ${S}.HMS_ADMIN SET ADM_PASSWORD = ? WHERE ADM_USERNAME = 'admin'`, [adminPassHash]);
    console.log('  [OK] Admin password updated to bcrypt hash');

    // Update existing doctors
    await db.exec(`UPDATE ${S}.HMS_DOCTORS SET DOC_PASSWORD = ?`, [docPassHash]);
    console.log('  [OK] Doctor passwords updated to bcrypt hash');

    // Update existing patients
    await db.exec(`UPDATE ${S}.HMS_PATIENTS SET PAT_PASSWORD = ?`, [patPassHash]);
    console.log('  [OK] Patient passwords updated to bcrypt hash');

    // 2. Add More Doctors (if not already present)
    console.log('\n--- 2. Seeding more doctors ---');
    const extraDoctors = [
        ['Dr. Olivia Bennett', 'Oncology', 'olivia@hospital.com', docPassHash, 'Oncology', '555-0105'],
        ['Dr. Robert Taylor', 'General Surgery', 'robert@hospital.com', docPassHash, 'Surgery', '555-0106'],
        ['Dr. Priya Sharma', 'Dermatology', 'priya@hospital.com', docPassHash, 'Dermatology', '555-0107'],
        ['Dr. David Kim', 'Radiology', 'david@hospital.com', docPassHash, 'Radiology', '555-0108'],
        ['Dr. Marcus Vance', 'Psychiatry', 'marcus@hospital.com', docPassHash, 'Psychiatry', '555-0109'],
        ['Dr. Angela Martin', 'Endocrinology', 'angela@hospital.com', docPassHash, 'Endocrinology', '555-0110']
    ];

    for (const d of extraDoctors) {
        const exists = await db.queryOne(`SELECT DOCTOR_ID FROM ${S}.HMS_DOCTORS WHERE DOC_EMAIL = ?`, [d[2]]);
        if (!exists) {
            await db.insert(
                `INSERT INTO ${S}.HMS_DOCTORS (DOC_NAME, SPECIALIZ, DOC_EMAIL, DOC_PASSWORD, DEPARTMENT, DOC_CONTACT)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                d
            );
            console.log(`  [INSERT] Doctor ${d[0]} (${d[1]})`);
        } else {
            console.log(`  [EXISTS] Doctor ${d[0]}`);
        }
    }

    // 3. Add More Patients (if not already present)
    console.log('\n--- 3. Seeding more patients ---');
    const extraPatients = [
        ['Maria Garcia', 42, 'Female', '555-2345', 'maria@email.com', patPassHash],
        ['Robert Davis', 67, 'Male', '555-3456', 'robert.d@email.com', patPassHash],
        ['Sophia Lee', 28, 'Female', '555-4567', 'sophia@email.com', patPassHash],
        ['William Brown', 54, 'Male', '555-5678', 'william@email.com', patPassHash],
        ['Elena Rostova', 31, 'Female', '555-6789', 'elena@email.com', patPassHash]
    ];

    for (const p of extraPatients) {
        const exists = await db.queryOne(`SELECT PATIENT_ID FROM ${S}.HMS_PATIENTS WHERE PAT_EMAIL = ?`, [p[4]]);
        if (!exists) {
            await db.insert(
                `INSERT INTO ${S}.HMS_PATIENTS (PAT_NAME, PAT_AGE, PAT_GENDER, PAT_CONTACT, PAT_EMAIL, PAT_PASSWORD)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                p
            );
            console.log(`  [INSERT] Patient ${p[0]} (${p[4]})`);
        } else {
            console.log(`  [EXISTS] Patient ${p[0]}`);
        }
    }

    // 4. Add More Wards
    console.log('\n--- 4. Seeding more wards ---');
    const extraWards = [
        ['PEDIATRIC', 25, 8],
        ['SURGICAL', 35, 15],
        ['MATERNITY', 20, 6]
    ];
    for (const w of extraWards) {
        const exists = await db.queryOne(`SELECT WARD_ID FROM ${S}.HMS_WARDS WHERE WARD_TYPE = ?`, [w[0]]);
        if (!exists) {
            await db.insert(`INSERT INTO ${S}.HMS_WARDS (WARD_TYPE, TOTAL_BEDS, OCCPD_BEDS) VALUES (?, ?, ?)`, w);
            console.log(`  [INSERT] Ward ${w[0]}`);
        } else {
            console.log(`  [EXISTS] Ward ${w[0]}`);
        }
    }

    // 5. Add More Staff
    console.log('\n--- 5. Seeding more staff ---');
    const extraStaff = [
        ['David Miller', 'Lab Technician', '555-2004', 'Pathology'],
        ['Emma Watson', 'Pharmacist', '555-2005', 'Pharmacy'],
        ['Frank Martinez', 'Radiologic Tech', '555-2006', 'Radiology'],
        ['Grace Hopper', 'Head Nurse', '555-2007', 'ICU'],
        ['Henry Clark', 'Billing Specialist', '555-2008', 'Finance']
    ];
    for (const st of extraStaff) {
        const exists = await db.queryOne(`SELECT STAFF_ID FROM ${S}.HMS_STAFF WHERE STF_NAME = ?`, [st[0]]);
        if (!exists) {
            await db.insert(`INSERT INTO ${S}.HMS_STAFF (STF_NAME, STF_ROLE, STF_CONTACT, STF_DEPT) VALUES (?, ?, ?, ?)`, st);
            console.log(`  [INSERT] Staff ${st[0]} (${st[1]})`);
        } else {
            console.log(`  [EXISTS] Staff ${st[0]}`);
        }
    }

    // Fetch IDs for patients and doctors to link foreign keys
    const patients = await db.query(`SELECT PATIENT_ID, PAT_NAME FROM ${S}.HMS_PATIENTS ORDER BY PATIENT_ID`);
    const doctors = await db.query(`SELECT DOCTOR_ID, DOC_NAME FROM ${S}.HMS_DOCTORS ORDER BY DOCTOR_ID`);

    // 6. Add Appointments
    console.log('\n--- 6. Seeding realistic appointments ---');
    const apptCount = await db.queryOne(`SELECT COUNT(*) AS CNT FROM ${S}.HMS_APPOINTMENTS`);
    if (apptCount && Number(apptCount.cnt) < 5) {
        const sampleAppts = [
            [patients[0].patient_id, doctors[0].doctor_id, '2026-11-19', '09:30:00', 'COMPLETED', 'Regular cardiac evaluation and blood pressure check.'],
            [patients[0].patient_id, doctors[1].doctor_id, '2026-11-25', '11:00:00', 'SCHEDULED', 'Follow-up consultation for knee joint rehabilitation.'],
            [patients[1] ? patients[1].patient_id : patients[0].patient_id, doctors[2].doctor_id, '2026-11-18', '14:00:00', 'COMPLETED', 'Neurology consultation for chronic migraine.'],
            [patients[1] ? patients[1].patient_id : patients[0].patient_id, doctors[3].doctor_id, '2026-11-22', '10:15:00', 'SCHEDULED', 'Pediatric annual wellness checkup.'],
            [patients[2] ? patients[2].patient_id : patients[0].patient_id, doctors[0].doctor_id, '2026-11-17', '15:30:00', 'COMPLETED', 'Post-procedure review and ECG monitoring.'],
            [patients[2] ? patients[2].patient_id : patients[0].patient_id, doctors[4] ? doctors[4].doctor_id : doctors[0].doctor_id, '2026-11-28', '16:00:00', 'SCHEDULED', 'Bi-monthly oncology follow-up.'],
            [patients[3] ? patients[3].patient_id : patients[0].patient_id, doctors[6] ? doctors[6].doctor_id : doctors[1].doctor_id, '2026-11-19', '13:00:00', 'SCHEDULED', 'Dermatology consultation for skin allergy.'],
            [patients[4] ? patients[4].patient_id : patients[0].patient_id, doctors[5] ? doctors[5].doctor_id : doctors[1].doctor_id, '2026-11-15', '08:45:00', 'CANCELLED', 'Patient requested reschedule due to travel.']
        ];

        for (const a of sampleAppts) {
            await db.insert(
                `INSERT INTO ${S}.HMS_APPOINTMENTS (PATIENT_ID, DOCTOR_ID, APPT_DATE, APPT_TIME, APPT_STATUS, APPT_NOTES)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                a
            );
        }
        console.log(`  [INSERT] Seeded ${sampleAppts.length} appointments`);
    } else {
        console.log(`  [EXISTS] Appointments already seeded (count: ${apptCount.cnt})`);
    }

    // 7. Add Prescriptions
    console.log('\n--- 7. Seeding prescriptions ---');
    const prescCount = await db.queryOne(`SELECT COUNT(*) AS CNT FROM ${S}.HMS_PRESCRIPTIONS`);
    if (prescCount && Number(prescCount.cnt) < 3) {
        const completedAppts = await db.query(`SELECT APPT_ID, PATIENT_ID, DOCTOR_ID FROM ${S}.HMS_APPOINTMENTS WHERE APPT_STATUS = 'COMPLETED'`);
        if (completedAppts.length > 0) {
            const rxList = [
                [completedAppts[0].appt_id, completedAppts[0].patient_id, completedAppts[0].doctor_id, 'Atorvastatin 20mg', '1 tablet nightly', '30 days', 'Hyperlipidemia', 'Take after dinner. Monitor lipid profile in 1 month.'],
                [completedAppts[0].appt_id, completedAppts[0].patient_id, completedAppts[0].doctor_id, 'Lisinopril 10mg', '1 tablet daily in morning', '30 days', 'Hypertension Stage 1', 'Hydrate adequately throughout the day.'],
                [completedAppts[1] ? completedAppts[1].appt_id : completedAppts[0].appt_id,
                 completedAppts[1] ? completedAppts[1].patient_id : completedAppts[0].patient_id,
                 completedAppts[1] ? completedAppts[1].doctor_id : completedAppts[0].doctor_id,
                 'Sumatriptan 50mg', '1 tablet at migraine onset', 'As needed (max 2/day)', 'Migraine with Aura', 'Rest in dark room after taking.']
            ];
            for (const rx of rxList) {
                await db.insert(
                    `INSERT INTO ${S}.HMS_PRESCRIPTIONS (APPT_ID, PATIENT_ID, DOCTOR_ID, MEDICINE, DOSAGE, DURATION, DIAGNOSIS, PRESC_NOTES)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    rx
                );
            }
            console.log(`  [INSERT] Seeded ${rxList.length} prescriptions`);
        }
    } else {
        console.log(`  [EXISTS] Prescriptions already seeded (count: ${prescCount.cnt})`);
    }

    // 8. Add Billing Records
    console.log('\n--- 8. Seeding billing records ---');
    const billCount = await db.queryOne(`SELECT COUNT(*) AS CNT FROM ${S}.HMS_BILLING`);
    if (billCount && Number(billCount.cnt) < 3) {
        const bills = [
            [patients[0].patient_id, 150.00, 'PAID', 'Cardiology Consultation & 12-Lead ECG', '2026-11-19'],
            [patients[0].patient_id, 85.00, 'PENDING', 'Pharmacy Dispense - Atorvastatin & Lisinopril', null],
            [patients[1] ? patients[1].patient_id : patients[0].patient_id, 220.00, 'PAID', 'Neurology Diagnostic Assessment & EEG', '2026-11-18'],
            [patients[2] ? patients[2].patient_id : patients[0].patient_id, 450.00, 'PENDING', 'Cardiac Stress Test & Ultrasound Echo', null],
            [patients[3] ? patients[3].patient_id : patients[0].patient_id, 120.00, 'PAID', 'Dermatology Skin Biopsy & Consultation', '2026-11-16']
        ];
        for (const b of bills) {
            await db.insert(
                `INSERT INTO ${S}.HMS_BILLING (PATIENT_ID, AMOUNT, BILL_STATUS, DESCRIPTION, PAYMENT_DATE)
                 VALUES (?, ?, ?, ?, ?)`,
                b
            );
        }
        console.log(`  [INSERT] Seeded ${bills.length} billing records`);
    } else {
        console.log(`  [EXISTS] Billing records already seeded (count: ${billCount.cnt})`);
    }

    // 9. Add Feedback
    console.log('\n--- 9. Seeding feedback ---');
    const fdbkCount = await db.queryOne(`SELECT COUNT(*) AS CNT FROM ${S}.HMS_FEEDBACK`);
    if (fdbkCount && Number(fdbkCount.cnt) < 3) {
        const feedbacks = [
            [patients[0].patient_id, 'Dr. Sarah Johnson was exceptionally thorough and explained my cardiac test results clearly.', '2026-11-18', 'READ'],
            [patients[1] ? patients[1].patient_id : patients[0].patient_id, 'Very clean facility and prompt appointment handling in the neurology clinic.', '2026-11-18', 'UNREAD'],
            [patients[2] ? patients[2].patient_id : patients[0].patient_id, 'Nursing staff at cardiology ward were attentive and caring throughout my visit.', '2026-11-17', 'READ'],
            [patients[3] ? patients[3].patient_id : patients[0].patient_id, 'Fast appointment booking system. Appreciated the SMS reminder.', '2026-11-19', 'UNREAD']
        ];
        for (const fb of feedbacks) {
            await db.insert(
                `INSERT INTO ${S}.HMS_FEEDBACK (PATIENT_ID, FDBK_MESSAGE, FDBK_DATE, FDBK_STATUS)
                 VALUES (?, ?, ?, ?)`,
                fb
            );
        }
        console.log(`  [INSERT] Seeded ${feedbacks.length} feedback records`);
    } else {
        console.log(`  [EXISTS] Feedback records already seeded (count: ${fdbkCount.cnt})`);
    }

    // Print final row count summary
    console.log('\n===============================================');
    console.log('FINAL LIVE IBM Db2 13 TABLE ROW COUNTS:');
    console.log('===============================================');
    const tables = [
        'HMS_ADMIN', 'HMS_WARDS', 'HMS_DOCTORS', 'HMS_PATIENTS',
        'HMS_STAFF', 'HMS_APPOINTMENTS', 'HMS_PRESCRIPTIONS',
        'HMS_BILLING', 'HMS_FEEDBACK'
    ];
    for (const t of tables) {
        const r = await db.queryOne(`SELECT COUNT(*) AS CNT FROM ${S}.${t}`);
        console.log(`  ${(S + '.' + t).padEnd(28)} : ${r.cnt} rows`);
    }

    db.close();
    console.log('\nMigration and data seeding completed successfully!');
}

run().catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
});
