// The mission announcer: browser TTS for the HOST screen only.
//
// Personality (user-chosen 2026-07-19): playful tease — gently ribs players by name,
// never mean, family-safe, in the space-techno universe. Each moment has a bank of
// phrase templates; picks shuffle through the whole bank before any repeat, and the
// same phrase never plays twice in a row even across reshuffles ("variety so it
// doesn't get under your skin" — the user's exact requirement).
//
// Engine notes: speechSynthesis is free and local, which is why it was chosen. Chrome
// blocks speech until the page has seen a user gesture; the host usually clicks
// "Launch New Game" first so it just works, but after a refresh the toggle button is
// the gesture that revives it.

type Template = (v: Record<string, string>) => string;

// ---- phrase banks ----------------------------------------------------------

const BANKS: Record<string, Template[]> = {

    lobbyJoin: [
        v => `${v.name} has boarded the ship. No refunds.`,
        v => `Welcome aboard, ${v.name}. Please keep your lies inside the vehicle at all times.`,
        v => `${v.name} just docked. Adjust your trust levels accordingly.`,
        v => `Sensors detect one ${v.name}. Threat level: adorable.`,
        v => `${v.name} has entered the airlock. Smells like trouble.`,
        v => `Make room, crew — ${v.name} is here, and they look suspiciously honest.`,
        v => `${v.name} has joined the mission. Somebody hide the truth.`,
        v => `A wild ${v.name} appears. Mission control is thrilled and mildly concerned.`,
        v => `${v.name} is aboard. The odds of deception just went up.`,
        v => `Attention crew: ${v.name} has arrived fashionably late to the launch pad.`,
    ],

    truthRoundStart: [
        () => `Truth round! Answer honestly. Yes, even you.`,
        () => `Time for the truth, crew. This is the easy part — allegedly.`,
        () => `Check your devices! Honesty mode is now mandatory.`,
        () => `Mission control demands your honest answers. Resistance is futile.`,
        () => `Confession time. The universe is listening, and so is your family.`,
        () => `Answer truthfully, crew. The ship's lie detector is judging you either way.`,
        () => `Phones out! Time to tell the truth like your dessert depends on it.`,
        () => `Truth protocol engaged. Fabrication comes later — pace yourselves.`,
        () => `Be honest now. You'll get to lie soon enough, I promise.`,
        () => `The truth round begins. Somewhere, your conscience just sat up.`,
    ],

    lieRoundStart: [
        v => `Liars, start your engines. Tonight's target: ${v.target}.`,
        v => `Time to fabricate! Make up something believable about ${v.target}.`,
        v => `${v.target}, sit tight — the crew is about to slander you beautifully.`,
        v => `Deception stations, everyone. ${v.target} is on the scanner.`,
        v => `Compose your finest fiction about ${v.target}. Bonus points for style.`,
        v => `The cloaking devices are on. Everyone lie about ${v.target} — respectfully.`,
        v => `${v.target}'s secret is out there. Bury it in nonsense, crew.`,
        v => `Attention all liars: your subject is ${v.target}. Fool wisely.`,
        v => `Operation Fib is a go. Target: ${v.target}. Good luck, agents.`,
        v => `Write a lie about ${v.target} so good even they believe it.`,
    ],

    votingStart: [
        v => `Voting time! Which of these is actually true about ${v.target}?`,
        v => `Scanners up, crew. Find ${v.target}'s real answer among the decoys.`,
        v => `One truth. Several lies. ${v.target} is watching you fail already.`,
        v => `Lock onto the real signal, crew. ${v.target}'s truth is hiding in there.`,
        () => `Time to vote. Choose wrong and someone gets delicious, delicious points.`,
        v => `Which one is the truth about ${v.target}? No pressure. Okay, some pressure.`,
        v => `The lies are live. Vote for the truth about ${v.target} — if you can find it.`,
        v => `Decision time! ${v.target} knows the answer. Sadly, they're not allowed to help.`,
        () => `Vote wisely. Every wrong guess feeds a liar's ego. And their score.`,
        v => `Truth detection engaged. ${v.target}'s honesty is somewhere on that list.`,
    ],

    revealAnswer: [
        v => `Someone here claims: ${v.answer}.`,
        v => `Exhibit next: ${v.answer}. Interesting.`,
        v => `The scanner reports: ${v.answer}. Hmm.`,
        v => `On the screen now: ${v.answer}. Sounds legit. Or does it?`,
        v => `Next candidate: ${v.answer}. The plot thickens.`,
        v => `And this one says: ${v.answer}. Bold, if true.`,
        v => `Incoming transmission: ${v.answer}. Decoding honesty levels now.`,
        v => `Behold: ${v.answer}. Somebody wrote that with a straight face.`,
        v => `Consider this: ${v.answer}. The committee is skeptical.`,
        v => `Allegedly: ${v.answer}. Emphasis on allegedly.`,
        v => `Filed under maybe: ${v.answer}.`,
        v => `The claim on deck: ${v.answer}. Deliberate carefully.`,
        v => `Straight from the transmission log: ${v.answer}.`,
        v => `Now hear this: ${v.answer}. No laughing. Okay, some laughing.`,
        v => `Candidate for the truth: ${v.answer}. Stranger things have happened. Barely.`,
        v => `Reading now: ${v.answer}. The sensors are twitching.`,
        v => `Fresh off the wire: ${v.answer}. Handle with suspicion.`,
        v => `This one states: ${v.answer}. Confidence level: shrug.`,
        v => `Data point: ${v.answer}. Analysis: hmmmm.`,
        v => `Submitted for your judgment: ${v.answer}.`,
        v => `The archive coughs up: ${v.answer}. Dust it off and decide.`,
        v => `Next on the docket: ${v.answer}. The jury looks nervous.`,
        v => `One contender reads: ${v.answer}. Poker faces, everyone.`,
        v => `Signal intercepted: ${v.answer}. Could be genuine. Could be homework.`,
        v => `Statement received: ${v.answer}. Mission control raises one eyebrow.`,
        v => `Word for word: ${v.answer}. Somebody committed to that.`,
        v => `Under the scanner: ${v.answer}. Verdict pending, popcorn ready.`,
        v => `Testimony continues: ${v.answer}. The truth is in here somewhere.`,
        v => `Log entry: ${v.answer}. Believability rating loading… still loading.`,
        v => `Take a look at this one: ${v.answer}. Bold font energy.`,
    ],

    verdictTruth: [
        v => `That one's TRUE! ${v.target} actually admitted it.`,
        v => `Verified! That's the genuine article, straight from ${v.target}.`,
        v => `Truth confirmed! ${v.target}, thank you for your honesty. Mostly.`,
        v => `Ding ding ding — that's the truth! ${v.target} really said that.`,
        v => `Authentic! ${v.target} owns that one, for better or worse.`,
        v => `That's real! ${v.target}, we have questions. So many questions.`,
        v => `The truth at last! ${v.target}, your secret is officially not safe with us.`,
        v => `Confirmed true. ${v.target}, that explains a few things.`,
        v => `One hundred percent genuine ${v.target}. Congratulations to whoever believed it.`,
        v => `Scanner says: TRUE. ${v.target}'s honesty has entered the chat.`,
        v => `Real! ${v.target} lived that. On purpose, apparently.`,
        v => `That's the truth, whole and unfiltered, from ${v.target}.`,
        v => `Genuine article! ${v.target}, the crew now knows too much.`,
        v => `TRUE. ${v.target}, was it worth it? The room says yes.`,
        v => `The honest one! ${v.target}'s life remains stranger than the fiction.`,
        v => `Verified by mission control: ${v.target} really did say that.`,
        v => `It checks out. ${v.target}, your biography just got a new chapter.`,
        v => `That one's certified truth. ${v.target}, no takebacks.`,
        v => `Facts! Actual facts from ${v.target}. Savor this rare event.`,
        v => `Truth located. ${v.target}, the follow-up questions start at dinner.`,
        v => `Authenticity confirmed. ${v.target}, we salute your honesty. And your choices.`,
        v => `The real deal, straight from ${v.target}'s permanent record.`,
        v => `TRUE, says the scanner. ${v.target}, the scanner never lies. Unlike your friends.`,
        v => `History confirms: ${v.target} did that. History is still processing.`,
        v => `That was honesty in its natural habitat. Well spotted, believers of ${v.target}.`,
        v => `Truth! ${v.target} came clean and the galaxy is richer for it.`,
        v => `Affirmative — genuine ${v.target} content. Collector's item.`,
        v => `The truth stands! ${v.target}, so does everyone's opinion of you. Adjusted slightly.`,
        v => `Confirmed: that actually happened to ${v.target}. Somehow.`,
    ],

    verdictTruthNobody: [
        v => `And that was the TRUTH — and nobody believed ${v.target}! Ouch.`,
        v => `Plot twist: it was true, and not one of you bought it. ${v.target}, blink twice if you're okay.`,
        v => `That was real! Zero votes! ${v.target}, your own crew doubts you. Incredible.`,
        v => `The truth, ladies and gentlemen — completely ignored. ${v.target} deserves better. Probably.`,
        v => `TRUE! And unanimously disbelieved. ${v.target}, this is why we can't have nice things.`,
        v => `Nobody guessed it, but that was ${v.target}'s actual truth. The lies were just that good.`,
        () => `That was genuine, and it fooled everyone by being true. Well played, reality.`,
        v => `The real answer! Overlooked by the entire crew. ${v.target}, mission control believes you.`,
        v => `True story, zero believers. ${v.target}, consider being less unbelievable.`,
        () => `And THAT was the truth. The room chose chaos instead. Magnificent.`,
        v => `That was true! Not a single vote. ${v.target}, the trust falls start next week.`,
        v => `Real, and roundly rejected. ${v.target}, they know you and STILL got it wrong.`,
        v => `The truth went unclaimed! ${v.target}, it's not you. It's definitely them.`,
        v => `Zero believers for an actual fact. ${v.target}, science weeps with you.`,
        () => `That was the genuine one, crew. You were all somewhere else entirely.`,
        v => `TRUE — and completely invisible to this crew. ${v.target}, wear it proudly.`,
        v => `The truth passed through the room untouched. A perfect stealth mission, ${v.target}.`,
        v => `Nobody. Voted. For the truth. ${v.target}, your life outpaces their imagination.`,
        () => `An honest answer, unanimously overlooked. The lies send their regards.`,
        () => `That was real and you all walked right past it. Outstanding work, everyone.`,
        v => `Truth: present. Believers: absent. ${v.target}, the record will vindicate you.`,
        v => `The one true answer, snubbed by the entire vessel. ${v.target}, blink and carry on.`,
        v => `Confirmed true, confirmed ignored. ${v.target}, mission control voted for you in spirit.`,
        v => `The crew unanimously agreed ${v.target}'s real life was too far-fetched. Incredible.`,
        v => `Truth without a single fan. ${v.target}, this is why journals exist.`,
        () => `That was authentic and nobody blinked. The deception economy is booming.`,
        () => `Not one vote for reality. Reality has left a one-star review.`,
        v => `The truth, spurned! ${v.target}, your honesty was ahead of its time.`,
        v => `All that honesty, wasted on this crew. ${v.target}, we believe you. Barely.`,
    ],

    verdictLie: [
        v => `FALSE! That masterpiece of fiction came from ${v.author}.`,
        v => `A lie! ${v.author}, take a bow, you menace.`,
        v => `Fabricated! ${v.author} wrote that with zero shame. Respect.`,
        v => `That's a lie, courtesy of ${v.author}'s overactive imagination.`,
        v => `Busted — pure fiction from the desk of ${v.author}.`,
        v => `FAKE! ${v.author}, the drama academy called. They're proud.`,
        v => `A lie! And everyone who voted for it just made ${v.author}'s day.`,
        v => `Counterfeit! ${v.author}, your talents are wasted on honesty.`,
        v => `That one was manufactured by ${v.author}. Quality craftsmanship, honestly.`,
        v => `Deception detected! ${v.author}, you should be ashamed. Are you? Didn't think so.`,
        v => `A lie! ${v.author} built that from nothing but nerve.`,
        v => `False! ${v.author}, the fiction section called — they want you back.`,
        v => `Forged! And ${v.author} didn't even flinch. Chilling. Impressive. Chillingly impressive.`,
        v => `That's a fabrication, hand-stitched by ${v.author}.`,
        v => `Untrue! ${v.author}, your imagination has a growth mindset.`,
        v => `LIE! And a well-fed one — ${v.author} thanks all who voted.`,
        v => `Nope, that was ${v.author}'s creative writing sample. Grade: devious.`,
        v => `A decoy! Launched by ${v.author}, detonated on the gullible.`,
        v => `Fiction! ${v.author}, the truth files a formal complaint.`,
        v => `That one came out of ${v.author}'s lie factory. Fresh batch, too.`,
        v => `Bogus! ${v.author} sold it and some of you bought the extended warranty.`,
        v => `False alarm, crew — ${v.author} wrote that between snacks.`,
        v => `A lie of distinction. ${v.author}, the academy of fibbing takes notice.`,
        v => `Not real! ${v.author}, however, is very real, and very pleased.`,
        v => `Smoke and mirrors, signed ${v.author}.`,
        v => `That was ${v.author} doing improv. Everyone clapped. With their votes.`,
        v => `Denied by reality! Approved by ${v.author}'s ambition.`,
        v => `A counterfeit truth from ${v.author}'s private mint.`,
        v => `Pure invention! ${v.author}, gravity called — even it can't hold you down.`,
    ],

    points: [
        v => `Scores are in! ${v.leader} leads with ${v.points} points. For now.`,
        v => `${v.leader} tops the board at ${v.points}. The rest of you, do better.`,
        v => `Telemetry says ${v.leader} is winning with ${v.points} points. Suspicious.`,
        v => `${v.leader} climbs to ${v.points} points. Somebody stop them. Anybody.`,
        v => `Current champion of deceit and detection: ${v.leader}, ${v.points} points.`,
        v => `The leaderboard bows to ${v.leader} — ${v.points} points and counting.`,
        v => `${v.leader} holds the high ground with ${v.points}. It's not over, crew.`,
        v => `Points update: ${v.leader} at ${v.points}. The gap is beatable. Probably.`,
        v => `${v.leader} leads with ${v.points} points. Trust them even less now.`,
        v => `Standings check: ${v.leader}, ${v.points} points. The comeback starts now, everyone else.`,
    ],

    winner: [
        v => `Mission complete! ${v.name} wins with ${v.points} points! Trust no one, especially them.`,
        v => `All hail ${v.name} — champion of the void with ${v.points} points!`,
        v => `${v.name} takes the crown with ${v.points} points. The galaxy's finest fibber-finder.`,
        v => `Game over! ${v.name} wins! ${v.points} points of pure cunning.`,
        v => `Victory to ${v.name} with ${v.points} points. Study their methods. Fear their skills.`,
        v => `${v.name} is your winner at ${v.points} points! Applause is mandatory.`,
        v => `The final tally crowns ${v.name} with ${v.points} points. Well deceived, champion.`,
        v => `${v.name} conquers the leaderboard — ${v.points} points! Rematch, anyone?`,
        v => `Supreme commander of truth and lies: ${v.name}, with ${v.points} points!`,
        v => `${v.name} wins with ${v.points} points! The rest of you fought bravely. Sort of.`,
    ],
};

