export type AppIdentifier = 'messages' | 'docs' | 'calendar' | 'tasks';

export interface User {
  id: string;
  name: string;
  avatar: string;
  status: 'online' | 'offline' | 'busy';
}

export interface Message {
  id: string;
  senderId: string;
  content: string;
  timestamp: string;
  type: 'text' | 'shared_doc';
  docId?: string;
  docTitle?: string;
  /** The member selected in the share dialog. Shared documents are private to this recipient and the sender. */
  recipientId?: string;
  /** Message-level read receipts keep each participant's unread badge independent. */
  readByUserIds?: string[];
}

export interface ChatItem {
  id: string;
  user: User;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
  messages?: Message[];
  participantIds?: string[];
}

export interface DocItem {
  id: string;
  title: string;
  updatedAt: string;
  author: string;
  type: 'document' | 'spreadsheet' | 'presentation' | 'folder';
  content?: string;
  isUntitled?: boolean;
  isBlank?: boolean;
  /** Imported files stay only in the current browser's local storage. */
  isLocalFile?: boolean;
}

export interface DocLibrary {
  id: string;
  name: string;
  docs: DocItem[];
}

export interface DocComment {
  id: string;
  docId: string;
  roleId: string;
  authorId: string;
  citationId?: '1' | '2';
  selectedText?: string;
  /** The matching original-document expression, used to restore the anchor in review mode. */
  sourceText?: string;
  content: string;
  createdAt: string;
  readByOwner?: boolean;
  recipientId?: string;
  replyToId?: string;
  readByRecipient?: boolean;
  status?: 'open' | 'resolved';
  resolvedById?: string;
  replies?: Array<{ id: string; authorId: string; content: string; createdAt: string }>;
}

/** A task collected from a simulated challenge. Unlike a comment, it is not
 * anchored to a source-text fragment and therefore has no original-text cue. */
export interface ChallengeTask {
  id: string;
  docId: string;
  docTitle: string;
  roleName: string;
  content: string;
  createdAt: string;
  unread: boolean;
  status: 'open' | 'resolved';
}

/** A lightweight audit entry created when a role document is regenerated.
 * It intentionally stores no source-document copy. */
export interface DerivationSnapshot {
  id: string;
  docId: string;
  roleId: string;
  roleName: string;
  sourceContentHash: string;
  createdAt: string;
}

export interface GeneratedDerivation {
  content: string;
  relatedDocumentIds: string[];
  generatedAt: string;
  sourceContentHash?: string | null;
  visualOverview?: boolean;
  visualOverviewData?: VisualOverview | null;
}

export interface VisualOverview {
  title: string;
  branches: Array<{ title: string; items: string[] }>;
}
