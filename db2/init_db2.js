/**
 * Initializes the HMS schema on online IBM Db2 13 for z/OS (ZXPDB2 / DBDG).
 * Reads db2/HMS_DDL.sql and executes DDL + idempotent seed data.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const Db2Client = require('../db2Client');

async function main() {
    const db = new Db2Client();
    const info = await db.init();
    console.log(`Connected to ${info.product} | Server: ${info.server} | User: ${info.user} | Schema: ${info.schema}`);

    const ddlPath = path.join(__dirname, 'HMS_DDL.sql');
    const rawSql = fs.readFileSync(ddlPath, 'utf8');

    // Strip single-line comments and split on semicolons
    const cleaned = rawSql
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');

    const statements = cleaned
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    const ddlStmts = statements.filter((s) => !s.toUpperCase().startsWith('INSERT '));
    const seedStmts = statements.filter((s) => s.toUpperCase().startsWith('INSERT '));

    console.log(`\nExecuting ${ddlStmts.length} DDL statements on Db2 z/OS...`);
    for (const stmt of ddlStmts) {
        const label = stmt.split(/\r?\n/)[0].slice(0, 72);
        try {
            await db.ddl(stmt);
            console.log(`  [OK]     ${label}`);
        } catch (err) {
            if (err.sqlcode === -601) {
                console.log(`  [EXISTS] ${label}`);
            } else {
                console.error(`  [FAIL]   ${label}\n           SQLCODE=${err.sqlcode} ${err.message}`);
                db.close();
                process.exit(1);
            }
        }
    }

    const schema = db.config.schema;
    const adminRow = await db.queryOne(`SELECT COUNT(*) AS CNT FROM ${schema}.HMS_ADMIN`);
    if (adminRow && Number(adminRow.cnt) === 0) {
        console.log(`\nSeeding initial data (${seedStmts.length} rows)...`);
        for (const stmt of seedStmts) {
            await db.exec(stmt);
        }
        console.log('  [OK]     Initial seed data inserted.');
    } else {
        console.log(`\nSeed data already present (HMS_ADMIN rows: ${adminRow ? adminRow.cnt : 0}). Skipping inserts.`);
    }

    console.log('\nVerifying tables and views in SYSIBM.SYSTABLES:');
    const tables = await db.query(
        `SELECT NAME, TYPE, DBNAME, TSNAME
         FROM SYSIBM.SYSTABLES
         WHERE CREATOR = ? AND (NAME LIKE 'HMS_%' OR NAME LIKE 'V_HMS_%')
         ORDER BY TYPE, NAME`,
        [schema]
    );
    for (const t of tables) {
        console.log(`  ${t.type === 'T' ? 'TABLE' : 'VIEW '}  ${schema}.${t.name} (DB=${t.dbname}, TS=${t.tsname})`);
    }

    console.log('\nLive row counts:');
    const countTables = [
        'HMS_ADMIN', 'HMS_WARDS', 'HMS_DOCTORS', 'HMS_PATIENTS',
        'HMS_STAFF', 'HMS_APPOINTMENTS', 'HMS_PRESCRIPTIONS',
        'HMS_BILLING', 'HMS_FEEDBACK'
    ];
    for (const tbl of countTables) {
        const r = await db.queryOne(`SELECT COUNT(*) AS CNT FROM ${schema}.${tbl}`);
        console.log(`  ${schema}.${tbl.padEnd(18)} : ${r.cnt}`);
    }

    db.close();
    console.log('\nDb2 z/OS initialization complete.');
}

main().catch((err) => {
    console.error('Initialization error:', err);
    process.exit(1);
});
