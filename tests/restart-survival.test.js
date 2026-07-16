// CNG-002: a server restart mid-round must not lose the round.
//
// This guards a workflow, not just a bug: the server gets restarted to pick up a code
// change *during a live game*, and that must not force replaying the round from the
// start. If this test ever goes red, hot-patching a live game is broken.

const { S, sleep, newGameWithHost, joinPlayers, everyoneAnswers, refresh, checker } = require('./helpers');

module.exports = {
    name: 'a round survives a server restart',
    async run({ url, server }) {
        const t = checker();
        const names = ['alice', 'bob', 'carol'];

        const { host, code } = await newGameWithHost(url);
        const P = await joinPlayers(url, code, names);
        host.socket.emit('startGame', { code });
        await sleep(400);
        await everyoneAnswers(P, code);

        const target = names.find(n => P[n].last === S.c2Waiting);
        const liars = names.filter(n => n !== target);
        // One player lies, so there is real mid-round content to lose.
        const liar = liars[0];
        const pending = liars[1];
        P[liar].socket.emit('submitLie', { name: liar, code, lie: `${liar}-lie`, targetPlayer: target, question: 'q' });
        await sleep(300);

        [host, ...Object.values(P)].forEach(c => c.close());

        // SIGINT so the exit handler writes games.json, then bring it back.
        await server.restart();

        const saved = server.savedGames()[code];
        t.check('the game was saved at all', !!saved);
        if (saved) {
            t.check('saved mid-round phase', saved.currentPhase === 'submittingLies', saved.currentPhase);
            t.check('saved every answer',
                names.every(n => saved.userAnswers && saved.userAnswers[n]),
                Object.keys(saved.userAnswers || {}).join(','));
            t.check('saved the lie that was already in',
                !!(saved.lies && saved.lies[target] && saved.lies[target].some(l => l.username === liar)),
                JSON.stringify(saved.lies || {}));
            t.check('saved the lie target', saved.currentLieTargetPlayer === target, saved.currentLieTargetPlayer);
        }

        // Everyone reconnects, as they would after the server came back.
        t.screenIs('host resumes the lie round', (await refresh(url, code, '<host>')).last, S.h2Timer);

        const hostAgain = await refresh(url, code, '<host>');
        t.check('all players survived the restart',
            hostAgain.users && names.every(n => hostAgain.users[n]),
            Object.keys(hostAgain.users || {}).join(','));

        t.screenIs(`${liar} already lied -> waits`, (await refresh(url, code, liar)).last, S.c2Waiting);
        const pendingClient = await refresh(url, code, pending);
        t.screenIs(`${pending} still owes a lie -> asked again`, pendingClient.last, S.c5Lie);
        t.screenIs(`${target} is the target -> waits`, (await refresh(url, code, target)).last, S.c2Waiting);

        // And the round must still be finishable.
        pendingClient.socket.emit('submitLie', { name: pending, code, lie: `${pending}-lie`, targetPlayer: target, question: 'q' });
        await sleep(400);
        t.screenIs('the restored round completes into voting', pendingClient.last, S.c4Vote);

        return t.ok;
    }
};
