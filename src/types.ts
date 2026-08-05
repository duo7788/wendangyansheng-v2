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
}

export interface ChatItem {
  id: string;
  user: User;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
  messages?: Message[];
}

export interface DocItem {
  id: string;
  title: string;
  updatedAt: string;
  author: string;
  type: 'document' | 'spreadsheet' | 'presentation' | 'folder';
  content?: string;
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
  content: string;
  createdAt: string;
  readByOwner?: boolean;
}
