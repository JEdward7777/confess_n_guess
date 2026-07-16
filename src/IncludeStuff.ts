export interface UserPoints {
    name: string
    emoji: string
    points: number
}

const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '::1', '[::1]'];

/** Is this hostname one that only ever means "this machine"? */
export function isLoopbackHostname(hostname: string): boolean {
    return LOOPBACK_HOSTNAMES.includes(hostname.toLowerCase());
}

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
export function buildJoinUrl(href: string, lanHost: string | null | undefined, code: string): string {
    const url = new URL(href);
    url.search = '';
    url.hash = '';
    if (lanHost && isLoopbackHostname(url.hostname)) {
        url.hostname = lanHost;
    }
    url.searchParams.set('code', code);
    return url.toString();
}

  //declare an enum for screens
export interface UserAnswer {
    username: string;
    answer: string;
    isTruth: boolean;
    voters?: string[];  // Who voted for this answer
}

export interface LeaderboardEntry {
    name: string;
    emoji: string;
    points: number;
}

export enum Screens {
    g1NewGame = 0,
    h1CollectingUsers = 1,
    h2InformationScreenWithTimer = 2,
    h3ShowTheLiesAndTruths = 3,
    h5ShowThePointsForTheRound = 5,
    h6ShowTheWinner = 6,
    c1TypeInYourNameAndPickAnEmojiForYourPicture = 7,
    c2WaitingScreenJustWhateverText = 8,
    c3SubmitTruth = 9,
    c4PickTheBestAnswerOutOfAList = 10,
    c5SubmitLie = 11
}

export interface SharedState {
    users: { [key : string]: UserPoints },
    code: string,
}

export interface ClientGameState {
    sharedState?: SharedState,


    name?: string
    emoji?: string;

    screen?: Screens,
    error?: string,
    question?: string,
    questionIndex?: number,
    text?: string,
    instructionText?: string,
    timerValue?: number,
    // Identifies the timed segment this state belongs to. The host echoes it back with
    // timerExpired so the server can drop a countdown for a segment that's already over.
    phaseToken?: number,
    answers?: UserAnswer[],
    leaderboard?: LeaderboardEntry[],
    targetPlayer?: string,
}