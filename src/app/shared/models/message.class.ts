export class Message {
    messageId: string;
    channelId: string | null;
    senderID: string | null;
    senderName: string | null;
    message: string | null;
    reactions: { emoji: string; senderID: string; senderName: string; count: number }[] = [];
    answers: Message[];
    formattedTimestamp: string;
    isOwnMessage: boolean = false;
    isOwnChatMessage: boolean = false;
    displayDate: string | null;
    senderAvatar: string | null | undefined;
    parentMessageId: string | null;
    fileURL: string | null;
    lastAnswer: string | null;

    constructor(obj?: any, currentUserUid?: string | null) {
        this.messageId = obj ? obj.messageId : null;
        this.channelId = obj ? obj.channelId : null;
        this.senderID = obj ? obj.senderID : null;
        this.senderName = obj ? obj.senderName : null;
        this.message = obj ? obj.message : null;
        this.reactions = obj?.reactions || [];
        this.answers = obj && obj.answers ? obj.answers.map((answer: any) => new Message(answer)) : [];
        this.formattedTimestamp = '';
        this.displayDate = null;
        this.parentMessageId = obj ? obj.parentMessageId : null;
        this.fileURL = obj ? obj.fileURL : null;

        // Setze lastAnswer, wenn Antworten existieren
        this.lastAnswer = this.answers.length > 0 ? this.answers[this.answers.length - 1].message : null;

        // Typensicherer Vergleich, um sowohl null als auch undefined abzudecken
        if (currentUserUid && this.senderID) {
            this.isOwnMessage = this.senderID === currentUserUid;
        }

        if (currentUserUid && this.senderID) {
            this.isOwnChatMessage = this.senderID === currentUserUid;
        }
    }
}
