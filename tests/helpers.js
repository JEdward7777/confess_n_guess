// Shared plumbing for the integration tests.
//
// These drive real socket.io clients against a real server. There are no unit tests and
// this codebase doesn't want them: nearly every bug found here has been about what the
// server sends to whom, and only a real client can see that.

const path = require('path');
const { io } = require(path.join(__dirname, '..', 'confess_n_guess_client', 'node_modules', 'socket.io-client'));

/** Screen ids, mirroring the Screens enum in src/IncludeStuff.ts. */
const S = {
    g1NewGame: 0,
    h1Collecting: 1,
    h2Timer: 2,
    h3Results: 3,
    h4Iterate: 4,
    h5Points: 5,
    h6Winner: 6,
    c1Name: 7,
    c2Waiting: 8,
    c3Truth: 9,
    c4Vote: 10,
    c5Lie: 11
};
const SCREEN_NAME = Object.fromEntries(Object.entries(S).map(([k, v]) => [v, k]));
const screenName = id => SCREEN_NAME[id] ?? String(id);

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * A connected client that tracks the last state the server sent it, the way the real
 * client does: fields are merged, because the server doesn't resend everything each time.
 */
async function connect(url) {
    const socket = io(url, { forceNew: true, transports: ['websocket'] });
    const c = {
        socket,
        last: null,        // most recent screen
        screens: [],       // every screen, in order
        close: () => socket.close()
    };
    socket.on('gameState', st => {
        if (st.screen !== undefined) { c.last = st.screen; c.screens.push(st.screen); }
        if (st.sharedState?.code) c.code = st.sharedState.code;
        if (st.sharedState?.users) c.users = st.sharedState.users;
        if (st.question !== undefined) c.question = st.question;
        if (st.targetPlayer !== undefined) c.targetPlayer = st.targetPlayer;
        if (st.phaseToken !== undefined) c.phaseToken = st.phaseToken;
        if (st.answers !== undefined) c.answers = st.answers;
        if (st.leaderboard !== undefined) c.leaderboard = st.leaderboard;
        if (st.text !== undefined) c.text = st.text;
    });
    await new Promise(r => socket.on('connect', r));
    return c;
}

/** Host that has created a game and identified. Returns { host, code }. */
async function newGameWithHost(url) {
    const host = await connect(url);
    host.socket.emit('newGame');
    await sleep(300);
    if (!host.code) throw new Error('server issued no game code');
    host.socket.emit('identify', { role: 'host', code: host.code });
    await sleep(150);
    return { host, code: host.code };
}

/** Join players by name. Returns a map of name -> client. */
async function joinPlayers(url, code, names) {
    const players = {};
    for (const name of names) {
        const p = await connect(url);
        p.socket.emit('joinGame', code);
        await sleep(80);
        p.socket.emit('nameAndEmoji', { name, emoji: '😊', code });
        await sleep(120);
        players[name] = p;
    }
    return players;
}

/**
 * Simulate a browser refresh: a brand new socket that identifies with code+name, which
 * is exactly what App.tsx does on mount.
 */
async function refresh(url, code, name) {
    const c = await connect(url);
    c.socket.emit('identify', name === '<host>' ? { role: 'host', code } : { role: 'player', code, name });
    await sleep(250);
    return c;
}

/** Everyone answers their question and we land in the first lie round. */
async function everyoneAnswers(players, code, suffix = 'truth') {
    for (const [name, p] of Object.entries(players)) {
        p.socket.emit('sendQuestionAnswer', { name, code, answer: `${name}-${suffix}`, question: p.question });
        await sleep(150);
    }
    await sleep(350);
}

/** Collects results so a test can report every failure, not just the first. */
function checker() {
    const ctx = { ok: true, failures: [] };
    ctx.check = (label, cond, detail = '') => {
        if (cond) {
            console.log(`  ok   ${label}`);
        } else {
            console.log(`  FAIL ${label}${detail ? '  <- ' + detail : ''}`);
            ctx.ok = false;
            ctx.failures.push(label);
        }
        return cond;
    };
    ctx.screenIs = (label, got, want) =>
        ctx.check(label, got === want, `${screenName(got)}, wanted ${screenName(want)}`);
    return ctx;
}

module.exports = { S, screenName, sleep, connect, newGameWithHost, joinPlayers, refresh, everyoneAnswers, checker };
