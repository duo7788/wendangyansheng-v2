import { motion, AnimatePresence } from 'motion/react';
import { AppIdentifier, DocLibrary, DocItem, ChatItem, DocComment, DerivationSnapshot, GeneratedDerivation, ChallengeTask } from '../types';
import { ChatWorkspace } from './chat/ChatWorkspace';
import { DocWorkspace } from './docs/DocWorkspace';
import { DocEmptyState } from './docs/DocEmptyState';
import { Inbox, PanelLeftOpen } from 'lucide-react';
import { TaskWorkspace } from './tasks/TaskWorkspace';

const ROLE_BY_USER_ID: Record<string, string> = {
  u1: 'backend',
  u2: 'frontend',
  u4: 'qa',
};

interface WorkspaceProps {
  activeApp: AppIdentifier;
  activeItemId: string | null;
  libraries: DocLibrary[];
  chats: ChatItem[];
  onAddDoc: (libId: string, doc: DocItem) => void;
  onAddLibrary: (name: string) => void;
  onUpdateDoc: (docId: string, patch: Partial<DocItem>) => void;
  onShareDoc: (chatIds: string[], doc: DocItem) => void;
  onSendMessage: (chatId: string, content: string) => void;
  onMarkChatRead: (chatId: string, viewerId: string) => void;
  activeUserId: string;
  initialDerivativeRole: string | null;
  appliedRoleIds: Set<string>;
  onApplyDerivation: (docId: string, roleId: string, shouldApply: boolean) => void;
  onGeneratedDerivation: (docId: string, roleId: string) => void;
  generatedDerivationContents: Record<string, Record<string, GeneratedDerivation>>;
  onStoreGeneratedDerivation: (docId: string, roleId: string, derivation: GeneratedDerivation) => void;
  derivationSnapshots: DerivationSnapshot[];
  onRecordDerivationSnapshot: (snapshot: Omit<DerivationSnapshot, 'id' | 'createdAt'>) => void;
  comments: DocComment[];
  onAddComment: (comment: Omit<DocComment, 'id' | 'createdAt'>) => void;
  onMarkCommentsRead: (docId: string, viewerId: string) => void;
  onReplyToComment: (commentId: string, content: string) => void;
  onResolveComment: (commentId: string) => void;
  onDeleteCommentRecord: (commentId: string) => void;
  challengeTasks: ChallengeTask[];
  onAddChallengeTask: (task: Omit<ChallengeTask, 'createdAt' | 'unread' | 'status'>) => void;
  onMarkChallengeTaskRead: (taskId: string) => void;
  onResolveChallengeTask: (taskId: string) => Promise<void>;
  isDirCollapsed: boolean;
  setIsDirCollapsed: (collapsed: boolean) => void;
  setActiveApp: (app: AppIdentifier) => void;
  setActiveItemId: (id: string | null) => void;
}

