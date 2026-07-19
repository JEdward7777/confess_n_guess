// Server lifecycle for the integration tests: each test gets its own `wrangler dev`
// (local Miniflare, no Cloudflare account) in its own persist directory.
//
// restart() kills and respawns against the same persist dir - that's what proves
// storage-backed survival, the DO equivalent of the old SIGINT/games.json test. The
// old savedGames() file introspection has no equivalent: DO storage is asserted through
// behavior over the wire, which is what the tests should have trusted anyway.
//
// Processes are tracked as a group (wrangler spawns workerd underneath); killing by
// pattern is banned here for the same reasons as ever - it has matched its own shell
// twice in this project's history.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

function freePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
    });
}

async function waitForHttp(port, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`http://localhost:${port}/`);
            if (res.status < 500) return true;
        } catch { /* not up yet */ }
        await new Promise(r => setTimeout(r, 250));
    }
    return false;
}

class TestServer {
    constructor(port, workDir, env) {
        this.port = port;
        this.workDir = workDir;
        this.env = env;
        this.url = `http://localhost:${port}`;
        this.proc = null;
        this.log = '';
    }

    /** `env` entries become `wrangler dev --var KEY:VALUE` (PORT.md D5). */
    static async start(env = {}) {
        const port = await freePort();
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cng-test-'));
        const server = new TestServer(port, workDir, env);
        await server.up();
        return server;
    }

    async up() {
        const args = [
            'wrangler', 'dev',
            '--port', String(this.port),
            '--inspector-port', '0',
            '--persist-to', this.workDir
        ];
        for (const [k, v] of Object.entries(this.env)) {
            args.push('--var', `${k}:${v}`);
        }
        this.proc = spawn('npx', args, {
            cwd: path.join(__dirname, '..'),
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: true // own process group, so stop() can take workerd down with it
        });
        this.proc.stdout.on('data', d => { this.log += d; });
        this.proc.stderr.on('data', d => { this.log += d; });
        if (!await waitForHttp(this.port)) {
            throw new Error(`wrangler dev never answered on :${this.port}\n${this.log.slice(-2000)}`);
        }
    }

    /** Kill and respawn against the same persist dir: DO storage must survive this. */
    async restart() {
        await this.stop();
        await this.up();
    }

    stop() {
        if (!this.proc) return Promise.resolve();
        const proc = this.proc;
        this.proc = null;
        return new Promise(resolve => {
            proc.on('exit', () => resolve());
            try { process.kill(-proc.pid, 'SIGTERM'); } catch { try { proc.kill('SIGTERM'); } catch { } }
            // Generous grace: a SIGKILL here can drop Miniflare's final storage flush,
            // which shows up as a game whose late writes vanished - users present,
            // phase reverted. Measured once under load; not worth measuring twice.
            setTimeout(() => {
                try { process.kill(-proc.pid, 'SIGKILL'); } catch { }
                resolve();
            }, 15000);
        });
    }

    cleanup() {
        try { fs.rmSync(this.workDir, { recursive: true, force: true }); } catch { }
    }
}

module.exports = { TestServer };
