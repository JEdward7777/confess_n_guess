// The server owns the clock, so a round must run out of time on its own - even with no
// host connected at all.
//
// Nothing else covers this. fullgame submits everything promptly and finishes in seconds
// against a 60s clock, so no timer ever fires in it; the timer test emits timerExpired by
// hand rather than waiting. Both would stay green if the clock never started, which is
// exactly the regression this change could cause.

const { S, screenName, sleep, newGameWithHost, joinPlayers, refresh, checker } = require('./helpers');

module.exports = {
    name: 'rounds time out on their own, even with no host',
    // Short clock so this takes seconds rather than a minute. The game reads these.
    env: { CNG_ROUND_SECONDS: '3', CNG_RESTART_SECONDS: '3' },

    async run({ url, server }) {
        const t = checker();
        const names = ['alice', 'bob', 'carol'];

        const { host, code } = await newGameWithHost(url);
        const P = await joinPlayers(url, code, names);
        host.socket.emit('startGame', { code });
        await sleep(400);
        t.check('players are answering', names.every(n => P[n].last === S.c3Truth));

        // --- The host closes their tab. Their browser was the only clock before this
        // change, so the game would sit here forever.
        host.close();
        await sleep(200);

        // Everyone answers, so there is something to move on to.
        for (const n of names) {
            P[n].socket.emit('sendQuestionAnswer', { name: n, code, answer: `${n}-truth`, question: P[n].question });
            await sleep(120);
        }
        await sleep(400);

        const target = names.find(n => P[n].last === S.c2Waiting);
        t.check('the lie round started with no host connected', !!target,
            names.map(n => `${n}:${screenName(P[n].last)}`).join(' '));

        // --- Nobody lies. With no host, only the server's clock can rescue this.
        await sleep(4500);
        t.check('the lie round timed out on its own',
            names.every(n => P[n].last !== S.c5Lie),
            names.map(n => `${n}:${screenName(P[n].last)}`).join(' '));
        // Nobody lied for the first target, so the round restarts.
        t.check('it restarted the round', names.every(n => P[n].last === S.c3Truth),
            names.map(n => `${n}:${screenName(P[n].last)}`).join(' '));

        // --- The timer must survive a restart too: a game restored mid-round with no
        // clock running would resume and then never advance.
        for (const n of names) {
            P[n].socket.emit('sendQuestionAnswer', { name: n, code, answer: `${n}-t2`, question: P[n].question });
            await sleep(120);
        }
        await sleep(400);
        Object.values(P).forEach(c => c.close());

        await server.restart();
        // No "resumed timer" log to assert any more: alarms are durable, surviving the
        // restart natively - the behavioral check below is the whole proof.

        // Reconnect one player. With a 3s round clock, a slow wrangler restart can
        // legitimately outlast the round: the restored alarm fires during startup, finds
        // no lies, and restarts the round - which is CORRECT behavior and itself proof
        // the restored clock ran. So both states are valid here; asserting only c5Lie
        // made this test race its own server's startup time (flaked 2026-07-19).
        const back = await refresh(url, code, names[1]);
        t.check('reconnected into a live restored game (lie round, or already restarted)',
            back.last === S.c5Lie || back.last === S.c3Truth,
            `on ${screenName(back.last)}`);
        const before = back.last;
        await sleep(4500);
        t.check('the restored clock keeps the game moving',
            back.last !== before || back.screens.length > 1,
            `still on ${screenName(back.last)} with no further transitions`);

        back.close();
        return t.ok;
    }
};
