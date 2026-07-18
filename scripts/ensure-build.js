// Runs before `npm start` (npm's prestart hook). Builds only what is missing.
//
// wrangler serves confess_n_guess_client/dist as static assets, and that directory is
// gitignored - so a fresh clone plus `npm start` would have nothing to serve (CNG-030).
// This makes the missing build a self-healing condition instead of a silent one.
//
// Deliberately does NOT rebuild when the output merely exists: `npm start` stays instant
// for the normal workflow, and deciding "is it stale?" is the developer's call — the
// hot-patch loop is edit -> npm run build_server -> restart, and second-guessing that here
// would just slow it down. If the client's deps aren't installed yet (fresh clone), that
// is fixed too, since the build cannot succeed without them.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const run = cmd => execSync(cmd, { cwd: root, stdio: 'inherit' });

const clientDeps = path.join(root, 'confess_n_guess_client', 'node_modules');
const clientBuild = path.join(root, 'confess_n_guess_client', 'dist', 'index.html');

if (!fs.existsSync(clientBuild)) {
    console.log('[ensure-build] client build missing - building it (first run takes a minute)');
    if (!fs.existsSync(clientDeps)) {
        console.log('[ensure-build] client dependencies missing - installing');
        run('npm ci --prefix confess_n_guess_client || npm install --prefix confess_n_guess_client');
    }
    run('npm run build_client');
}

