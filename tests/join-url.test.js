// The join QR code.
//
// The host's own address bar is normally right, and behind a reverse proxy it is the ONLY
// right answer: the server's LAN address is an internal detail no phone can reach. The one
// case it can't answer is loopback — "localhost" means "this machine" to whoever scans it,
// so the phone tries to reach itself.
//
// So the rule is narrow on purpose: substitute the server's address only for a loopback
// hostname, and only the hostname.

const path = require('path');
const { buildJoinUrl, isLoopbackHostname } = require(path.join(__dirname, '..', 'dist', 'IncludeStuff'));
const { connect, checker } = require('./helpers');

module.exports = {
    name: 'join URL / QR code',
    async run({ url }) {
        const t = checker();
        const LAN = '192.168.1.50';

        // --- loopback: the one case that needs rescuing
        t.check('localhost is rescued with the LAN address',
            buildJoinUrl('http://localhost:3001/', LAN, 'ABCDE') === `http://${LAN}:3001/?code=ABCDE`,
            buildJoinUrl('http://localhost:3001/', LAN, 'ABCDE'));
        t.check('127.0.0.1 is rescued too',
            buildJoinUrl('http://127.0.0.1:3001/', LAN, 'ABCDE') === `http://${LAN}:3001/?code=ABCDE`,
            buildJoinUrl('http://127.0.0.1:3001/', LAN, 'ABCDE'));

        // --- the reverse-proxy case: the address bar is authoritative, hands off
        t.check('a real hostname is left alone (reverse proxy)',
            buildJoinUrl('https://games.example.com/', LAN, 'ABCDE') === 'https://games.example.com/?code=ABCDE',
            buildJoinUrl('https://games.example.com/', LAN, 'ABCDE'));
        t.check('https is preserved, not downgraded',
            buildJoinUrl('https://games.example.com/', LAN, 'ABCDE').startsWith('https://'));
        t.check('a proxy on a subpath keeps its path',
            buildJoinUrl('https://example.com/games/party/', LAN, 'ABCDE') === 'https://example.com/games/party/?code=ABCDE',
            buildJoinUrl('https://example.com/games/party/', LAN, 'ABCDE'));
        t.check('a LAN address in the bar is already fine and is left alone',
            buildJoinUrl('http://192.168.1.99:3001/', LAN, 'ABCDE') === 'http://192.168.1.99:3001/?code=ABCDE',
            buildJoinUrl('http://192.168.1.99:3001/', LAN, 'ABCDE'));

        // --- only the hostname is replaced. A proxy on the same box (localhost:8080) must
        // keep its port so the QR goes THROUGH the proxy, not around it to the app's port.
        t.check('a same-box proxy keeps its port',
            buildJoinUrl('http://localhost:8080/', LAN, 'ABCDE') === `http://${LAN}:8080/?code=ABCDE`,
            buildJoinUrl('http://localhost:8080/', LAN, 'ABCDE'));

        // --- tidiness: the host's own query/hash must not leak into the join URL
        t.check("the host's own ?code/&name are not carried over",
            buildJoinUrl('http://localhost:3001/?code=OLD&name=%3Chost%3E', LAN, 'NEWCD') === `http://${LAN}:3001/?code=NEWCD`,
            buildJoinUrl('http://localhost:3001/?code=OLD&name=%3Chost%3E', LAN, 'NEWCD'));
        t.check('a hash is dropped',
            buildJoinUrl('http://localhost:3001/#new', LAN, 'ABCDE') === `http://${LAN}:3001/?code=ABCDE`,
            buildJoinUrl('http://localhost:3001/#new', LAN, 'ABCDE'));

        // --- no LAN address to offer: leave it alone rather than inventing something
        t.check('with no LAN address, localhost is left as-is',
            buildJoinUrl('http://localhost:3001/', null, 'ABCDE') === 'http://localhost:3001/?code=ABCDE',
            buildJoinUrl('http://localhost:3001/', null, 'ABCDE'));

        t.check('isLoopbackHostname knows the loopback names',
            ['localhost', 'LOCALHOST', '127.0.0.1', '::1'].every(isLoopbackHostname) &&
            !['192.168.1.5', 'example.com', '10.0.0.1'].some(isLoopbackHostname));

        // --- and the server actually answers. On Workers the answer is always
        // { lanHost: null } (PORT.md D7: no os module, no LAN) - the client then keeps
        // window.location, which is correct everywhere but a loopback dev box.
        const { host: c, code: qcode } = await (require('./helpers').newGameWithHost)(url);
        const answered = await new Promise(resolve => {
            const timer = setTimeout(() => resolve(null), 2000);
            c.socket.on('joinHost', (payload) => { clearTimeout(timer); resolve(payload); });
            c.socket.emit('requestJoinHost', { code: qcode });
        });
        t.check('the server answers requestJoinHost', answered !== null && 'lanHost' in answered,
            JSON.stringify(answered));
        if (answered && answered.lanHost !== null) {
            t.check('it offers a real, non-loopback IPv4',
                /^\d+\.\d+\.\d+\.\d+$/.test(answered.lanHost) && !isLoopbackHostname(answered.lanHost),
                answered.lanHost);
            t.check('and it round-trips into a usable join URL',
                buildJoinUrl('http://localhost:3001/', answered.lanHost, 'ABCDE') === `http://${answered.lanHost}:3001/?code=ABCDE`,
                buildJoinUrl('http://localhost:3001/', answered.lanHost, 'ABCDE'));
        } else {
            // A machine with no network is a legitimate answer, not a failure.
            console.log('  note: no LAN address available on this machine; substitution untested');
        }

        c.close();
        return t.ok;
    }
};
