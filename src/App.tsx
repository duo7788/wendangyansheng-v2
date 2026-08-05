import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Directory } from './components/Directory';
import { Workspace } from './components/Workspace';
import { AppIdentifier, DocLibrary, DocItem, ChatItem, DocComment } from './types';
import { mockChats as initialMockChats, mockLibraries as initialMockLibraries } from './data';

export const USERS = [
  { id: 'u_jobs', name: '乔布斯 (产品)', status: 'online', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80' },
  { id: 'u1', name: '陈莎莎 (后端)', status: 'online', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80' },
  { id: 'u2', name: '马库斯 (前端)', status: 'busy', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80' },
  { id: 'u4', name: '艾琳娜 (测试)', status: 'offline', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80' },
];

// A recipient can only open a role-specific version after the document owner
// has explicitly applied that role.  Keeping this at the app level makes the
// state survive switching between a chat and the document workspace.
const USER_ROLE_BY_ID: Record<string, string> = {
  u1: 'backend',
  u2: 'frontend',
  u4: 'qa',
  u_jobs: 'product',
};

export default function App() {
  const [activeApp, setActiveApp] = useState<AppIdentifier>('messages');
  const [activeItemId, setActiveItemId] = useState<string | null>('c1');
  const [libraries, setLibraries] = useState<DocLibrary[]>(initialMockLibraries);
  const [isDirCollapsed, setIsDirCollapsed] = useState(false);
  const [chats, setChats] = useState<ChatItem[]>(initialMockChats);
  const [activeUserId, setActiveUserId] = useState<string>('u_jobs');
  const [appliedDerivations, setAppliedDerivations] = useState<Record<string, Set<string>>>({});
  const [comments, setComments] = useState<DocComment[]>([]);

  const handleShareDoc = (chatId: string, doc: DocItem) => {
    setChats(prev => prev.map(c => {
      if (c.id === chatId) {
        const messages = c.messages || [];
        return {
          ...c,
          messages: [...messages, {
            id: 'm_' + Date.now(),
            senderId: activeUserId,
            content: '我分享了一个文档给你，请查看。',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'shared_doc',
            docId: doc.id,
            docTitle: doc.title
          }],
          lastMessage: `[分享文档] ${doc.title}`
        };
      }
      return c;
    }));
    setActiveApp('messages');
    setActiveItemId(chatId);
  };

  const handleSendMessage = (chatId: string, content: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setChats(prev => prev.map(chat => chat.id === chatId ? {
      ...chat,
      messages: [...(chat.messages || []), {
        id: `m_${Date.now()}`,
        senderId: activeUserId,
        content,
        timestamp,
        type: 'text',
      }],
      lastMessage: content,
      timestamp,
      unreadCount: 0,
    } : chat));
  };

  const handleApplyDerivation = (docId: string, roleId: string, shouldApply: boolean) => {
    setAppliedDerivations(prev => {
      const next = { ...prev };
      const roles = new Set(next[docId] || []);
      if (shouldApply) roles.add(roleId);
      else roles.delete(roleId);
      next[docId] = roles;
      return next;
    });
  };

  const handleAddComment = (comment: Omit<DocComment, 'id' | 'createdAt'>) => {
    const createdAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isOwnerReply = comment.authorId === 'u_jobs' && Boolean(comment.recipientId);
    setComments(prev => [...prev, {
      ...comment,
      id: `comment_${Date.now()}`,
      createdAt,
      readByOwner: isOwnerReply,
      readByRecipient: isOwnerReply ? false : undefined,
    }]);
    const docTitle = libraries.flatMap(library => library.docs).find(doc => doc.id === comment.docId)?.title || '文档';
    const counterpartId = isOwnerReply ? comment.recipientId : comment.authorId;
    setChats(prev => prev.map(chat => chat.user.id === counterpartId ? {
      ...chat,
      lastMessage: `${isOwnerReply ? '[回复评论]' : '[文档评论]'} ${docTitle}`,
      timestamp: createdAt,
    } : chat));
  };

  const handleMarkCommentsRead = (docId: string, viewerId: string) => {
    setComments(prev => prev.map(comment => {
      if (comment.docId !== docId) return comment;
      if (viewerId === 'u_jobs' && comment.authorId !== 'u_jobs') return { ...comment, readByOwner: true };
      if (comment.authorId === 'u_jobs' && comment.recipientId === viewerId) return { ...comment, readByRecipient: true };
      return comment;
    }));
  };

  const currentUserRole = USER_ROLE_BY_ID[activeUserId];
  const selectedDocId = activeItemId?.split('|')[0];
  const initialDerivativeRole = activeApp === 'docs' && selectedDocId && currentUserRole && appliedDerivations[selectedDocId]?.has(currentUserRole)
    ? currentUserRole
    : null;

  const handleAddDoc = (libId: string, doc: DocItem) => {
    setLibraries(prev => prev.map(lib => {
      if (lib.id === libId) {
        return { ...lib, docs: [...lib.docs, doc] };
      }
      return lib;
    }));
    setActiveItemId(doc.id);
  };

  const handleSelectApp = (app: AppIdentifier) => {
    setActiveApp(app);
    setActiveItemId(null);
    setIsDirCollapsed(false);
  };

  const handleSwitchUser = (userId: string) => {
    setActiveUserId(userId);
    setActiveApp('messages');
    setActiveItemId(null);
    setIsDirCollapsed(false);
  };

  return (
    <div className="h-screen w-full flex bg-[#F7F8FA] overflow-hidden text-zinc-900 font-sans selection:bg-blue-100 selection:text-blue-900 antialiased">
      <Sidebar 
        activeApp={activeApp} 
        setActiveApp={handleSelectApp} 
        activeUserId={activeUserId}
        setActiveUserId={handleSwitchUser}
      />
      <Directory 
        activeApp={activeApp} 
        activeItemId={activeItemId} 
        setActiveItemId={setActiveItemId} 
        libraries={libraries}
        chats={chats}
        activeUserId={activeUserId}
        comments={comments}
        onMarkCommentsRead={handleMarkCommentsRead}
        appliedDerivations={appliedDerivations}
        isCollapsed={isDirCollapsed}
        setIsCollapsed={setIsDirCollapsed}
      />
      <Workspace 
        activeApp={activeApp} 
        activeItemId={activeItemId} 
        libraries={libraries}
        chats={chats}
        onAddDoc={handleAddDoc}
        onShareDoc={handleShareDoc}
        onSendMessage={handleSendMessage}
        activeUserId={activeUserId}
        initialDerivativeRole={initialDerivativeRole}
        appliedRoleIds={selectedDocId ? appliedDerivations[selectedDocId] || new Set<string>() : new Set<string>()}
        onApplyDerivation={handleApplyDerivation}
        comments={comments}
        onAddComment={handleAddComment}
        onMarkCommentsRead={handleMarkCommentsRead}
        isDirCollapsed={isDirCollapsed}
        setIsDirCollapsed={setIsDirCollapsed}
        setActiveApp={setActiveApp}
        setActiveItemId={setActiveItemId}
      />
    </div>
  );
}
