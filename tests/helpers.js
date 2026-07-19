// Shared plumbing for the integration tests, Cloudflare edition (PORT.md D10).
//
// These drive raw WebSockets against a real `wrangler dev` — the same {event, data}
// JSON the browser shim speaks, because the wire protocol is the port's frozen
// correctness oracle (D1). Node >= 21 has a global WebSocket, so no client dependency.
//
// The client object mirrors the browser shim: it connects lazily to /ws/<CODE> on the
// first emit that carries a code, which is also how game creation works now — POST
// /api/newGame first, then connect (the one protocol edge that differs from Node).

/** Screen ids, mirroring the Screens enum in src/IncludeStuff.ts. */
const S = {
    g1NewGame: 0,
    h1Collecting: 1,
    h2Timer: 2,
    h3Results: 3,
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
 * A lazily-connecting client. Tracks the last state the server sent the way the real
 * client does: fields merge, because the server doesn't resend everything each time.
 */
function connect(url) {
    const c = {
        url,
        ws: null,
        code: null,
        last: null,
        screens: [],
        _listeners: new Map(),
        _queue: []
    };

    const fire = (event, data) => {
        if (event === 'gameState') {
            const st = data ?? {};
            if (st.screen !== undefined) { c.last = st.screen; c.screens.push(st.screen); }
            if (st.sharedState?.code) c.code = st.sharedState.code;
            if (st.sharedState?.users) c.users = st.sharedState.users;
            if (st.question !== undefined && st.question !== '') c.question = st.question;
            if (st.targetPlayer !== undefined) c.targetPlayer = st.targetPlayer;
            if (st.phaseToken !== undefined) c.phaseToken = st.phaseToken;
            if (st.answers !== undefined) c.answers = st.answers;
            if (st.leaderboard !== undefined) c.leaderboard = st.leaderboard;
            if (st.text !== undefined) c.text = st.text;
            if (st.name !== undefined && st.name !== '') c.name = st.name;
            if (st.error !== undefined) c.error = st.error;
        }
        for (const fn of c._listeners.get(event) ?? []) fn(data);
    };

    const open = (code) => {
        c.code = code;
        const ws = new WebSocket(url.replace(/^http/, 'ws') + '/ws/' + code);
        c.ws = ws;
        ws.addEventListener('open', () => {
            for (const msg of c._queue) ws.send(msg);
            c._queue = [];
        });
        ws.addEventListener('message', ev => {
            try {
                const { event, data } = JSON.parse(ev.data);
                fire(event, data);
            } catch { /* not ours */ }
        });
        ws.addEventListener('error', e => { c.wsError = String(e?.message ?? e); });
    };

    c.socket = {
        emit(event, data) {
            // joinGame historically sent the bare code string; accept both shapes.
            const payload = typeof data === 'string' ? { code: data } : (data ?? {});
            const code = String(payload.code ?? c.code ?? '').toUpperCase();
            if (event === 'joinGame') payload.code = code;
            if (!code) throw new Error(`emit('${event}') with no game code to route by`);
            if (!c.ws) open(code);
            const msg = JSON.stringify({ event, data: payload });
            if (c.ws.readyState === WebSocket.OPEN) c.ws.send(msg);
            else c._queue.push(msg);
        },
        on(event, fn) {
            if (!c._listeners.has(event)) c._listeners.set(event, new Set());
            c._listeners.get(event).add(fn);
        },
        off(event, fn) {
            c._listeners.get(event)?.delete(fn);
        }
    };
    c.close = () => { try { c.ws?.close(); } catch { } };
    return c;
}

/** Wait (bounded) until the client has heard SOMETHING from the server. */
async function awaitReply(c, what) {
    const deadline = Date.now() + 5000;
    while (c.last === null && Date.now() < deadline) {
        await sleep(50);
    }
    if (c.last === null) {
        throw new Error(`no reply for ${what}` + (c.wsError ? ` (ws error: ${c.wsError})` : ''));
    }
    await sleep(100); // let any follow-up state in the same burst land
}

/** Create a game over HTTP, connect its host socket, identify. Returns { host, code }. */
async function newGameWithHost(url) {
    const res = await fetch(url + '/api/newGame', { method: 'POST' });
    const { code } = await res.json();
    if (!code) throw new Error('newGame allocated no code: ' + JSON.stringify(await res.text()));
    const host = connect(url);
    host.socket.emit('identify', { role: 'host', code });
    await awaitReply(host, 'host identify');
    return { host, code };
}

/**
 * Join players by name. Returns a map of name -> client.
 *
 * Waits for each join to be ANSWERED before moving on. The fixed-sleep version lost
 * players under load - a cold DO answered slower than the stopwatch, the test moved on,
 * and a three-player game quietly ran with two (the flake showed as a missing Carol,
 * not as an error).
 */
async function joinPlayers(url, code, names) {
    const players = {};
    for (const name of names) {
        const p = connect(url);
        p.socket.emit('joinGame', code);
        await awaitReply(p, `joinGame ${name}`);
        p.last = null; // arm the wait for the nameAndEmoji answer
        p.socket.emit('nameAndEmoji', { name, emoji: '😊', code });
        await awaitReply(p, `nameAndEmoji ${name}`);
        players[name] = p;
    }
    return players;
}

/**
 * Simulate a browser refresh: a brand new socket that identifies with code+name.
 *
 * Waits for the server's ANSWER rather than a fixed beat: a cold Durable Object under
 * load can take longer than any polite sleep, and the suite flaked exactly there -
 * assertions reading `last === null` because the reply was still in flight. Bounded so
 * a genuinely dead server still fails fast.
 */
async function refresh(url, code, name) {
    const c = connect(url);
    c.socket.emit('identify', name === '<host>' ? { role: 'host', code } : { role: 'player', code, name });
    const deadline = Date.now() + 5000;
    while (c.last === null && Date.now() < deadline) {
        await sleep(50);
    }
    await sleep(100); // let any follow-up state in the same burst land
    return c;
}

// (refresh tolerates no-reply: some tests probe dead codes where silence is the finding)

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
