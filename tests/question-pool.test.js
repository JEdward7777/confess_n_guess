// CNG-032: when the question pool runs dry, players must still get questions.
//
// The pool is finite and restarts drain it: pre-fix, a drained pool meant
// beginAnsweringRound silently sent a player NOTHING (they sat on their old screen while
// the host counted down), and an all-empty round then restarted forever.
//
// CNG_QUESTION_COUNT trims the pool to 4 so exhaustion takes one restart, not ten.
// Round 1 draws 3 of 4; the restarted round needs 3 more and finds 1 - pre-fix, two
// players are silently skipped. Post-fix the pool recycles: repeats beat silence.

const { S, screenName, sleep, newGameWithHost, joinPlayers, checker } = require('./helpers');

module.exports = {
    name: 'the question pool recycles instead of going silent',
    env: {
        CNG_QUESTION_COUNT: '4',
        CNG_ROUND_SECONDS: '2',
        CNG_RESTART_SECONDS: '2'
    },

    async run({ url }) {
        const t = checker();
        const names = ['alice', 'bob', 'carol'];

        const { host, code } = await newGameWithHost(url);
        const P = await joinPlayers(url, code, names);
        host.socket.emit('startGame', { code });
        await sleep(400);

        t.check('round 1: every player got a question (3 of 4 drawn)',
            names.every(n => P[n].last === S.c3Truth && P[n].question),
            names.map(n => `${n}:${screenName(P[n].last)}`).join(' '));

        // Count fresh c3 deliveries from here on. Comparing question TEXT would be both
        // flaky (a recycled pool can legitimately re-deal the same question) and vacuous
        // (a player who received nothing still shows their old question).
        names.forEach(n => { P[n].screens.length = 0; });

        // Nobody answers; the round times out and restarts. The restarted round needs 3
        // questions and the pool has 1 left.
        await sleep(3500);

        const gotFresh = names.filter(n => P[n].screens.includes(S.c3Truth));
        t.check('after the restart, every player received a fresh question emit',
            gotFresh.length === names.length,
            `only [${gotFresh}] got one; ` + names.map(n => `${n} emits:[${P[n].screens}]`).join(' '));

        // And the recycled round must be playable through to the lie phase.
        for (const n of names) {
            P[n].socket.emit('sendQuestionAnswer', { name: n, code, answer: `${n}-truth`, question: P[n].question });
            await sleep(120);
        }
        await sleep(400);
        const waiting = names.filter(n => P[n].last === S.c2Waiting);
        const lying = names.filter(n => P[n].last === S.c5Lie);
        t.check('the recycled round plays on into the lie phase',
            waiting.length === 1 && lying.length === names.length - 1,
            names.map(n => `${n}:${screenName(P[n].last)}`).join(' '));

        [host, ...Object.values(P)].forEach(c => c.close());
        return t.ok;
    }
};
