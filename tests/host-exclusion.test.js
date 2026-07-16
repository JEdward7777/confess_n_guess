// CNG-001: the host must not receive player-only broadcasts.
//
// This test relies on endGame sending the host h6ShowTheWinner and players
// c2WaitingScreen - i.e. on host and players landing on DIFFERENT screens. That
// difference is deliberately preserved (see the note in PROGRESS for 2026-07-15/T6):
// unify the two and this test still passes while proving nothing.

const { S, sleep, newGameWithHost, joinPlayers, checker } = require('./helpers');

module.exports = {
    name: 'host is excluded from player-only broadcasts',
    async run({ url }) {
        const t = checker();
        const names = ['alice', 'bob'];

        const { host, code } = await newGameWithHost(url);
        const P = await joinPlayers(url, code, names);

        host.screens.length = 0;
        names.forEach(n => { P[n].screens.length = 0; });

        // endGame sends the host the winner screen, then broadcasts the waiting screen to
        // "players only". Before the fix the host got both and ended on the player screen.
        host.socket.emit('endGame', { code });
        await sleep(400);

        t.screenIs('host ends on the winner screen', host.last, S.h6Winner);
        t.check('host never received the player waiting screen',
            !host.screens.includes(S.c2Waiting), `host saw [${host.screens}]`);
        t.check('players got the waiting screen',
            names.every(n => P[n].last === S.c2Waiting),
            names.map(n => `${n}:${P[n].last}`).join(' '));

        [host, ...Object.values(P)].forEach(c => c.close());
        return t.ok;
    }
};
