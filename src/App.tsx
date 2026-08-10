import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Directory } from './components/Directory';
import { Workspace } from './components/Workspace';
import { AppIdentifier, DocLibrary, DocItem, ChatItem, DocComment, DerivationSnapshot, GeneratedDerivation, ChallengeTask } from './types';
import { mockChats as initialMockChats, mockLibraries as initialMockLibraries } from './data';
import { readLocalDocuments, saveLocalDocument } from './lib/localDocumentStore';

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

const getLatestThreadAuthorId = (thread: DocComment) => thread.replies?.at(-1)?.authorId || thread.authorId;

const getReplyRecipientId = (thread: DocComment, authorId: string) => {
  const latestAuthorId = getLatestThreadAuthorId(thread);
  if (latestAuthorId !== authorId) return latestAuthorId;
  if (thread.authorId !== authorId) return thread.authorId;
  return thread.recipientId && thread.recipientId !== authorId ? thread.recipientId : 'u_jobs';
};

export default function App() {
  const [activeApp, setActiveApp] = useState<AppIdentifier>('messages');
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [libraries, setLibraries] = useState<DocLibrary[]>(initialMockLibraries);
  const [isDirCollapsed, setIsDirCollapsed] = useState(false);
  const [chats, setChats] = useState<ChatItem[]>(initialMockChats);
  const [activeUserId, setActiveUserId] = useState<string>('u_jobs');
  const [appliedDerivations, setAppliedDerivations] = useState<Record<string, Set<string>>>({});
  const [generatedDerivations, setGeneratedDerivations] = useState<Record<string, Set<string>>>({});
  const [generatedDerivationContents, setGeneratedDerivationContents] = useState<Record<string, Record<string, GeneratedDerivation>>>({});
  const [derivationSnapshots, setDerivationSnapshots] = useState<DerivationSnapshot[]>([]);
  // Comments are real user-created workspace state.  Do not pre-seed them:
  // a newly opened mock document should look unused.
  const [comments, setComments] = useState<DocComment[]>([]);
  const [challengeTasks, setChallengeTasks] = useState<ChallengeTask[]>([]);
  const [taskEntryUnreadCount, setTaskEntryUnreadCount] = useState(0);
  const [taskPulseKey, setTaskPulseKey] = useState(0);

  // A visitor's imported documents (including their embedded images) live in
  // their own browser. They are never shared with another visitor or sent to
  // the derivation API as image data.
  useEffect(() => {
    let cancelled = false;
    readLocalDocuments()
      .then(records => {
        if (cancelled || !records.length) return;
        setLibraries(previous => previous.map(library => {
          const additions = records
            .filter(record => record.libraryId === library.id && !library.docs.some(doc => doc.id === record.document.id))
            .map(record => record.document);
          return additions.length ? { ...library, docs: [...library.docs, ...additions] } : library;
        }));
      })
      // Private-browser persistence is an enhancement; the document still
      // works during this session when storage is unavailable.
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/challenge-tasks')
      .then(response => response.ok ? response.json() : Promise.reject(new Error('无法读取任务')))
      .then(data => {
        if (cancelled || !Array.isArray(data.tasks)) return;
        const docs = initialMockLibraries.flatMap(library => library.docs);
        setChallengeTasks(data.tasks.map((task: { id: string; source_document_id: string; role_name: string; content: string; status: 'open' | 'resolved'; created_at: string }) => ({
          id: task.id,
          docId: task.source_document_id,
          docTitle: docs.find(doc => doc.id === task.source_document_id)?.title || '文档',
          roleName: task.role_name,
          content: task.content,
          createdAt: new Date(task.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          unread: false,
          status: task.status,
        })));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const handleAddChallengeTask = useCallback((task: Omit<ChallengeTask, 'createdAt' | 'unread' | 'status'>) => {
    setChallengeTasks(previous => {
      if (previous.some(item => item.id === task.id)) return previous;
      return [...previous, {
        ...task,
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        unread: true,
        status: 'open',
      }];
    });
    setTaskEntryUnreadCount(count => count + 1);
    setTaskPulseKey(key => key + 1);
  }, []);
  const handleMarkChallengeTaskRead = useCallback((taskId: string) => setChallengeTasks(previous => previous.map(task => task.id === taskId ? { ...task, unread: false } : task)), []);
  const handleResolveChallengeTask = useCallback(async (taskId: string) => {
    const response = await fetch('/api/challenge-tasks', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId, status: 'resolved' }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '更新任务失败');
    setChallengeTasks(previous => previous.map(task => task.id === taskId ? { ...task, unread: false, status: 'resolved' } : task));
  }, []);

  const handleShareDoc = (chatIds: string[], doc: DocItem) => {
    const selectedChats = chats.filter(chat => chatIds.includes(chat.id) && chat.user.id !== activeUserId);
    if (!selectedChats.length) return;
    setChats(prev => {
      let next = prev;
      for (const selectedChat of selectedChats) {
        const recipientId = selectedChat.user.id;
        const participantIds = [activeUserId, recipientId].sort();
        const existingDirectChat = next.find(chat => (chat.participantIds || ['u_jobs', chat.user.id]).slice().sort().join(':') === participantIds.join(':'));
        const targetChatId = existingDirectChat?.id || `direct-${participantIds.join('-')}`;
        const message = {
          id: `m_${Date.now()}_${targetChatId}`,
          senderId: activeUserId,
          content: '我分享了一个文档给你，请查看。',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'shared_doc' as const,
          docId: doc.id,
          docTitle: doc.title,
          recipientId,
          readByUserIds: [activeUserId],
        };
        if (existingDirectChat) {
          next = next.map(chat => chat.id === targetChatId ? { ...chat, messages: [...(chat.messages || []), message], lastMessage: `[分享文档] ${doc.title}`, timestamp: message.timestamp } : chat);
        } else {
          next = [...next, { id: targetChatId, user: selectedChat.user, participantIds, lastMessage: `[分享文档] ${doc.title}`, timestamp: message.timestamp, unreadCount: 0, messages: [message] }];
        }
      }
      return next;
    });
  };

  const handleSendMessage = (chatId: string, content: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setChats(prev => prev.map(chat => chat.id === chatId ? {
      ...chat,
      // Reply to the actual participant in the latest message. This matters
      // when a document has been forwarded by someone other than its owner.
      // Falling back to the legacy chat owner keeps the seeded demo chats working.
      messages: [...(chat.messages || []), {
        id: `m_${Date.now()}`,
        senderId: activeUserId,
        recipientId: (() => {
          const latest = [...(chat.messages || [])].reverse()[0];
          if (latest) return latest.senderId === activeUserId ? latest.recipientId || chat.user.id : latest.senderId;
          return chat.user.id === activeUserId ? 'u_jobs' : chat.user.id;
        })(),
        content,
        timestamp,
        type: 'text',
        readByUserIds: [activeUserId],
      }],
      lastMessage: content,
      timestamp,
      unreadCount: 0,
    } : chat));
  };

  const handleMarkChatRead = (chatId: string, viewerId: string) => {
    setChats(prev => {
      let changed = false;
      const next = prev.map(chat => chat.id !== chatId ? chat : {
        ...chat,
        messages: (chat.messages || []).map(message => {
          if (message.recipientId !== viewerId || message.readByUserIds?.includes(viewerId)) return message;
          changed = true;
          return { ...message, readByUserIds: [...(message.readByUserIds || []), viewerId] };
        }),
      });
      return changed ? next : prev;
    });
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

  const handleGeneratedDerivation = useCallback((docId: string, roleId: string) => {
    setGeneratedDerivations(previous => {
      const next = { ...previous };
      next[docId] = new Set(next[docId] || []);
      next[docId].add(roleId);
      return next;
    });
  }, []);

  const handleRecordDerivationSnapshot = useCallback((snapshot: Omit<DerivationSnapshot, 'id' | 'createdAt'>) => {
    setDerivationSnapshots(previous => [...previous, {
      ...snapshot,
      id: `snapshot_${Date.now()}_${snapshot.roleId}`,
      createdAt: new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    }]);
  }, []);

  const handleStoreGeneratedDerivation = useCallback((docId: string, roleId: string, derivation: GeneratedDerivation) => {
    setGeneratedDerivationContents(previous => ({
      ...previous,
      [docId]: { ...(previous[docId] || {}), [roleId]: derivation },
    }));
  }, []);

  const handleAddComment = (comment: Omit<DocComment, 'id' | 'createdAt'>) => {
    const createdAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (!comment.replyToId && comment.authorId !== activeUserId && comment.recipientId === activeUserId) {
      setTaskEntryUnreadCount(count => count + 1);
      setTaskPulseKey(key => key + 1);
    }
    if (comment.replyToId) {
      const thread = comments.find(item => item.id === comment.replyToId);
      const recipientId = thread ? getReplyRecipientId(thread, comment.authorId) : comment.recipientId || 'u_jobs';
      setComments(prev => prev.map(item => item.id !== comment.replyToId ? item : {
        ...item,
        readByOwner: recipientId !== 'u_jobs',
        readByRecipient: recipientId === 'u_jobs',
        replies: [...(item.replies || []), { id: `reply_${Date.now()}`, authorId: comment.authorId, content: comment.content, createdAt }],
      }));
      const docTitle = libraries.flatMap(library => library.docs).find(doc => doc.id === comment.docId)?.title || '文档';
      setChats(prev => prev.map(chat => chat.user.id === recipientId ? {
        ...chat,
        lastMessage: `[回复评论] ${docTitle}`,
        timestamp: createdAt,
      } : chat));
      return;
    } else {
      setComments(prev => [...prev, {
        ...comment,
        id: `comment_${Date.now()}`,
        createdAt,
        readByOwner: comment.authorId === 'u_jobs',
        readByRecipient: comment.authorId === 'u_jobs' ? false : undefined,
      }]);
    }
    const docTitle = libraries.flatMap(library => library.docs).find(doc => doc.id === comment.docId)?.title || '文档';
    const counterpartId = comment.authorId === 'u_jobs' ? comment.recipientId : comment.authorId;
    setChats(prev => prev.map(chat => chat.user.id === counterpartId ? {
      ...chat,
      lastMessage: `[文档评论] ${docTitle}`,
      timestamp: createdAt,
    } : chat));
  };

  const handleMarkCommentsRead = (docId: string, viewerId: string) => {
    setComments(prev => prev.map(comment => {
      if (comment.docId !== docId) return comment;
      if (viewerId === 'u_jobs') return { ...comment, readByOwner: true };
      if (getLatestThreadAuthorId(comment) !== viewerId) return { ...comment, readByRecipient: true };
      return comment;
    }));
  };

  const handleReplyToComment = (commentId: string, content: string) => {
    const value = content.trim();
    if (!value) return;
    const thread = comments.find(comment => comment.id === commentId);
    if (!thread) return;
    const recipientId = getReplyRecipientId(thread, activeUserId);
    const createdAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setComments(previous => previous.map(comment => comment.id !== commentId ? comment : {
      ...comment,
      readByOwner: recipientId !== 'u_jobs',
      readByRecipient: recipientId === 'u_jobs',
      replies: [...(comment.replies || []), { id: `reply_${Date.now()}`, authorId: activeUserId, content: value, createdAt }],
    }));
    const docTitle = libraries.flatMap(library => library.docs).find(doc => doc.id === thread.docId)?.title || '文档';
    setChats(previous => previous.map(chat => chat.user.id === recipientId ? { ...chat, lastMessage: `[回复评论] ${docTitle}`, timestamp: createdAt } : chat));
  };

  const handleResolveComment = (commentId: string) => setComments(previous => previous.map(comment => comment.id === commentId ? { ...comment, status: 'resolved', resolvedById: activeUserId } : comment));
  const handleDeleteCommentRecord = (commentId: string) => setComments(previous => previous.filter(comment => comment.id !== commentId));

  const currentUserRole = USER_ROLE_BY_ID[activeUserId];
  // Both the document library (`d1|backend`) and a review route
  // (`review:d1:u1`) ultimately point to the same source document.
  const selectedDocId = activeItemId?.startsWith('review:')
    ? activeItemId.split(':')[1]
    : activeItemId?.split('|')[0];
  // A role view is intentionally not exposed merely because it exists. The
  // matching member must have received the document, and the owner must have
  // both generated and applied that exact role view.
  const hasReceivedDocumentLink = Boolean(selectedDocId && chats.some(chat =>
    chat.messages?.some(message =>
      message.type === 'shared_doc' && message.docId === selectedDocId && message.recipientId === activeUserId
    )
  ));
  const hasGeneratedAndAppliedRole = Boolean(selectedDocId && currentUserRole &&
    generatedDerivations[selectedDocId]?.has(currentUserRole) &&
    appliedDerivations[selectedDocId]?.has(currentUserRole));
  const initialDerivativeRole = activeApp === 'docs' && selectedDocId && currentUserRole && hasReceivedDocumentLink && hasGeneratedAndAppliedRole
    ? currentUserRole
    : null;

  const handleAddDoc = (libId: string, doc: DocItem) => {
    setLibraries(prev => prev.map(lib => {
      if (lib.id === libId) {
        return { ...lib, docs: [...lib.docs, doc] };
      }
      return lib;
    }));
    if (doc.isLocalFile) saveLocalDocument({ libraryId: libId, document: doc }).catch(() => undefined);
    setActiveItemId(doc.id);
  };
  const handleAddLibrary = (name: string) => {
    const library: DocLibrary = { id: `lib-new-${Date.now()}`, name, docs: [] };
    setLibraries(previous => [library, ...previous]);
    setActiveItemId(null);
  };
  const handleUpdateDoc = (docId: string, patch: Partial<DocItem>) => setLibraries(prev => prev.map(library => ({ ...library, docs: library.docs.map(doc => {
    if (doc.id !== docId) return doc;
    const updated = { ...doc, ...patch, updatedAt: '刚刚' };
    if (updated.isLocalFile) saveLocalDocument({ libraryId: library.id, document: updated }).catch(() => undefined);
    return updated;
  }) })));

  const handleSelectApp = (app: AppIdentifier) => {
    setActiveApp(app);
    setActiveItemId(null);
    setIsDirCollapsed(false);
    if (app === 'tasks') setTaskEntryUnreadCount(0);
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
        taskUnreadCount={taskEntryUnreadCount}
        taskPulseKey={taskPulseKey}
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
        generatedDerivations={generatedDerivations}
        isCollapsed={isDirCollapsed}
        setIsCollapsed={setIsDirCollapsed}
      />
      <Workspace 
        activeApp={activeApp} 
        activeItemId={activeItemId} 
        libraries={libraries}
        chats={chats}
        onAddDoc={handleAddDoc}
        onAddLibrary={handleAddLibrary}
        onUpdateDoc={handleUpdateDoc}
        onShareDoc={handleShareDoc}
        onSendMessage={handleSendMessage}
        onMarkChatRead={handleMarkChatRead}
        activeUserId={activeUserId}
        initialDerivativeRole={initialDerivativeRole}
        appliedRoleIds={selectedDocId ? appliedDerivations[selectedDocId] || new Set<string>() : new Set<string>()}
        onApplyDerivation={handleApplyDerivation}
        onGeneratedDerivation={handleGeneratedDerivation}
        generatedDerivationContents={generatedDerivationContents}
        onStoreGeneratedDerivation={handleStoreGeneratedDerivation}
        derivationSnapshots={derivationSnapshots}
        onRecordDerivationSnapshot={handleRecordDerivationSnapshot}
        comments={comments}
        onAddComment={handleAddComment}
        onMarkCommentsRead={handleMarkCommentsRead}
        onReplyToComment={handleReplyToComment}
        onResolveComment={handleResolveComment}
        onDeleteCommentRecord={handleDeleteCommentRecord}
        challengeTasks={challengeTasks}
        onAddChallengeTask={handleAddChallengeTask}
        onMarkChallengeTaskRead={handleMarkChallengeTaskRead}
        onResolveChallengeTask={handleResolveChallengeTask}
        isDirCollapsed={isDirCollapsed}
        setIsDirCollapsed={setIsDirCollapsed}
        setActiveApp={setActiveApp}
        setActiveItemId={setActiveItemId}
      />
    </div>
  );
}
