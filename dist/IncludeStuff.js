"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Screens = exports.buildJoinUrl = exports.isLoopbackHostname = void 0;
const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '::1', '[::1]'];
/** Is this hostname one that only ever means "this machine"? */
function isLoopbackHostname(hostname) {
    return LOOPBACK_HOSTNAMES.includes(hostname.toLowerCase());
}
exports.isLoopbackHostname = isLoopbackHostname;
/**
 * The URL to put in the join QR code.
 *
 * Normally the host's own address bar is the right answer and is left alone — behind a
 * reverse proxy it is the *only* right answer, since the server's own address is an
 * internal detail the phones can't reach.
 *
 * The exception is loopback. If the host opened the game at localhost, that URL means
 * "this machine" to whoever reads it, so a phone scanning the QR tries to reach itself and
 * fails. Only then do we substitute the server's LAN address.
 *
 * Only the hostname is replaced. Keeping the port and path means a reverse proxy running
 * on the same box still works: browsing localhost:8080 yields 192.168.x.x:8080, which goes
 * through the proxy rather than around it.
 */
function buildJoinUrl(href, lanHost, code) {
    const url = new URL(href);
    url.search = '';
    url.hash = '';
    if (lanHost && isLoopbackHostname(url.hostname)) {
        url.hostname = lanHost;
    }
    url.searchParams.set('code', code);
    return url.toString();
}
exports.buildJoinUrl = buildJoinUrl;
var Screens;
(function (Screens) {
    Screens[Screens["g1NewGame"] = 0] = "g1NewGame";
    Screens[Screens["h1CollectingUsers"] = 1] = "h1CollectingUsers";
    Screens[Screens["h2InformationScreenWithTimer"] = 2] = "h2InformationScreenWithTimer";
    Screens[Screens["h3ShowTheLiesAndTruths"] = 3] = "h3ShowTheLiesAndTruths";
    Screens[Screens["h5ShowThePointsForTheRound"] = 5] = "h5ShowThePointsForTheRound";
    Screens[Screens["h6ShowTheWinner"] = 6] = "h6ShowTheWinner";
    Screens[Screens["c1TypeInYourNameAndPickAnEmojiForYourPicture"] = 7] = "c1TypeInYourNameAndPickAnEmojiForYourPicture";
    Screens[Screens["c2WaitingScreenJustWhateverText"] = 8] = "c2WaitingScreenJustWhateverText";
    Screens[Screens["c3SubmitTruth"] = 9] = "c3SubmitTruth";
    Screens[Screens["c4PickTheBestAnswerOutOfAList"] = 10] = "c4PickTheBestAnswerOutOfAList";
    Screens[Screens["c5SubmitLie"] = 11] = "c5SubmitLie";
})(Screens || (exports.Screens = Screens = {}));
//# sourceMappingURL=IncludeStuff.js.map