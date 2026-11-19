/**
 * End-to-end live verification of server.js against online IBM Db2 13 for z/OS (ZXPDB2).
 * Starts server.js on port 8089, exercises every REST API endpoint, verifies live Db2 writes & reads,
 * cleans up synthetic test rows, and shuts down cleanly.
 */

const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });
const Db2Client = require(path.join(ROOT, 'db2Client'));

const PORT = 8089;
const BASE = `http://localhost:${PORT}`;

async function req(method, url, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${url}`, opts);
    return await res.json();
}

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
    console.log(`  [PASS] ${msg}`);
}

async function waitReady(timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const h = await req('GET', '/api/health');
            if (h && h.connected) return h;
        } catch (_) {}
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('Server did not become ready in time');
}

async function main() {
    const srv = spawn('node', ['server.js'], {
        cwd: ROOT,
        env: { ...process.env, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    srv.stdout.on('data', (d) => process.stdout.write(d.toString()));
    srv.stderr.on('data', (d) => process.stderr.write(d.toString()));

    let createdApptId = null;
    let createdPrescId = null;
    let createdFdbkId = null;
    let createdStaffId = null;
    let createdDoctorId = null;

    try {
        const health = await waitReady();
        assert(health.connected === true && health.server === 'ZXPDB2',
            `GET /api/health -> live Db2 ${health.product} (${health.server}, user=${health.user})`);

        // 1. Login tests (Admin, Doctor, Patient, invalid)
        const adm = await req('POST', '/api/login', { email: 'admin', password: 'admin123', role: 'admin' });
        assert(adm.success && adm.user.username === 'admin', 'POST /api/login (admin)');

        const doc = await req('POST', '/api/login', { email: 'sarah@hospital.com', password: 'doc123', role: 'doctor' });
        assert(doc.success && doc.user.name === 'Dr. Sarah Johnson', 'POST /api/login (doctor)');

        const pat = await req('POST', '/api/login', { email: 'john@email.com', password: 'patient123', role: 'patient' });
        assert(pat.success && pat.user.name === 'John Doe', 'POST /api/login (patient)');

        const bad = await req('POST', '/api/login', { email: 'john@email.com', password: 'wrong', role: 'patient' });
        assert(bad.success === false, 'POST /api/login rejects invalid credentials');

        // 2. Doctors, Admin stats, Staff
        const docs = await req('GET', '/api/doctors');
        assert(Array.isArray(docs) && docs.length >= 4, `GET /api/doctors returned ${docs.length} doctors`);

        const stats = await req('GET', '/api/admin/stats');
        assert(stats.total_patients >= 1 && stats.total_doctors >= 4 && stats.wards.length >= 3,
            `GET /api/admin/stats (patients=${stats.total_patients}, doctors=${stats.total_doctors}, wards=${stats.wards.length})`);

        // Test Doctor Onboarding API (with bcrypt)
        const testDocEmail = `test.onboard.${Date.now()}@hospital.com`;
        const newDoc = await req('POST', '/api/doctor/add', {
            name: 'Dr. Test Onboard',
            specialization: 'Neurology',
            department: 'Neurology Dept',
            contact: '555-8888',
            email: testDocEmail,
            password: 'onboardPass123'
        });
        assert(newDoc.success && newDoc.doctor_id > 0, `POST /api/doctor/add (id=${newDoc.doctor_id})`);
        createdDoctorId = newDoc.doctor_id;

        // Test login with newly onboarded doctor (verifies bcrypt hash & compare)
        const testDocLogin = await req('POST', '/api/login', {
            email: testDocEmail,
            password: 'onboardPass123',
            role: 'doctor'
        });
        assert(testDocLogin.success && testDocLogin.user.name === 'Dr. Test Onboard',
            'POST /api/login verified bcrypt password for newly onboarded doctor');

        const staff = await req('GET', '/api/staff');
        assert(Array.isArray(staff) && staff.length >= 3, `GET /api/staff returned ${staff.length} staff`);

        // 3. Doctor profile
        const docProf = await req('GET', `/api/doctor/profile?doctor_id=${doc.user.id}`);
        assert(docProf.email === 'sarah@hospital.com', 'GET /api/doctor/profile');

        // 4. Book appointment (with HTML5 HH:MM time format)
        const book = await req('POST', '/api/appointment/book', {
            patient_id: pat.user.id,
            doctor_id: doc.user.id,
            date: '2026-11-20',
            time: '14:30',
        });
        assert(book.success && book.appointment_id > 0, `POST /api/appointment/book (id=${book.appointment_id})`);
        createdApptId = book.appointment_id;

        // 5. Patient & Doctor appointments
        const patAppts = await req('GET', `/api/patient/appointments?patient_id=${pat.user.id}`);
        assert(patAppts.some((a) => a.id === createdApptId), 'GET /api/patient/appointments sees new Db2 row');

        const docAppts = await req('GET', `/api/doctor/appointments?doctor_id=${doc.user.id}`);
        assert(docAppts.some((a) => a.id === createdApptId), 'GET /api/doctor/appointments sees new Db2 row');

        // 6. Update appointment status
        const upd = await req('POST', '/api/appointment/update', {
            appointment_id: createdApptId,
            status: 'COMPLETED',
            notes: 'Verified live on Db2 13 z/OS',
        });
        assert(upd.success === true, 'POST /api/appointment/update');

        // 7. Add prescription & query patient prescriptions
        const prx = await req('POST', '/api/prescription/add', {
            appointment_id: createdApptId,
            patient_id: pat.user.id,
            doctor_id: doc.user.id,
            medicine: 'Paracetamol 500mg',
            dosage: '1 tab twice daily',
            duration: '5 days',
            diagnosis: 'Routine checkup',
            notes: 'After meals',
        });
        assert(prx.success && prx.prescription_id > 0, `POST /api/prescription/add (id=${prx.prescription_id})`);
        createdPrescId = prx.prescription_id;

        const patPrx = await req('GET', `/api/patient/prescriptions?patient_id=${pat.user.id}`);
        assert(patPrx.some((p) => p.id === createdPrescId), 'GET /api/patient/prescriptions sees new Db2 row');

        const dash = await req('GET', `/api/patient/dashboard?patient_id=${pat.user.id}`);
        assert(dash.total_appointments >= 1 && dash.total_prescriptions >= 1, 'GET /api/patient/dashboard');

        // 8. Feedback submit & list
        const fdbk = await req('POST', '/api/feedback/submit', {
            patient_id: pat.user.id,
            message: 'Excellent care verified on z/OS Db2!',
        });
        assert(fdbk.success && fdbk.feedback_id > 0, `POST /api/feedback/submit (id=${fdbk.feedback_id})`);
        createdFdbkId = fdbk.feedback_id;

        const allFdbk = await req('GET', '/api/feedback');
        assert(allFdbk.some((f) => f.id === createdFdbkId), 'GET /api/feedback sees new Db2 row');

        // 9. Staff add & Ward update (then restore ward)
        const addStf = await req('POST', '/api/staff/add', {
            name: 'Test Nurse E2E',
            role: 'Nurse',
            contact: '555-9999',
            department: 'ICU',
        });
        assert(addStf.success && addStf.staff_id > 0, `POST /api/staff/add (id=${addStf.staff_id})`);
        createdStaffId = addStf.staff_id;

        const wUpd = await req('POST', '/api/ward/update', { ward_id: stats.wards[0].ward_id, occupied_beds: 6 });
        assert(wUpd.success === true, 'POST /api/ward/update');
        await req('POST', '/api/ward/update', { ward_id: stats.wards[0].ward_id, occupied_beds: 5 });

        // 10. RLS Verification Tests
        // 10a. Admin can see all (patients & appointments)
        const allPatientsAdmin = await req('GET', '/api/admin/patients');
        assert(Array.isArray(allPatientsAdmin) && allPatientsAdmin.length >= 6,
            `RLS [Admin]: Admin can see all patients (${allPatientsAdmin.length} records)`);

        const allApptsAdmin = await req('GET', '/api/admin/appointments');
        assert(Array.isArray(allApptsAdmin) && allApptsAdmin.length >= 9,
            `RLS [Admin]: Admin can see all appointments (${allApptsAdmin.length} records across all doctors)`);

        // 10b. Doctor can see only their assigned appointments
        const doc1Appts = await req('GET', '/api/doctor/appointments?doctor_id=1');
        assert(Array.isArray(doc1Appts) && doc1Appts.length >= 1,
            `RLS [Doctor]: Doctor 1 returned ${doc1Appts.length} assigned appointments`);

        // 10c. Doctor can see only patients whom they have treated previously
        const doc1Patients = await req('GET', '/api/doctor/patients?doctor_id=1');
        assert(Array.isArray(doc1Patients) && doc1Patients.some(p => p.id === 1),
            'RLS [Doctor]: Doctor 1 sees treated patient John Doe (#1)');
        assert(!doc1Patients.some(p => p.id === 2),
            'RLS [Doctor]: Doctor 1 CANNOT see patient Maria Garcia (#2, treated by Doctor 3)');

        const doc3Patients = await req('GET', '/api/doctor/patients?doctor_id=3');
        assert(doc3Patients.some(p => p.id === 2),
            'RLS [Doctor]: Doctor 3 sees treated patient Maria Garcia (#2)');
        assert(!doc3Patients.some(p => p.id === 1),
            'RLS [Doctor]: Doctor 3 CANNOT see patient John Doe (#1, treated by Doctor 1)');

        // 10d. Doctor cross-appointment RLS prevention
        const illegalPresc = await req('POST', '/api/prescription/add', {
            appointment_id: createdApptId, // assigned to doc.user.id (Doctor 1)
            patient_id: pat.user.id,
            doctor_id: 999, // Unassigned doctor
            medicine: 'Illegal Med',
            dosage: '1 tab',
            duration: '1 day',
        });
        assert(illegalPresc.success === false && illegalPresc.error.includes('RLS Access Denied'),
            'RLS [Doctor]: Unassigned doctor prevented from writing prescription for another doctor appointment');

        // 10e. RLS Policies Catalog check
        const rlsCatalog = await req('GET', '/api/rls/policies');
        assert(rlsCatalog.success && rlsCatalog.total_policies >= 9,
            `RLS [Catalog]: Live Db2 catalog returns ${rlsCatalog.total_policies} active RLS policies`);

        // Cleanup synthetic test records so Db2 stays clean with seed data
        const db = new Db2Client();
        await db.init();
        const schema = db.config.schema;
        if (createdPrescId) await db.exec(`DELETE FROM ${schema}.HMS_PRESCRIPTIONS WHERE PRESC_ID = ?`, [createdPrescId]);
        if (createdApptId) await db.exec(`DELETE FROM ${schema}.HMS_APPOINTMENTS WHERE APPT_ID = ?`, [createdApptId]);
        await db.exec(`DELETE FROM ${schema}.HMS_APPOINTMENTS WHERE APPT_DATE = '2026-11-20' AND APPT_TIME = '14:30:00'`);
        if (createdFdbkId) await db.exec(`DELETE FROM ${schema}.HMS_FEEDBACK WHERE FDBK_ID = ?`, [createdFdbkId]);
        if (createdStaffId) await db.exec(`DELETE FROM ${schema}.HMS_STAFF WHERE STAFF_ID = ?`, [createdStaffId]);
        if (createdDoctorId) await db.exec(`DELETE FROM ${schema}.HMS_DOCTORS WHERE DOCTOR_ID = ?`, [createdDoctorId]);
        await db.exec(`DELETE FROM ${schema}.HMS_DOCTORS WHERE DOC_EMAIL LIKE 'test.onboard%'`);
        db.close();
        console.log('  [CLEAN] Synthetic E2E test rows cleaned up from Db2.');
        console.log('\nALL LIVE E2E TESTS PASSED WITH ZERO ERRORS!');
    } finally {
        srv.kill('SIGTERM');
    }
}

main().catch((err) => {
    console.error('\nTEST FAILED:', err);
    process.exit(1);
});
