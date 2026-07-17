// CNG-040: the ballot is shuffled ONCE per round. A voter who refreshes mid-vote must
// get the options back in the order they were already reading - not a fresh shuffle that
// reorders the list under them and stops matching their neighbour's screen. The order
// must survive a server restart too (hot-patching mid-vote is a supported workflow).
//
// CNG-035 is the structural half: resyncs used to hand-roll and re-shuffle their own
// ballot instead of reusing the round's. Four players -> four options, so a reshuffle
// coincidentally matching is 1/24 per check; three checks put flake odds around 1e-4.

const { S, screenName, sleep, newGameWithHost, joinPlayers, refresh, everyoneAnswers, checker } = require('./helpers');

const order = c => (c.answers || []).map(a => a.username).join(',');

module.exports = {
    name: 'the ballot keeps its order across refresh and restart',
    async run({ url, server }) {
        const t = checker();
        const names = ['alice', 'bob', 'carol', 'dana'];

        const { host, code } = await newGameWithHost(url);
        const P = await joinPlayers(url, code, names);
        host.socket.emit('startGame', { code });
        await sleep(400);
        await everyoneAnswers(P, code);

        const target = names.find(n => P[n].last === S.c2Waiting);
        const liars = names.filter(n => n !== target);
        for (const n of liars) {
            P[n].socket.emit('submitLie', { name: n, code, lie: `${n}-lie`, targetPlayer: target, question: 'q' });
            await sleep(150);
        }
        await sleep(400);

        const original = order(P[liars[0]]);
        t.check('voting started with a ballot', P[liars[0]].last === S.c4Vote && original.length > 0,
            `${screenName(P[liars[0]].last)}, ballot: [${original}]`);
        t.check('all voters see the same order',
            liars.every(n => order(P[n]) === original),
            liars.map(n => `${n}:[${order(P[n])}]`).join(' '));

        // The voter refreshes, twice. Each resync must hand back the SAME order.
        for (let i = 1; i <= 2; i++) {
            const re = await refresh(url, code, liars[0]);
            t.check(`refresh #${i} keeps the ballot order`, order(re) === original,
                `was [${original}], got [${order(re)}]`);
            re.close();
        }

        // Hot-patch restart mid-vote: the order must come back from the save.
        [host, ...Object.values(P)].forEach(c => c.close());
        await server.restart();

        const back = await refresh(url, code, liars[1]);
        t.screenIs('reconnected voter is back on the ballot', back.last, S.c4Vote);
        t.check('the order survived the restart', order(back) === original,
            `was [${original}], got [${order(back)}]`);

        // And the round still finishes.
        for (const n of liars) {
            const c = n === liars[1] ? back : await refresh(url, code, n);
            c.socket.emit('voteOnLie', { name: n, code, selectedUsername: target, targetPlayer: target });
            await sleep(150);
        }
        await sleep(400);
        t.screenIs('the round completes into the reveal', back.last, S.h3Results);

        back.close();
        return t.ok;
    }
};
