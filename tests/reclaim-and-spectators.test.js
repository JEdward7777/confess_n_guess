// CNG-031 + the user's T20 ruling (2026-07-16):
//
//   "Once a game starts, new joiners shouldn't show up on the leaderboard unless their
//    name matches. I am ok with making the names case insensitive. I am ok for a third
//    party to join and just watch, but they shouldn't join the board."
//
// So: names match case-insensitively and trimmed ("Bob" can come back as " bob ");
// a mid-game name that matches nobody gets to WATCH -- never joins the board, never
// counts toward any round's quorum. Before the game starts, joining works as always.

const { S, screenName, sleep, connect, newGameWithHost, joinPlayers, checker } = require('./helpers');

function playerCount(users) {
    return Object.keys(users || {}).filter(n => n !== '<host>').length;
}

module.exports = {
    name: 'case-insensitive reclaim; mid-game strangers watch, not play',
    env: { CNG_ROUND_SECONDS: '30', CNG_RESTART_SECONDS: '30' },

    async run({ url }) {
        const t = checker();
        const names = ['Alice', 'Bob', 'Carol'];

        const { host, code } = await newGameWithHost(url);
        const P = await joinPlayers(url, code, names);
        host.socket.emit('startGame', { code });
        await sleep(400);

        // Alice answers, then "switches devices" and retypes her name sloppily.
        P.Alice.socket.emit('sendQuestionAnswer', { name: 'Alice', code, answer: 'a-truth', question: P.Alice.question });
        await sleep(250);

        const alice2 = await connect(url);
        alice2.socket.emit('joinGame', code);
        await sleep(100);
        alice2.socket.emit('nameAndEmoji', { name: ' ALICE ', emoji: '😊', code });
        await sleep(300);

        t.screenIs('sloppy retype reclaims Alice (already answered -> waits)', alice2.last, S.c2Waiting);
        t.check('reclaim did not fork a ghost player', playerCount(alice2.users) === 3,
            `players: [${Object.keys(alice2.users || {})}]`);
        t.check('the client is told its canonical name', alice2.name === 'Alice', `got "${alice2.name}"`);

        // A stranger joins mid-game. They may watch; they must not join the board.
        const dave = await connect(url);
        dave.socket.emit('joinGame', code);
        await sleep(100);
        dave.socket.emit('nameAndEmoji', { name: 'Dave', emoji: '👀', code });
        await sleep(300);

        t.check('mid-game stranger gets a screen (can watch)', dave.last !== null,
            `screen: ${screenName(dave.last)}`);
        t.check('mid-game stranger is NOT on the board', playerCount(dave.users) === 3,
            `players: [${Object.keys(dave.users || {})}]`);

        // Quorum: with Alice answered, Bob and Carol finishing must advance the round.
        // Pre-fix, ghost-ALICE and Dave were both counted and the round stalled.
        for (const n of ['Bob', 'Carol']) {
            P[n].socket.emit('sendQuestionAnswer', { name: n, code, answer: `${n}-truth`, question: P[n].question });
            await sleep(200);
        }
        await sleep(400);
        const waiting = names.filter(n => P[n].last === S.c2Waiting);
        const lying = names.filter(n => P[n].last === S.c5Lie);
        t.check('the round advanced without waiting for ghosts or spectators',
            waiting.length === 1 && lying.length === 2,
            names.map(n => `${n}:${screenName(P[n].last)}`).join(' '));

        // Reclaiming by URL (identify) must be case-insensitive too, or reclaim-by-refresh
        // breaks where reclaim-by-typing works.
        const bob2 = await connect(url);
        bob2.socket.emit('identify', { role: 'player', code, name: 'BOB' });
        await sleep(300);
        t.check('identify with different case resyncs as the same player',
            bob2.last === P.Bob.last && bob2.last !== S.c1Name,
            `got ${screenName(bob2.last)}, Bob is on ${screenName(P.Bob.last)}`);

        // Play the round through; the spectator should get to see the reveal,
        // and the board must hold exactly the three real players.
        const target = waiting[0];
        for (const n of lying) {
            P[n].socket.emit('submitLie', { name: n, code, lie: `${n}-lie`, targetPlayer: target, question: 'q' });
            await sleep(150);
        }
        await sleep(300);
        for (const n of lying) {
            P[n].socket.emit('voteOnLie', { name: n, code, selectedUsername: target, targetPlayer: target });
            await sleep(150);
        }
        await sleep(400);

        t.screenIs('the spectator sees the reveal', dave.last, S.h3Results);

        host.socket.emit('continueFromResults', { code });
        await sleep(300);
        const lb = (host.leaderboard || []).map(e => e.name).sort();
        t.check('the leaderboard holds exactly the three real players',
            JSON.stringify(lb) === JSON.stringify(['Alice', 'Bob', 'Carol']),
            `[${lb}]`);

        // Before a game starts, joining still works normally (the rule is "once a game
        // starts"). New game in the same server, new person joins the lobby fine.
        const { host: h2, code: code2 } = await newGameWithHost(url);
        const eve = await connect(url);
        eve.socket.emit('joinGame', code2);
        await sleep(100);
        eve.socket.emit('nameAndEmoji', { name: 'Eve', emoji: '🌱', code: code2 });
        await sleep(300);
        t.check('lobby-phase joining is unchanged', playerCount(eve.users) === 1,
            `players: [${Object.keys(eve.users || {})}]`);

        [host, h2, alice2, dave, bob2, eve, ...Object.values(P)].forEach(c => c.close());
        return t.ok;
    }
};
