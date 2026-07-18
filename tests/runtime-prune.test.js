// CNG-038: idle games must be cleaned out of a RUNNING server.
//
// The idle sweep used to run only at load and save, so on a server that stays up, an
// abandoned game lived (and churned - the CNG-033 residue) until the next Ctrl+C.
// The user set the policy 2026-07-18: a 24-hour clean time. One constant governs the
// load-time, save-time and runtime sweeps; a periodic timer enforces it while running.
//
// Shrunk to seconds here: 2s clean time, 1s sweep interval.

const { sleep, connect, newGameWithHost, joinPlayers, checker } = require('./helpers');
const { S } = require('./helpers');

module.exports = {
    name: 'idle games are pruned from a running server',
    env: {
        CNG_ROUND_SECONDS: '1',
        CNG_RESTART_SECONDS: '1',
        CNG_GAME_MAX_IDLE_MS: '2000',
        CNG_SWEEP_INTERVAL_MS: '1000'
    },

    async run({ url, server }) {
        const t = checker();
        const names = ['alice', 'bob'];

        const { host, code } = await newGameWithHost(url);
        const P = await joinPlayers(url, code, names);
        host.socket.emit('startGame', { code });
        await sleep(300);

        // Everyone walks away; the abandoned game churns its unanswered round.
        [host, ...Object.values(P)].forEach(c => c.close());

        // Well past clean time + sweep interval - and no restart.
        await sleep(5000);

        // The only outside-observable fact: the code must be dead on the LIVE server.
        const probe = await connect(url);
        probe.socket.emit('joinGame', code);
        await sleep(300);
        t.check('the abandoned game was pruned while the server ran',
            probe.last === S.g1NewGame && /invalid/i.test(probe.text || probe.error || ''),
            `joinGame(${code}) still answered with screen ${probe.last}`);

        // Control: a game with recent human activity survives the same sweeps.
        const { host: h2, code: code2 } = await newGameWithHost(url);
        await sleep(1500); // at least one sweep passes
        const probe2 = await connect(url);
        probe2.socket.emit('joinGame', code2);
        await sleep(300);
        t.check('a recently-active game survives the sweep',
            probe2.last === S.c1Name,
            `joinGame(${code2}) answered with screen ${probe2.last}`);

        t.check('the server logged the prune', /[Pp]run/.test(server.log),
            'no prune message in the server log');

        [probe, probe2, h2].forEach(c => c.close());
        return t.ok;
    }
};