export function Workspace({ activeApp, activeItemId, libraries, chats, onAddDoc, onAddLibrary, onUpdateDoc, onShareDoc, onSendMessage, onMarkChatRead, activeUserId, initialDerivativeRole, appliedRoleIds, onApplyDerivation, onGeneratedDerivation, generatedDerivationContents, onStoreGeneratedDerivation, derivationSnapshots, onRecordDerivationSnapshot, comments, onAddComment, onMarkCommentsRead, onReplyToComment, onResolveComment, onDeleteCommentRecord, challengeTasks, onAddChallengeTask, onMarkChallengeTaskRead, onResolveChallengeTask, isDirCollapsed, setIsDirCollapsed, setActiveApp, setActiveItemId }: WorkspaceProps) {
  
  const renderContent = () => {
    if (activeApp === 'tasks') return <TaskWorkspace comments={comments} libraries={libraries} activeUserId={activeUserId} onReply={onReplyToComment} onResolve={onResolveComment} onDelete={onDeleteCommentRecord} challengeTasks={challengeTasks} onMarkChallengeTaskRead={onMarkChallengeTaskRead} onResolveChallengeTask={onResolveChallengeTask} />;
    const reviewMatch = activeItemId?.match(/^review:([^:]+):([^:]+)$/);
    if (activeApp === 'messages' && reviewMatch) {
      const doc = libraries.flatMap(library => library.docs).find(item => item.id === reviewMatch[1]);
      const reviewerRole = ROLE_BY_USER_ID[reviewMatch[2]];
      // A shared original stays an original. Only expose a role view when the
      // owner has generated it, applied it, and shared this document with the
      // receiving role. A comment notification alone must never unlock it.
      const canOpenRoleView = Boolean(reviewerRole &&
        appliedRoleIds.has(reviewerRole) &&
        generatedDerivationContents[reviewMatch[1]]?.[reviewerRole] &&
        chats.some(chat => chat.messages?.some(message =>
          message.type === 'shared_doc' &&
          message.docId === reviewMatch[1] &&
          message.recipientId === reviewMatch[2]
        )));
      // A comment is document state.  Review, chat and document-library entry
      // points must therefore pass the exact same document-wide thread set.
      if (doc) return <DocWorkspace doc={doc} libraries={libraries} chats={chats} onShareDoc={onShareDoc} isDirCollapsed={isDirCollapsed} setIsDirCollapsed={setIsDirCollapsed} initialRoleId={canOpenRoleView ? reviewerRole : undefined} appliedRoleIds={appliedRoleIds} onApplyDerivation={onApplyDerivation} onGeneratedDerivation={onGeneratedDerivation} storedDerivations={generatedDerivationContents[doc.id] || {}} onStoreGeneratedDerivation={onStoreGeneratedDerivation} derivationSnapshots={derivationSnapshots.filter(snapshot => snapshot.docId === doc.id)} onRecordDerivationSnapshot={onRecordDerivationSnapshot} canManageDerivations={activeUserId === 'u_jobs'} comments={comments.filter(comment => comment.docId === doc.id)} onAddComment={onAddComment} onResolveComment={onResolveComment} activeUserId={activeUserId} onAddChallengeTask={onAddChallengeTask} reviewMode />;
    }
    if (!activeItemId) {
      if (activeApp === 'docs') {
        return <DocEmptyState libraries={libraries} onAddDoc={onAddDoc} onAddLibrary={onAddLibrary} />;
      }
      if (activeApp === 'messages') {
        return (
          <div className="relative flex flex-1 flex-col items-center overflow-hidden bg-white text-center">
            <div className="relative z-10 pt-[25.5vh]">
              <h3 className="text-[20px] font-semibold tracking-tight text-zinc-950">元气满满地开启一天的工作吧</h3>
              <p className="mt-5 text-[15px] font-normal tracking-tight text-zinc-400">左侧快捷入口，方便你与团队沟通、文档协作</p>
            </div>

            <svg
              aria-hidden="true"
              viewBox="0 0 1339 554"
              preserveAspectRatio="xMidYMin meet"
              className="pointer-events-none absolute left-1/2 top-[46.3%] h-auto w-[min(1339px,100vw)] min-w-[1120px] -translate-x-1/2 text-zinc-300"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1.5 335C86.5 243.167 339.6 60.2999 672 63.4999C1004.4 66.6999 1255.17 240.833 1339 327.5" />
              <path d="M96.5 252.5H1246.5" />
              <path d="M672.5 572.36L672.5 64.3601" />
              <path d="M1 555.86C63.6667 395.027 285.6 71.5602 672 64.3602C1058.4 57.1602 1295.67 416.027 1366 596.36" />
              <path d="M171 563.36C213.333 402.193 372.8 76.56 672 63.36C971.2 50.16 1165.67 460.86 1225.5 667.86" />
              <path d="M421.5 562.86C443.167 401.86 523.8 76.5601 673 63.3601C822.2 50.1601 905.833 403.193 929 581.36" />
              <path d="M0 448.86H1341" />
            </svg>
          </div>
        );
      }
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-white">
          <div className="w-16 h-16 bg-zinc-50 rounded-2xl flex items-center justify-center border border-zinc-100 mb-4 text-zinc-300">
            <Inbox size={32} strokeWidth={1.5} />
          </div>
          <h3 className="text-lg font-medium text-zinc-900 mb-1">未选择任何项目</h3>
          <p className="text-sm text-zinc-500">请从左侧目录中选择一个项目以查看其内容。</p>
        </div>
      );
    }

    if (activeApp === 'messages') {
      const chat = chats.find(c => c.id === activeItemId);
      if (chat) return <ChatWorkspace chat={chat} activeUserId={activeUserId} setActiveApp={setActiveApp} setActiveItemId={setActiveItemId} onSendMessage={onSendMessage} onMarkChatRead={onMarkChatRead} />;
    }

    if (activeApp === 'docs') {
      const allDocs = libraries.flatMap(lib => lib.docs);
      const [actualDocId, roleId] = activeItemId.split('|');
      const doc = allDocs.find(d => d.id === actualDocId);
      const library = libraries.find(item => item.docs.some(item => item.id === actualDocId));
      if (doc) return <DocWorkspace doc={doc} libraryName={library?.name} onUpdateDoc={onUpdateDoc} libraries={libraries} chats={chats} onShareDoc={onShareDoc} isDirCollapsed={isDirCollapsed} setIsDirCollapsed={setIsDirCollapsed} initialRoleId={initialDerivativeRole || roleId} appliedRoleIds={appliedRoleIds} onApplyDerivation={onApplyDerivation} onGeneratedDerivation={onGeneratedDerivation} storedDerivations={generatedDerivationContents[doc.id] || {}} onStoreGeneratedDerivation={onStoreGeneratedDerivation} derivationSnapshots={derivationSnapshots.filter(snapshot => snapshot.docId === doc.id)} onRecordDerivationSnapshot={onRecordDerivationSnapshot} canManageDerivations={activeUserId === 'u_jobs'} comments={comments.filter(comment => comment.docId === doc.id)} onAddComment={onAddComment} onResolveComment={onResolveComment} activeUserId={activeUserId} onAddChallengeTask={onAddChallengeTask} />;
    }

    return (
      <div className="flex-1 flex items-center justify-center bg-white text-zinc-400">
        <p>该模块正在建设中。</p>
      </div>
    );
  };

  return (
    <div className="flex-1 bg-white relative overflow-hidden flex flex-col">
      <AnimatePresence mode="wait">
        <motion.div
          key={`${activeApp}-${activeItemId}-${activeUserId}`}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute inset-0 flex flex-col"
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
