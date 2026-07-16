// CNG-005: identifying (i.e. refreshing a page) must resync you to where the game
// actually is, in every phase. Also covers CNG-007 (host refresh) and CNG-024 (the lie
// target must never be handed a ballot for their own round).

const { S, sleep, newGameWithHost, joinPlayers, refresh, checker } = require('./helpers');

module.exports = {
    name: 'reconnect resyncs to the right screen',
    async run({ url }) {
        const t = checker();
        const names = ['alice', 'bob', 'carol'];

        const { host, code } = await newGameWithHost(url);
        const P = await joinPlayers(url, code, names);

        // --- CollectingUsers
        t.screenIs('lobby: host refresh -> lobby', (await refresh(url, code, '<host>')).last, S.h1Collecting);
        t.screenIs('lobby: player refresh -> waiting', (await refresh(url, code, 'alice')).last, S.c2Waiting);

        // --- AnsweringQuestions
        host.socket.emit('startGame', { code });
        await sleep(400);
        t.screenIs('answering: host refresh -> timer', (await refresh(url, code, '<host>')).last, S.h2Timer);

        const aliceRe = await refresh(url, code, 'alice');
        t.screenIs('answering: unanswered player refresh -> question', aliceRe.last, S.c3Truth);
        // CNG-006: resync must hand back the SAME question, not draw a new one.
        t.check('answering: refresh returns the same question',
            aliceRe.question === P.alice.question,
            `${aliceRe.question} vs ${P.alice.question}`);

        P.alice.socket.emit('sendQuestionAnswer', { name: 'alice', code, answer: 'a1', question: aliceRe.question });
        await sleep(200);
        t.screenIs('answering: answered player refresh -> waiting', (await refresh(url, code, 'alice')).last, S.c2Waiting);

        for (const n of ['bob', 'carol']) {
            P[n].socket.emit('sendQuestionAnswer', { name: n, code, answer: `${n}-a`, question: P[n].question });
            await sleep(150);
        }
        await sleep(350);

        // --- SubmittingLies
        const target = names.find(n => P[n].last === S.c2Waiting);
        const other = names.find(n => n !== target);
        t.screenIs('lies: host refresh -> timer', (await refresh(url, code, '<host>')).last, S.h2Timer);
        t.screenIs(`lies: non-target refresh -> write a lie`, (await refresh(url, code, other)).last, S.c5Lie);
        t.screenIs(`lies: target refresh -> waits`, (await refresh(url, code, target)).last, S.c2Waiting);

        for (const n of names.filter(n => n !== target)) {
            P[n].socket.emit('submitLie', { name: n, code, lie: `${n}-lie`, targetPlayer: target, question: 'q' });
            await sleep(150);
        }
        await sleep(350);

        // --- VotingOnLies
        t.screenIs('voting: host refresh -> timer', (await refresh(url, code, '<host>')).last, S.h2Timer);
        t.screenIs('voting: non-target refresh -> ballot', (await refresh(url, code, other)).last, S.c4Vote);
        // CNG-024: the target knows their own truth and must never get a ballot.
        t.screenIs('voting: target refresh -> waits, never a ballot', (await refresh(url, code, target)).last, S.c2Waiting);

        // --- unknown game / unknown player
        t.screenIs('identify against a dead code -> start over', (await refresh(url, 'ZZZZZ', 'alice')).last, S.g1NewGame);
        t.screenIs('identify as a name the game never had -> pick a name', (await refresh(url, code, 'nobody')).last, S.c1Name);

        [host, ...Object.values(P)].forEach(c => c.close());
        return t.ok;
    }
};
