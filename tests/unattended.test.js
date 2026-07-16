// CNG-028: an abandoned game must keep moving.
//
// CNG-027 gave the three timed phases a server clock, and `timer-fires` proves a round
// times out with no host. But the reveal and points screens are untimed server-side: the
// only things that advance them are the auto-continue timers inside H3 and H5, which live
// in the host's browser. Close that tab at the reveal and the game stops forever.
//
// So this walks a game to the reveal with NO host connected and asserts it carries on by
// itself. `timer-fires` cannot catch this: it only ever abandons the game during a timed
// phase, which is exactly the part that already works.

const { S, screenName, sleep, newGameWithHost, joinPlayers, checker } = require('./helpers');

/**
 * Wait until `predicate` holds, or give up. Waiting for a state to ARRIVE, never for one
 * to be left behind: "have they left screen X" is trivially true when they never got to X,
 * which is how the first draft of this test passed two assertions vacuously.
 */
async function waitUntil(predicate, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return true;
        await sleep(200);
    }
    return false;
}

module.exports = {
    name: 'an abandoned game keeps moving',
    // Short clocks so this runs in seconds. The backstop is deliberately longer than the
    // round clock, mirroring production where it must outlast H3's paced reveal.
    env: { CNG_ROUND_SECONDS: '2', CNG_RESTART_SECONDS: '2', CNG_BACKSTOP_SECONDS: '4' },

    async run({ url }) {
        const t = checker();
        const names = ['alice', 'bob', 'carol'];

        const { host, code } = await newGameWithHost(url);
        const P = await joinPlayers(url, code, names);
        host.socket.emit('startGame', { code });
        await sleep(300);

        for (const n of names) {
            P[n].socket.emit('sendQuestionAnswer', { name: n, code, answer: `${n}-truth`, question: P[n].question });
            await sleep(100);
        }
        await sleep(300);

        const target = names.find(n => P[n].last === S.c2Waiting);
        const liars = names.filter(n => n !== target);
        for (const n of liars) {
            P[n].socket.emit('submitLie', { name: n, code, lie: `${n}-lie`, targetPlayer: target, question: 'q' });
            await sleep(100);
        }
        await sleep(300);

        // The host walks away. Everything from here has to happen without them.
        host.close();
        await sleep(200);

        for (const n of liars) {
            P[n].socket.emit('voteOnLie', { name: n, code, selectedUsername: target, targetPlayer: target });
            await sleep(100);
        }
        await sleep(400);
        t.check('players reached the reveal with no host connected',
            names.every(n => P[n].last === S.h3Results),
            names.map(n => `${n}:${screenName(P[n].last)}`).join(' '));

        // --- The freeze. Only the host's H3 auto-continue advances this today.
        const reachedPoints = await waitUntil(() => names.every(n => P[n].last === S.h5Points), 9000);
        t.check('the reveal advances to the points screen on its own', reachedPoints,
            'stuck on ' + names.map(n => `${n}:${screenName(P[n].last)}`).join(' '));

        // --- And again from the points screen, which only H5's auto-continue drives.
        const reachedNextRound = reachedPoints &&
            await waitUntil(() => names.some(n => P[n].last === S.c5Lie), 9000);
        t.check('the points screen advances to the next lie round on its own', reachedNextRound,
            'stuck on ' + names.map(n => `${n}:${screenName(P[n].last)}`).join(' '));

        if (reachedNextRound) {
            // Next player's lie round: one target waits, the rest are asked for a lie.
            const waiting = names.filter(n => P[n].last === S.c2Waiting);
            const lying = names.filter(n => P[n].last === S.c5Lie);
            t.check('the next lie round is properly set up',
                waiting.length === 1 && lying.length === names.length - 1,
                names.map(n => `${n}:${screenName(P[n].last)}`).join(' '));
            t.check('the next round targets someone new', waiting[0] !== target,
                `still targeting ${target}`);
        }

        Object.values(P).forEach(c => c.close());
        return t.ok;
    }
};
