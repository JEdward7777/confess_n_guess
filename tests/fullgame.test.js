// A complete game, host + 3 players, every round, through to the winner.
// Exercises every phase transition. Would have caught CNG-001, -004, -013 and -024.

const { S, screenName, sleep, newGameWithHost, joinPlayers, everyoneAnswers, checker } = require('./helpers');

module.exports = {
    name: 'full game, start to winner',
    async run({ url }) {
        const t = checker();
        const names = ['alice', 'bob', 'carol'];

        const { host, code } = await newGameWithHost(url);
        const P = await joinPlayers(url, code, names);
        t.screenIs('host starts on the lobby', host.last, S.h1Collecting);

        host.socket.emit('startGame', { code });
        await sleep(400);
        t.screenIs('host moves to the timer', host.last, S.h2Timer);
        t.check('every player got a question',
            names.every(n => P[n].last === S.c3Truth && P[n].question),
            names.map(n => `${n}:${screenName(P[n].last)}`).join(' '));
        t.check('the questions are all different',
            new Set(names.map(n => P[n].question)).size === names.length);

        await everyoneAnswers(P, code);

        const targeted = [];
        for (let round = 1; round <= names.length; round++) {
            const waiting = names.filter(n => P[n].last === S.c2Waiting);
            const lying = names.filter(n => P[n].last === S.c5Lie);
            if (!t.check(`round ${round}: one target waits, the rest write lies`,
                waiting.length === 1 && lying.length === names.length - 1,
                `waiting=[${waiting}] lying=[${lying}]`)) break;

            const target = waiting[0];
            targeted.push(target);
            t.check(`round ${round}: the liars know the target is ${target}`,
                lying.every(n => P[n].targetPlayer === target),
                lying.map(n => `${n}->${P[n].targetPlayer}`).join(' '));

            for (const n of lying) {
                P[n].socket.emit('submitLie', { name: n, code, lie: `${n}-lie-r${round}`, targetPlayer: target, question: 'q' });
                await sleep(120);
            }
            await sleep(300);
            t.check(`round ${round}: liars vote, ${target} still waits`,
                lying.every(n => P[n].last === S.c4Vote) && P[target].last === S.c2Waiting,
                names.map(n => `${n}:${screenName(P[n].last)}`).join(' '));
            t.check(`round ${round}: ballot holds 1 truth + ${names.length - 1} lies`,
                (P[lying[0]].answers || []).length === names.length,
                `${(P[lying[0]].answers || []).length} options`);

            // Everyone guesses correctly, so the scoring below is predictable.
            for (const n of lying) {
                P[n].socket.emit('voteOnLie', { name: n, code, selectedUsername: target, targetPlayer: target });
                await sleep(120);
            }
            await sleep(350);
            t.check(`round ${round}: reveal reaches host and players`,
                host.last === S.h3Results && names.every(n => P[n].last === S.h3Results),
                `host:${screenName(host.last)} ` + names.map(n => `${n}:${screenName(P[n].last)}`).join(' '));

            host.socket.emit('continueFromResults', { code });
            await sleep(250);
            t.screenIs(`round ${round}: points screen`, host.last, S.h5Points);
            host.socket.emit('continueFromScores', { code });
            await sleep(350);
        }

        t.check('every player got exactly one round',
            targeted.length === names.length && new Set(targeted).size === names.length,
            `targeted: [${targeted}]`);
        t.screenIs('game ends on the winner screen', host.last, S.h6Winner);
        t.check('players see the winner too', names.every(n => P[n].last === S.h6Winner),
            names.map(n => `${n}:${screenName(P[n].last)}`).join(' '));

        // Every truth guessed by everyone: 1000 per correct guesser as the target
        // (x2), plus 1000 per correct guess as a voter (x2 rounds) = 4000 each.
        const lb = host.leaderboard || [];
        t.check('everyone scored 4000',
            lb.length === names.length && lb.every(e => e.points === 4000),
            lb.map(e => `${e.name}=${e.points}`).join(' '));

        [host, ...Object.values(P)].forEach(c => c.close());
        return t.ok;
    }
};
