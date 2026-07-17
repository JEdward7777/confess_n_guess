// CNG-033: an abandoned game must be collectable by the idle sweep.
//
// "Activity" has to mean a human did something. Pre-fix, setPhase() called touch(), and
// the server's own timers go through setPhase - so a game everyone walked away from kept
// refreshing its own lastActivity as it churned (restart, timer, restart...) and the
// 12-hour sweep could never collect it. An immortal zombie, made worse by CNG-032
// draining the pool as it spun.
//
// Flow: start a game, everyone vanishes, let it churn past the (shortened) idle window,
// SIGINT-restart the server, and assert the save dropped it.

const { sleep, newGameWithHost, joinPlayers, checker } = require('./helpers');

module.exports = {
    name: 'an abandoned game idles out despite its own churn',
    env: {
        CNG_ROUND_SECONDS: '1',
        CNG_RESTART_SECONDS: '1',
        CNG_BACKSTOP_SECONDS: '2',
        // Idle window shorter than the test, far longer than one churn cycle - so the only
        // way the game survives the sweep is if its own churn counts as activity.
        CNG_GAME_MAX_IDLE_MS: '4000'
    },

    async run({ url, server }) {
        const t = checker();
        const names = ['alice', 'bob'];

        const { host, code } = await newGameWithHost(url);
        const P = await joinPlayers(url, code, names);
        host.socket.emit('startGame', { code });
        await sleep(300);

        // Everyone walks away. From here the only "activity" is the server churning the
        // unanswered round: timer -> restart -> timer, roughly once a second.
        [host, ...Object.values(P)].forEach(c => c.close());

        // Sit well past the idle window while it churns.
        await sleep(6000);

        // A second game with a live human, as the control: it must survive the sweep.
        const { host: host2, code: code2 } = await newGameWithHost(url);

        await server.restart('SIGINT'); // keeps the SIGINT save path covered
        const saved = server.savedGames();

        t.check('the abandoned game was dropped by the sweep',
            !(code in saved),
            `still saved with phase ${saved[code]?.currentPhase}; churn counted as activity`);
        t.check('the game with recent human activity survived',
            code2 in saved,
            `saved codes: [${Object.keys(saved)}]`);

        host2.close();
        return t.ok;
    }
};
