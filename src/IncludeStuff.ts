export interface UserPoints {
    name: string
    emoji: string
    points: number
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
    h4IterateThroughTheDifferentAnswersAndPopUpYesOrNo = 4,
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
    answers?: UserAnswer[],
    leaderboard?: LeaderboardEntry[],
    targetPlayer?: string,
}