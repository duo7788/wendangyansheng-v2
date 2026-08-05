import { motion, AnimatePresence } from 'motion/react';
import { AppIdentifier, DocLibrary, DocItem, ChatItem, DocComment } from '../types';
import { ChatWorkspace } from './chat/ChatWorkspace';
import { DocWorkspace } from './docs/DocWorkspace';
import { DocEmptyState } from './docs/DocEmptyState';
import { Inbox, PanelLeftOpen } from 'lucide-react';

interface WorkspaceProps {
  activeApp: AppIdentifier;
  activeItemId: string | null;
  libraries: DocLibrary[];
  chats: ChatItem[];
  onAddDoc: (libId: string, doc: DocItem) => void;
  onShareDoc: (chatId: string, doc: DocItem) => void;
  onSendMessage: (chatId: string, content: string) => void;
  activeUserId: string;
  initialDerivativeRole: string | null;
  appliedRoleIds: Set<string>;
  onApplyDerivation: (docId: string, roleId: string, shouldApply: boolean) => void;
  comments: DocComment[];
  onAddComment: (comment: Omit<DocComment, 'id' | 'createdAt'>) => void;
  onMarkCommentsRead: (docId: string, authorId: string) => void;
  isDirCollapsed: boolean;
  setIsDirCollapsed: (collapsed: boolean) => void;
  setActiveApp: (app: AppIdentifier) => void;
  setActiveItemId: (id: string | null) => void;
}

export function Workspace({ activeApp, activeItemId, libraries, chats, onAddDoc, onShareDoc, onSendMessage, activeUserId, initialDerivativeRole, appliedRoleIds, onApplyDerivation, comments, onAddComment, onMarkCommentsRead, isDirCollapsed, setIsDirCollapsed, setActiveApp, setActiveItemId }: WorkspaceProps) {
  
  const renderContent = () => {
    const reviewMatch = activeItemId?.match(/^review:([^:]+):([^:]+)$/);
    if (activeApp === 'messages' && reviewMatch) {
      const doc = libraries.flatMap(library => library.docs).find(item => item.id === reviewMatch[1]);
      const reviewerRole = reviewMatch[2] === 'u1' ? 'backend' : undefined;
      if (doc) return <DocWorkspace doc={doc} libraries={libraries} chats={chats} onShareDoc={onShareDoc} isDirCollapsed={isDirCollapsed} setIsDirCollapsed={setIsDirCollapsed} initialRoleId={reviewerRole} appliedRoleIds={appliedRoleIds} onApplyDerivation={onApplyDerivation} canManageDerivations={true} comments={comments.filter(comment => comment.docId === doc.id && comment.authorId === reviewMatch[2])} onAddComment={onAddComment} activeUserId={activeUserId} reviewMode />;
    }
    if (!activeItemId) {
      if (activeApp === 'docs') {
        return <DocEmptyState libraries={libraries} onAddDoc={onAddDoc} />;
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
      if (chat) return <ChatWorkspace chat={chat} activeUserId={activeUserId} setActiveApp={setActiveApp} setActiveItemId={setActiveItemId} onSendMessage={onSendMessage} />;
    }

    if (activeApp === 'docs') {
      const allDocs = libraries.flatMap(lib => lib.docs);
      const [actualDocId, roleId] = activeItemId.split('|');
      const doc = allDocs.find(d => d.id === actualDocId);
      if (doc) return <DocWorkspace doc={doc} libraries={libraries} chats={chats} onShareDoc={onShareDoc} isDirCollapsed={isDirCollapsed} setIsDirCollapsed={setIsDirCollapsed} initialRoleId={initialDerivativeRole || roleId} appliedRoleIds={appliedRoleIds} onApplyDerivation={onApplyDerivation} canManageDerivations={activeUserId === 'u_jobs'} comments={comments.filter(comment => comment.docId === doc.id)} onAddComment={onAddComment} activeUserId={activeUserId} />;
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
