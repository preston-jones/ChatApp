import { Injectable, EventEmitter, Output } from '@angular/core';
import { UserService } from '../firestore/user-service/user.service';
import { MessagesService } from './messages.service';
import { ChatUtilityService } from './chat-utility.service';
import { AuthService } from '../authentication/auth-service/auth.service';
import { ChannelsService } from '../channels/channels.service';
import { User } from '../../models/user.class';
import { DirectMessage } from '../../models/direct.message.class';
import { Note } from '../../models/note.class';
import { Firestore, collection, onSnapshot, query, orderBy, where, Timestamp, DocumentSnapshot, QuerySnapshot, DocumentData, doc, getDoc, getDocs, updateDoc, collectionData, docData } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class DirectMessagesService {
  clickUserEvent = new EventEmitter<void>();

  workspaceOpen: boolean = false;
  showDirectMessage: boolean = true;
  showChannelMessage: boolean = false;
  showChatWindow: boolean = true;
  directMessages: DirectMessage[] = [];
  currentConversation: DirectMessage[] = [];
  notes: Note[] = [];
  users: User[] = [];
  currentUserUid = this.authService.currentUser()?.id;


  constructor(
    private firestore: Firestore,
    private userService: UserService,
    private messagesService: MessagesService,
    private chatUtilityService: ChatUtilityService,
    private authService: AuthService,
    private channelsService: ChannelsService,
  ) {
    this.loadDirectMessages();
  }


  openDirectMessage(selectedUserId: string | null | undefined) {
    let user = this.userService.users.find((user: User) => user.id === selectedUserId);
    let index = this.userService.users.findIndex((user: User) => user.id === selectedUserId);
    this.clickUserContainer(user!, index);
  }


  clickUserContainer(clickedUser: User, i: number) {
    this.currentConversation = [];
    this.userService.clickedUsers.fill(false);
    this.channelsService.clickedChannels.fill(false);
    this.userService.clickedUsers[i] = true;
    this.getUserName(clickedUser);
    this.clickUserEvent.emit();
    console.log('User clicked:', clickedUser);

    if (this.authService.currentUserUid) {
      if (clickedUser.id === this.authService.currentUserUid) {
        this.loadNotes();
        console.log('Load Notes.');
      }
      else {
        this.loadCurrentConversation(clickedUser.id).then(() => {
          this.currentConversation = this.directMessages.filter(m => m.senderId === clickedUser.id || m.receiverId === clickedUser.id);
          this.chatUtilityService.setMessageId(null);
          // this.setAllMessagesAsRead();
          console.log('Current Conversation:', this.currentConversation);
        });
      }
    }
  }


  orderedDirectMessages(directMessages: DirectMessage[]) {
    return directMessages.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
  }


  async loadCurrentConversation(targetUserId: string | null | undefined) {
    if (targetUserId) {
      // Lade den Benutzer basierend auf der targetUserId und setze selectedUser
      this.chatUtilityService.directMessageUser = await this.loadSelectedUser(targetUserId);
    }
    const selectedMessages = this.directMessages.filter(m => m.senderId === targetUserId || m.receiverId === targetUserId);
    selectedMessages.forEach(async msg => {
      msg.isOwnMessage = (msg.senderId === this.authService.currentUserUid);
      await this.processConversation(selectedMessages);
    });
    this.currentConversation = selectedMessages;
  }


  async loadNotes() {
    this.notes = [];
    this.notes.forEach(async note => {
      this.setMessageDisplayDate(note);
    });
  }


  async loadDirectMessagesAsPromise(): Promise<void> {
    const directMessagesRef = collection(this.firestore, 'direct_messages');
    const directMessagesQuery = query(directMessagesRef, orderBy('timestamp'));

    // Set up a real-time listener with onSnapshot
    onSnapshot(directMessagesQuery, (querySnapshot) => {
      this.directMessages = querySnapshot.docs
        .map(doc => {
          const directMessageData = doc.data() as DirectMessage;
          return {
            ...directMessageData,
            messageId: doc.id,
            timestamp: directMessageData.timestamp || new Date(), // Ensure timestamp is set
          };
        })
        .filter(directMessage =>
          directMessage.receiverId === this.authService.currentUserUid || directMessage.senderId === this.authService.currentUserUid
        );

      // Order the messages after fetching
      this.orderedDirectMessages(this.directMessages);

      // Log the updated messages
      console.log('Real-time Direct Messages:', this.directMessages);
    }, (error) => {
      console.error('Error listening to direct messages:', error);
    });
  }


  private async processConversation(conversation: DirectMessage[]) {
    await Promise.all(conversation.map(async (msg: DirectMessage) => {
      await this.loadSenderAvatar(msg);
      this.setMessageDisplayDate(msg);
    }));
  }


  private async loadSenderAvatar(msg: DirectMessage) {
    if (msg.senderId) {
      const senderUser = await this.userService.getSelectedUserById(msg.senderId);
      msg.senderAvatar = senderUser?.avatarPath || './assets/images/avatars/avatar5.svg';
    } else {
      msg.senderAvatar = './assets/images/avatars/avatar5.svg';
      console.log("Sender ID is undefined for message:", msg);
    }
  }

  private setMessageDisplayDate(msg: DirectMessage | Note) {
    let lastDisplayedDate: string | null = null;

    const messageDate = msg.timestamp.toDate();
    const formattedDate = this.messagesService.formatTimestamp(messageDate);

    // Setze das Anzeigen-Datum
    if (formattedDate !== lastDisplayedDate) {
      msg.displayDate = formattedDate;
      lastDisplayedDate = formattedDate;
    } else {
      msg.displayDate = null;
    }

    // Setze formattedTimestamp für die Nachricht
    msg.formattedTimestamp = messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }


  getUserName(user: User) {
    this.chatUtilityService.directMessageUser = user;
  }


  private async loadSelectedUser(targetUserId: string) {
    return await this.userService.getSelectedUserById(targetUserId);
  }


  /* ---- UPDATE ---- */

  async loadDirectMessages() {
    const directMessagesQuery = this.createDirectMessageQuery();

    onSnapshot(directMessagesQuery, async (snapshot) => {
      // Verarbeite die geladenen Nachrichten
      this.directMessages = await this.processSnapshot(snapshot);

      await Promise.all(this.directMessages.map(async (msg: DirectMessage) => {
        await this.loadSenderAvatar(msg);
        this.setMessageDisplayDate(msg);
      }));
    });
  }


  private createDirectMessageQuery() {
    const directMessagesRef = collection(this.firestore, 'direct_messages');

    // Filtere die Nachrichten nach der übergebenen channelId
    return query(
      directMessagesRef,
      where('receiverId', '==', this.authService.currentUserUid),
      where('senderId', '==', this.authService.currentUserUid),
      orderBy('timestamp')
    );
  }


  private async processSnapshot(snapshot: any) {
    let lastDisplayedDate: string | null = null;

    return Promise.all(snapshot.docs.map(async (doc: DocumentSnapshot) => {
      const directMessage = await this.mapDirectMessageData(doc);
      const directMessageData = doc.data(); // Hier abrufen

      // Sicherstellen, dass messageData definiert ist
      if (directMessageData) {
        const directMessageDate = new Date(directMessageData['timestamp']?.seconds * 1000);
        const formattedDate = this.formatTimestamp(directMessageDate);

        if (formattedDate !== lastDisplayedDate) {
          directMessage.displayDate = formattedDate;
          lastDisplayedDate = formattedDate;
        } else {
          directMessage.displayDate = null;
        }
      }

      return directMessage;
    }));
  }


  private async mapDirectMessageData(doc: DocumentSnapshot) {
    const directMessageData = doc.data();

    // Sicherstellen, dass messageData definiert ist
    if (!directMessageData) {
      throw new Error('Message data is undefined'); // Fehlerbehandlung
    }

    const directMessage = new DirectMessage(directMessageData, this.authService.currentUserUid);
    directMessage.messageId = doc.id;
    directMessage.isOwnMessage = directMessage.senderId === this.authService.currentUserUid;

    if (directMessage.senderId) {
      const senderUser = await this.userService.getSelectedUserById(directMessage.senderId);
      directMessage.senderAvatar = senderUser?.avatarPath || './assets/images/avatars/avatar5.svg';
    } else {
      directMessage.senderAvatar = './assets/images/avatars/avatar5.svg';
    }

    // Sicherstellen, dass timestamp definiert ist
    const directMessageDate = new Date(directMessageData['timestamp']?.seconds * 1000);
    directMessage.formattedTimestamp = directMessageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return directMessage;
  }


  formatTimestamp(directMessageDate: Date): string {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isToday = directMessageDate.toDateString() === today.toDateString();
    const isYesterday = directMessageDate.toDateString() === yesterday.toDateString();

    if (isToday) {
      return 'Heute'; // Wenn die Nachricht von heute ist
    } else if (isYesterday) {
      return 'Gestern'; // Wenn die Nachricht von gestern ist
    } else {
      // Format "13. September"
      return directMessageDate.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
    }
  }
}