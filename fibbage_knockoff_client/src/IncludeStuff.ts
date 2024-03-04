export interface User {
    name: string
    emoji: string
    points: number
}

  //declare an enum for screens
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
    c3ShowsQuestionAndLetsYouTypeInAnAnswer = 9,
    c4PickTheBestAnswerOutOfAList = 10
}

interface SharedState {
    users: { [key : string]: User },
    code: string,
}

export interface GameState {
    sharedState?: SharedState,
    name?: string
    screen?: Screens,
    error?: string,
}