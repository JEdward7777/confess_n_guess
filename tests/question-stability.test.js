// CNG-006: a player who resyncs must get back the SAME question, and resyncing must not
// drain the question pool.
//
// sendPlayerToCorrectScreen used to call getNextQuestion(), which is not a read - it
// mutates and draws a fresh random question. Since resync runs on every reconnect, a
// refreshing player was handed a different question each time and another entry burned
// from a pool of 30.

const { S, sleep, newGameWithHost, joinPlayers, refresh, checker } = require('./helpers');

module.exports = {
    name: 'a resync returns the same question',
    async run({ url }) {
        const t = checker();
        const names = ['alice', 'bob', 'carol'];

        const { host, code } = await newGameWithHost(url);
        const P = await joinPlayers(url, code, names);
        host.socket.emit('startGame', { code });
        await sleep(400);

        const original = Object.fromEntries(names.map(n => [n, P[n].question]));
        t.check('every player got a distinct question',
            new Set(Object.values(original)).size === names.length,
            Object.entries(original).map(([n, q]) => `${n}:${(q || '').slice(0, 20)}`).join(' | '));

        for (let i = 1; i <= 3; i++) {
            const re = await refresh(url, code, 'alice');
            t.check(`refresh #${i} returns alice's original question`,
                re.question === original.alice,
                `got "${re.question}" wanted "${original.alice}"`);
            re.close();
        }

        // The server must record the question it handed out, not the one the client
        // echoes back, so a stale or crafted client can't file against a made-up one.
        P.alice.socket.emit('sendQuestionAnswer', {
            name: 'alice', code, answer: 'my answer', question: 'A QUESTION THE CLIENT INVENTED'
        });
        await sleep(250);
        const after = await refresh(url, code, 'alice');
        t.screenIs('after answering, a refresh shows waiting', after.last, S.c2Waiting);

        [host, after, ...Object.values(P)].forEach(c => c.close());
        return t.ok;
    }
};
