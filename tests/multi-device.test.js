// Multiple devices per player are deliberately supported: reconnecting and switching
// devices matters more here than proving identity (see the decision note in ISSUES.md
// for 2026-07-15). That choice has to actually work, and must not hand out double points.
//
// CNG-026: every device of a player must follow along, not just the one that submitted.
// CNG-012: a second submission replaces the first rather than counting twice.
// CNG-020: the server rejects a vote for your own answer.

const { S, screenName, sleep, connect, newGameWithHost, joinPlayers, refresh, checker } = require('./helpers');

module.exports = {
    name: 'a player on two devices',
    async run({ url }) {
        const t = checker();
        const names = ['alice', 'bob', 'carol'];

        const { host, code } = await newGameWithHost(url);
        const P = await joinPlayers(url, code, names);

        // The two-device player must end up a VOTER, not the round's target, or the
        // double-vote case below silently never runs. The first target is the first
        // player, so use the second one - and assert that further down rather than
        // trusting it.
        const TWO_DEV = 'bob';

        // bob picks up a second device and identifies as himself. This must be allowed:
        // it is the same path as reconnecting after a dead battery.
        const bob2 = await connect(url);
        bob2.socket.emit('identify', { role: 'player', code, name: TWO_DEV });
        await sleep(250);
        t.check('a second device can join as an existing player', bob2.last !== null);

        host.socket.emit('startGame', { code });
        await sleep(400);
        t.check(`both of ${TWO_DEV}'s devices got the question`,
            P[TWO_DEV].last === S.c3Truth && bob2.last === S.c3Truth,
            `d1:${screenName(P[TWO_DEV].last)} d2:${screenName(bob2.last)}`);
        t.check('both devices show the SAME question',
            bob2.question === P[TWO_DEV].question);

        // He answers on device 1; device 2 must follow, not sit on the question.
        P[TWO_DEV].socket.emit('sendQuestionAnswer', { name: TWO_DEV, code, answer: 'b-truth', question: P[TWO_DEV].question });
        await sleep(300);
        t.screenIs('answering on one device moves the other one on', bob2.last, S.c2Waiting);

        for (const n of names.filter(n => n !== TWO_DEV)) {
            P[n].socket.emit('sendQuestionAnswer', { name: n, code, answer: `${n}-truth`, question: P[n].question });
            await sleep(150);
        }
        await sleep(350);

        const target = names.find(n => P[n].last === S.c2Waiting);
        const liars = names.filter(n => n !== target);
        // If this ever fails the rest of the test is meaningless rather than wrong, so
        // fail loudly instead of quietly skipping.
        t.check(`${TWO_DEV} is a voter this round, so the double-vote case actually runs`,
            liars.includes(TWO_DEV), `target is ${target}`);

        for (const n of liars) {
            P[n].socket.emit('submitLie', { name: n, code, lie: `${n}-lie`, targetPlayer: target, question: 'q' });
            await sleep(150);
        }
        await sleep(350);

        t.screenIs('lying on one device moves the other one on', bob2.last, S.c4Vote);

        // The ballot must hold exactly one truth + one lie per other player - no
        // duplicates from a player having two devices.
        const ballot = P[liars[0]].answers || [];
        t.check('ballot has no duplicate authors',
            new Set(ballot.map(a => a.username)).size === ballot.length,
            ballot.map(a => a.username).join(','));

        // A player must not vote for their own answer (CNG-020). Rejected means resynced,
        // so the ballot stays up rather than the round advancing.
        P[TWO_DEV].socket.emit('voteOnLie', { name: TWO_DEV, code, selectedUsername: TWO_DEV, targetPlayer: target });
        await sleep(300);
        t.screenIs('a vote for your own answer is rejected, ballot stays up', P[TWO_DEV].last, S.c4Vote);

        // bob votes from device 1. Check the sibling BEFORE the round completes: once the
        // last voter votes everyone goes to the reveal, which would mask this entirely.
        P[TWO_DEV].socket.emit('voteOnLie', { name: TWO_DEV, code, selectedUsername: target, targetPlayer: target });
        await sleep(300);
        t.screenIs('the device that voted moves on', P[TWO_DEV].last, S.c2Waiting);
        t.screenIs('the OTHER device moves on too, losing its live ballot', bob2.last, S.c2Waiting);

        // Even so, make the stale device vote anyway. It must not count twice (CNG-012).
        bob2.socket.emit('voteOnLie', { name: TWO_DEV, code, selectedUsername: target, targetPlayer: target });
        await sleep(250);

        // The remaining voters finish the round.
        for (const n of liars.filter(n => n !== TWO_DEV)) {
            P[n].socket.emit('voteOnLie', { name: n, code, selectedUsername: target, targetPlayer: target });
            await sleep(150);
        }
        await sleep(400);

        t.screenIs('the round reveals', host.last, S.h3Results);
        const results = host.answers || [];
        const truthRow = results.find(a => a.isTruth);
        t.check('nobody voted twice',
            truthRow && new Set(truthRow.voters).size === truthRow.voters.length,
            `voters on the truth: [${truthRow ? truthRow.voters : '?'}]`);
        t.check('each voter counted once',
            truthRow && truthRow.voters.length === liars.length,
            `${truthRow ? truthRow.voters.length : '?'} votes from ${liars.length} voters`);

        // Scoring must reflect one vote each, not one-and-a-bonus.
        host.socket.emit('continueFromResults', { code });
        await sleep(300);
        const lb = host.leaderboard || [];
        const targetScore = (lb.find(e => e.name === target) || {}).points;
        t.check(`the target scored 1000 per correct guesser (${liars.length}x1000)`,
            targetScore === liars.length * 1000,
            `${target}=${targetScore}, leaderboard: ` + lb.map(e => `${e.name}=${e.points}`).join(' '));

        [host, bob2, ...Object.values(P)].forEach(c => c.close());
        return t.ok;
    }
};
