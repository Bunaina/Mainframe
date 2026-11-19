/**
 * Node.js Async Client for IBM Db2 for z/OS via persistent Type-4 JDBC Bridge
 * Connects directly to online IBM Db2 13 for z/OS (DRDA TCP/IP).
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

class Db2Client {
    constructor(config = {}) {
        this.config = {
            host: config.host || process.env.DB2_HOST || '204.90.115.200',
            port: String(config.port || process.env.DB2_PORT || '5040'),
            database: config.database || process.env.DB2_DATABASE || 'ZXPDB2',
            subsystem: config.subsystem || process.env.DB2_SUBSYSTEM || 'DBDG',
            user: config.user || process.env.DB2_USER || 'Z72385',
            password: config.password || process.env.DB2_PASSWORD || '',
            schema: (config.schema || process.env.DB2_SCHEMA || process.env.DB2_USER || 'Z72385').toUpperCase(),
        };
        this.proc = null;
        this.readyInfo = null;
        this.reqSeq = 0;
        this.pending = new Map();
        this.closed = false;
    }

    init() {
        return new Promise((resolve, reject) => {
            const driverDir = path.join(__dirname, 'db2-driver');
            const sep = process.platform === 'win32' ? ';' : ':';
            const cp = [
                driverDir,
                path.join(driverDir, 'db2jcc4.jar'),
                path.join(driverDir, 'db2jcc_license_cisuz.jar'),
            ].join(sep);

            const env = {
                ...process.env,
                DB2_HOST: this.config.host,
                DB2_PORT: this.config.port,
                DB2_DATABASE: this.config.database,
                DB2_USER: this.config.user,
                DB2_PASSWORD: this.config.password,
                DB2_SCHEMA: this.config.schema,
            };

            this.proc = spawn('java', ['-cp', cp, 'Db2Bridge'], {
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            let initialized = false;
            let stderrBuf = '';

            this.proc.stderr.on('data', (chunk) => {
                stderrBuf += chunk.toString();
            });

            this.proc.on('error', (err) => {
                if (!initialized) {
                    initialized = true;
                    reject(new Error(`Failed to launch Java Db2 JDBC Bridge: ${err.message}`));
                }
            });

            this.proc.on('exit', (code) => {
                if (!initialized) {
                    initialized = true;
                    reject(new Error(`Db2 JDBC Bridge exited (code ${code}): ${stderrBuf.trim()}`));
                }
                for (const [, entry] of this.pending) {
                    entry.reject(new Error('Db2 bridge connection closed'));
                }
                this.pending.clear();
            });

            const rl = readline.createInterface({ input: this.proc.stdout });
            rl.on('line', (line) => {
                if (!line.trim()) return;
                let msg;
                try {
                    msg = JSON.parse(line);
                } catch (e) {
                    return;
                }

                if (!initialized) {
                    initialized = true;
                    if (msg.ready) {
                        this.readyInfo = msg;
                        resolve(msg);
                    } else {
                        reject(new Error(msg.error || 'Failed to connect to Db2 for z/OS'));
                    }
                    return;
                }

                const entry = this.pending.get(String(msg.id));
                if (entry) {
                    this.pending.delete(String(msg.id));
                    if (msg.ok) {
                        entry.resolve(msg);
                    } else {
                        const err = new Error(msg.error || 'Db2 SQL error');
                        err.sqlcode = msg.sqlcode;
                        err.sqlstate = msg.sqlstate;
                        entry.reject(err);
                    }
                }
            });
        });
    }

    _send(op, sql = '', params = []) {
        return new Promise((resolve, reject) => {
            if (!this.proc || this.proc.killed || this.closed) {
                return reject(new Error('Db2 connection is not active'));
            }
            const id = String(++this.reqSeq);
            const sqlB64 = Buffer.from(sql, 'utf8').toString('base64');
            const encodedParams = params.map((p) => {
                if (p === null || p === undefined) return 'N:';
                if (typeof p === 'number') {
                    if (Number.isInteger(p)) return 'L:' + Buffer.from(String(p), 'utf8').toString('base64');
                    return 'D:' + Buffer.from(String(p), 'utf8').toString('base64');
                }
                return 'S:' + Buffer.from(String(p), 'utf8').toString('base64');
            });

            const frame = [id, op, sqlB64, String(encodedParams.length), ...encodedParams].join('|');
            this.pending.set(id, { resolve, reject });
            this.proc.stdin.write(frame + '\n');
        });
    }

    async query(sql, params = []) {
        const res = await this._send('QUERY', sql, params);
        return res.rows || [];
    }

    async queryOne(sql, params = []) {
        const rows = await this.query(sql, params);
        return rows.length > 0 ? rows[0] : null;
    }

    async insert(sql, params = []) {
        return await this._send('INSERT', sql, params);
    }

    async exec(sql, params = []) {
        return await this._send('EXEC', sql, params);
    }

    async ddl(sql) {
        return await this._send('DDL', sql, []);
    }

    async ping() {
        return await this._send('PING');
    }

    close() {
        this.closed = true;
        if (this.proc && !this.proc.killed) {
            try {
                this.proc.stdin.write('EXIT\n');
                this.proc.stdin.end();
            } catch (_) {}
        }
    }
}

module.exports = Db2Client;
