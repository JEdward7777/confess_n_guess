#!/usr/bin/env node
// Integration test runner. Each test gets a freshly started server in its own scratch
// directory, so tests can't leak game state into each other or into the real games.json.
//
//   npm test                 run everything
//   npm test -- reconnect    run tests whose file or name matches "reconnect"

const fs = require('fs');
const path = require('path');
const { TestServer } = require('./server');

const TESTS = [
    'join-url.test.js',
    'host-exclusion.test.js',
    'question-stability.test.js',
    'reconnect.test.js',
    'timer.test.js',
    'multi-device.test.js',
    'timer-fires.test.js',
    'unattended.test.js',
    'fullgame.test.js',
    'restart-survival.test.js'
];

async function main() {
    const filter = process.argv[2];

    if (!fs.existsSync(path.join(__dirname, '..', 'dist', 'index.js'))) {
        console.error('dist/index.js is missing. Run "npm run build_server" first.');
        process.exit(1);
    }

    const files = TESTS.filter(f => !filter || f.includes(filter));
    if (files.length === 0) {
        console.error(`no tests match "${filter}"`);
        process.exit(1);
    }

    const results = [];
    for (const file of files) {
        const test = require(path.join(__dirname, file));
        const label = test.name || file;
        console.log(`\n\x1b[1m${label}\x1b[0m  (${file})`);

        let server;
        try {
            server = await TestServer.start(test.env || {});
            const ok = await test.run({ url: server.url, server });
            results.push({ label, ok });
            console.log(ok ? '  \x1b[32mPASS\x1b[0m' : '  \x1b[31mFAIL\x1b[0m');
        } catch (err) {
            console.log(`  \x1b[31mERROR\x1b[0m ${err && err.stack ? err.stack : err}`);
            if (server && server.log) console.log(server.log.split('\n').slice(-15).map(l => '    | ' + l).join('\n'));
            results.push({ label, ok: false });
        } finally {
            if (server) { await server.stop(); server.cleanup(); }
        }
    }

    const failed = results.filter(r => !r.ok);
    console.log('\n' + '-'.repeat(60));
    results.forEach(r => console.log(`  ${r.ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${r.label}`));
    console.log(`\n  ${results.length - failed.length}/${results.length} passed`);
    process.exit(failed.length ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
