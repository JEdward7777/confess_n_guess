// CNG-003: two host tabs = two browser countdowns = two timerExpired events. The second
// must not be applied to the phase the first just created.
// CNG-025: a restarted round must actually start over, not resume mid-list.
// CNG-004: the skip path must not invert target and non-targets.

const { S, screenName, sleep, connect, newGameWithHost, joinPlayers, everyoneAnswers, checker } = require('./helpers');

module.exports = {
    name: 'timers do not cascade or invert rounds',
    async run({ url }) {
        const t = checker();
        const names = ['alice', 'bob', 'carol'];

        // --- Two host tabs, which "hostSocketIds is a list" now permits.
        const { host: hostA, code } = await newGameWithHost(url);
        const hostB = await connect(url);
        hostB.socket.emit('identify', { role: 'host', code });
        await sleep(250);

        const P = await joinPlayers(url, code, names);
        hostA.socket.emit('startGame', { code });
        await sleep(400);
        await everyoneAnswers(P, code);

        t.check('both host tabs hold the same phase token',
            hostA.phaseToken === hostB.phaseToken, `${hostA.phaseToken} vs ${hostB.phaseToken}`);

        // Both countdowns hit zero at essentially the same moment.
        hostA.socket.emit('timerExpired', { code, phaseToken: hostA.phaseToken });
        hostB.socket.emit('timerExpired', { code, phaseToken: hostB.phaseToken });
        await sleep(700);

        const screens = names.map(n => P[n].last);
        t.check('two simultaneous timers leave every player in one state',
            screens.every(s => s === screens[0]),
            names.map(n => `${n}:${screenName(P[n].last)}`).join(' '));
        // Nobody had lied, and the first target was up, so one expiry restarts the round.
        // The danger was the SECOND event landing on top and cascading further.
        t.screenIs('the round restarted exactly once', screens[0], S.c3Truth);

        // CNG-025: a restart must come back to the first player, not resume mid-list.
        await everyoneAnswers(P, code, 'truth2');
        const waiting = names.filter(n => P[n].last === S.c2Waiting);
        const lying = names.filter(n => P[n].last === S.c5Lie);
        t.check('after restart: one target waits, the rest write lies',
            waiting.length === 1 && lying.length === names.length - 1,
            `waiting=[${waiting}] lying=[${lying}]`);
        t.check('after restart: the round starts over at the first player',
            waiting[0] === names[0], `resumed at ${waiting[0]}, wanted ${names[0]}`);

        // --- Stale and untokened events must both be rejected.
        const before = P[lying[0]].last;
        hostA.socket.emit('timerExpired', { code, phaseToken: 1 });
        await sleep(400);
        t.check('a stale token is ignored', P[lying[0]].last === before,
            `${screenName(before)} -> ${screenName(P[lying[0]].last)}`);

        // No token at all means a stale client bundle. Allowing it would leave the guard
        // bypassable by exactly the tab it exists to stop.
        hostA.socket.emit('timerExpired', { code });
        await sleep(400);
        t.check('an untokened event is ignored', P[lying[0]].last === before,
            `${screenName(before)} -> ${screenName(P[lying[0]].last)}`);

        // --- CNG-004: skipping to the next target must not invert the roles.
        const target = waiting[0];
        for (const n of lying) {
            P[n].socket.emit('submitLie', { name: n, code, lie: `${n}-lie`, targetPlayer: target, question: 'q' });
            await sleep(120);
        }
        await sleep(250);
        for (const n of lying) {
            P[n].socket.emit('voteOnLie', { name: n, code, selectedUsername: target, targetPlayer: target });
            await sleep(120);
        }
        await sleep(250);
        hostA.socket.emit('continueFromResults', { code });
        await sleep(200);
        hostA.socket.emit('continueFromScores', { code });
        await sleep(350);

        // Now on a NON-first target with no lies in. Let the timer expire -> skip path.
        const second = names.find(n => P[n].last === S.c2Waiting);
        hostA.socket.emit('timerExpired', { code, phaseToken: hostA.phaseToken });
        await sleep(500);

        const third = names.find(n => n !== target && n !== second);
        t.screenIs(`skip: new target ${third} waits`, P[third].last, S.c2Waiting);
        t.check('skip: everyone else writes a lie',
            names.filter(n => n !== third).every(n => P[n].last === S.c5Lie),
            names.map(n => `${n}:${screenName(P[n].last)}`).join(' '));
        // CNG-014: the emit must carry the new target, not leave the client merging an old one.
        t.check('skip: the c5 emit carries the new target',
            P[target].targetPlayer === third, `${P[target].targetPlayer}, wanted ${third}`);

        [hostA, hostB, ...Object.values(P)].forEach(c => c.close());
        return t.ok;
    }
};
