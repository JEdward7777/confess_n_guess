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

    stop() {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
}

export const announcer = new Announcer();
