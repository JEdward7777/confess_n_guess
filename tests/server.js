// Server lifecycle for the integration tests.
//
// Runs the server in a scratch directory so its games.json never touches the real one,
// and always tracks the node PID directly. Do not reach for `pkill -f` here: the pattern
// matches the harness's own command line, which has bitten this project twice.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const SERVER_ENTRY = path.join(__dirname, '..', 'dist', 'index.js');

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

async function waitForPort(port, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const up = await new Promise(resolve => {
            const sock = net.connect(port, '127.0.0.1');
            sock.on('connect', () => { sock.end(); resolve(true); });
            sock.on('error', () => resolve(false));
        });
        if (up) return true;
        await new Promise(r => setTimeout(r, 100));
    }
    return false;
}

/**
 * A server instance the test controls. `workDir` persists across restart() so saved
 * games survive, which is the whole point of the restart-survival test.
 */
class TestServer {
    constructor(port, workDir) {
        this.port = port;
        this.workDir = workDir;
        this.url = `http://localhost:${port}`;
        this.proc = null;
    }

    /** `env` is merged into the server's environment - see CNG_ROUND_SECONDS. */
    static async start(env = {}) {
        if (!fs.existsSync(SERVER_ENTRY)) {
            throw new Error(`${SERVER_ENTRY} missing - run "npm run build_server" first`);
        }
        const port = await freePort();
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cng-test-'));
        const server = new TestServer(port, workDir);
        server.env = env;
        await server.up();
        return server;
    }

    async up() {
        this.proc = spawn('node', [SERVER_ENTRY, String(this.port)], {
            cwd: this.workDir,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, ...(this.env || {}) }
        });
        this.log = '';
        this.proc.stdout.on('data', d => { this.log += d; });
        this.proc.stderr.on('data', d => { this.log += d; });
        if (!await waitForPort(this.port)) {
            throw new Error(`server never bound :${this.port}\n${this.log}`);
        }
    }

    /**
     * Stop so the save handler runs, then bring it back up. Defaults to SIGTERM - the
     * signal systemd, docker stop and plain `kill` send - because the save guarantee must
     * not depend on which signal stopped the server (CNG-036). SIGINT stays covered by
     * the idle-sweep test's restart.
     */
    async restart(signal = 'SIGTERM') {
        await this.stop(signal);
        await this.up();
    }

    savedGames() {
        const f = path.join(this.workDir, 'games.json');
        return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
    }

    stop(signal = 'SIGKILL') {
        if (!this.proc) return Promise.resolve();
        const proc = this.proc;
        this.proc = null;
        return new Promise(resolve => {
            proc.on('exit', () => resolve());
            proc.kill(signal);
            setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(); }, 3000);
        });
    }

    cleanup() {
        try { fs.rmSync(this.workDir, { recursive: true, force: true }); } catch {}
    }
}

module.exports = { TestServer };