// ---- no-repeat picking -----------------------------------------------------

// Per-bank shuffled decks; a deck is redealt when exhausted, and the first card of a
// fresh deal is never the phrase that just played.
const decks: Record<string, number[]> = {};
const lastPick: Record<string, number> = {};

function shuffled(n: number): number[] {
    const a = [...Array(n).keys()];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function pick(bank: string): Template | null {
    const templates = BANKS[bank];
    if (!templates || templates.length === 0) return null;
    if (!decks[bank] || decks[bank].length === 0) {
        decks[bank] = shuffled(templates.length);
        // Never the same line twice in a row, even across a redeal.
        if (templates.length > 1 && decks[bank][decks[bank].length - 1] === lastPick[bank]) {
            const last = decks[bank].pop()!;
            decks[bank].unshift(last);
        }
    }
    const idx = decks[bank].pop()!;
    lastPick[bank] = idx;
    return templates[idx];
}

// ---- the speaking part -----------------------------------------------------

const STORAGE_KEY = 'cng-announcer-enabled';

class Announcer {
    enabled: boolean;
    private voice: SpeechSynthesisVoice | null = null;
    private listeners = new Set<() => void>();

    constructor() {
        this.enabled = (localStorage.getItem(STORAGE_KEY) ?? 'on') === 'on';
        if ('speechSynthesis' in window) {
            // Voices load async in some browsers.
            const load = () => { this.voice = this.chooseVoice(); };
            load();
            window.speechSynthesis.onvoiceschanged = load;
        }
    }

    /** A pleasant English voice if one exists; otherwise whatever the browser has. */
    private chooseVoice(): SpeechSynthesisVoice | null {
        const voices = window.speechSynthesis.getVoices();
        return voices.find(v => /Google US English/i.test(v.name))
            ?? voices.find(v => /^en(-|_)/i.test(v.lang) && /Google/i.test(v.name))
            ?? voices.find(v => /^en(-|_)/i.test(v.lang))
            ?? voices[0]
            ?? null;
    }

    setEnabled(on: boolean) {
        this.enabled = on;
        localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
        if (!on && 'speechSynthesis' in window) window.speechSynthesis.cancel();
        this.listeners.forEach(fn => fn());
    }

    onChange(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

    /**
     * Speak one line for a moment. `interrupt` cancels anything still talking first —
     * used when a new screen arrives so stale commentary doesn't pile up behind it.
     */
    announce(bank: string, vars: Record<string, string> = {}, opts: { interrupt?: boolean } = {}) {
        if (!this.enabled || !('speechSynthesis' in window)) return;
        const template = pick(bank);
        if (!template) return;
        const line = template(vars);
        if (opts.interrupt) window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(line);
        if (this.voice) u.voice = this.voice;
        u.rate = 1.02;
        u.pitch = 0.95;
        window.speechSynthesis.speak(u);
    }

    /** True while a line is being spoken (or queued to be). Lets the auto-continue on the
     *  host screens hold off so it never cuts the announcer off mid-sentence. */
    isSpeaking(): boolean {
        if (!this.enabled || !('speechSynthesis' in window)) return false;
        return window.speechSynthesis.speaking || window.speechSynthesis.pending;
    }

    stop() {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
}

export const announcer = new Announcer();
