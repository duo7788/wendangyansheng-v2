import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Folder, File, FileSpreadsheet, Presentation, ChevronRight, ChevronDown, PanelLeftClose, MessageSquare, Sparkles } from 'lucide-react';
import { AppIdentifier, DocLibrary, ChatItem, DocComment } from '../types';
import { USERS } from '../App';

interface DirectoryProps {
  activeApp: AppIdentifier;
  activeItemId: string | null;
  setActiveItemId: (id: string | null) => void;
  libraries?: DocLibrary[];
  chats?: ChatItem[];
  activeUserId: string;
  comments: DocComment[];
  onMarkCommentsRead: (docId: string, viewerId: string) => void;
  appliedDerivations: Record<string, Set<string>>;
  generatedDerivations: Record<string, Set<string>>;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export function Directory({ activeApp, activeItemId, setActiveItemId, libraries = [], chats = [], activeUserId, comments, onMarkCommentsRead, appliedDerivations, generatedDerivations, isCollapsed, setIsCollapsed }: DirectoryProps) {
  const [expandedLibs, setExpandedLibs] = useState<Record<string, boolean>>({
    'lib1': true,
    'lib2': true,
    'lib3': true,
  });
  const [expandedDerivations, setExpandedDerivations] = useState<Record<string, boolean>>({});
  const roleNames: Record<string, string> = { backend: '后端工程师', frontend: '前端工程师', qa: '测试工程师', ui: 'UI 设计师' };

  const toggleLib = (libId: string) => {
    setExpandedLibs(prev => ({ ...prev, [libId]: !prev[libId] }));
  };
  
  const renderHeader = () => {
    switch (activeApp) {
      case 'messages': return '消息';
      case 'docs': return '文档';
      case 'calendar': return '日历';
      case 'tasks': return '任务';
    }
  };

  const getDocIcon = (type: string) => {
    switch (type) {
      case 'folder': return <Folder size={18} className="text-zinc-400" />;
      case 'spreadsheet': return <FileSpreadsheet size={18} className="text-emerald-500" />;
      case 'presentation': return <Presentation size={18} className="text-amber-500" />;
      default: return <File size={18} className="text-blue-500" />;
    }
  };

  const actualItemId = activeItemId ? activeItemId.split('|')[0] : null;
  // A member only sees their direct conversation with the document owner.
  // The owner sees all conversations they participate in.
  const visibleChats = chats.filter(chat => (chat.participantIds || ['u_jobs', chat.user.id]).includes(activeUserId));

  return (
    <motion.div 
      initial={false}
      animate={{ width: isCollapsed ? 0 : 320, opacity: isCollapsed ? 0 : 1 }}
      className="bg-[#F7F8FA] border-r border-zinc-200/80 shrink-0 h-full overflow-hidden flex flex-col"
    >
      <div className="w-[320px] h-full flex flex-col">
        <div className="px-5 pt-7 pb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-900 tracking-tight">{renderHeader()}</h2>
          <button 
            onClick={() => setIsCollapsed(true)} 
            className="text-zinc-400 hover:text-zinc-700 transition-colors p-1 rounded-md hover:bg-zinc-200/50"
            title="收起侧边栏"
          >
            <PanelLeftClose size={20} />
          </button>
        </div>

        <div className="px-5 pb-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" strokeWidth={2.5} />
            <input
              type="text"
              placeholder="搜索..."
              className="w-full bg-zinc-200/50 text-sm text-zinc-900 placeholder:text-zinc-500 rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:bg-white transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-hide">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeApp}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col gap-1"
            >
            {activeApp === 'messages' && visibleChats.map((chat) => (
              (() => {
                const isOwner = activeUserId === 'u_jobs';
                const latestMessage = [...(chat.messages || [])].reverse()[0];
                const partnerId = latestMessage
                  ? latestMessage.senderId === activeUserId
                    ? latestMessage.recipientId || chat.user.id
                    : latestMessage.senderId
                  : !isOwner && chat.user.id === activeUserId
                    ? 'u_jobs'
                    : chat.user.id;
                const displayUser = USERS.find(user => user.id === partnerId) || chat.user;
                const unreadCount = (chat.messages || []).filter(message =>
                  message.recipientId === activeUserId && !message.readByUserIds?.includes(activeUserId)
                ).length;
                const unreadEvents = isOwner
                  ? comments.filter(comment => comment.authorId === chat.user.id && !comment.readByOwner)
                  : chat.user.id === activeUserId
                    ? comments.filter(comment => comment.authorId === 'u_jobs' && comment.recipientId === activeUserId && !comment.readByRecipient)
                    : [];
                const commentGroups = Array.from(new Map(unreadEvents.map(comment => [comment.docId, comment])).values());
                return <div key={chat.id}>
                <button
                key={chat.id}
                onClick={() => setActiveItemId(chat.id)}
                className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all ${
                  actualItemId === chat.id
                    ? 'bg-zinc-200/60'
                    : 'hover:bg-zinc-200/40'
                }`}
              >
                <div className="relative shrink-0">
                  <img src={displayUser.avatar} alt={displayUser.name} className="w-11 h-11 rounded-full object-cover" />
                  {(chat.user.id === activeUserId || chat.user.status === 'online') && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></div>
                  )}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <span className="text-sm font-semibold text-zinc-900 truncate">{displayUser.name}</span>
                    <span className="text-xs text-zinc-500 shrink-0">{chat.timestamp}</span>
                  </div>
                  <p className="text-sm text-zinc-500 truncate">{chat.lastMessage}</p>
                </div>
                {unreadCount > 0 && (
                  <div className="mt-1 flex items-center justify-center w-5 h-5 bg-blue-600 rounded-full text-[10px] font-bold text-white shrink-0">
                    {unreadCount}
                  </div>
                )}
              </button>
              {commentGroups.map(comment => {
                const doc = libraries.flatMap(library => library.docs).find(item => item.id === comment.docId);
                const unreadCount = unreadEvents.filter(item => item.docId === comment.docId).length;
                const reviewerId = isOwner ? chat.user.id : activeUserId;
                return <button key={`review-${comment.docId}`} onClick={() => { onMarkCommentsRead(comment.docId, activeUserId); setActiveItemId(`review:${comment.docId}:${reviewerId}`); }} className={`relative ml-8 mt-1 w-[calc(100%-2rem)] flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-all ${activeItemId === `review:${comment.docId}:${reviewerId}` ? 'bg-indigo-50 text-indigo-800' : 'text-zinc-600 hover:bg-zinc-100/80'}`}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600"><MessageSquare size={14} /></span>
                  <span className="truncate flex-1 font-medium">{doc?.title || '文档评论'}</span>
                  {unreadCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#F7F8FA] bg-rose-500 px-1 text-[10px] font-bold text-white">{unreadCount}</span>}
                </button>;
              })}
              </div>;
              })()
            ))}

            {activeApp === 'docs' && libraries.map((lib) => (
              <div key={lib.id} className="mb-2">
                <button
                  onClick={() => toggleLib(lib.id)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-zinc-200/40 text-left transition-colors text-zinc-700 font-medium text-sm"
                >
                  {expandedLibs[lib.id] ? <ChevronDown size={16} className="text-zinc-400 shrink-0" /> : <ChevronRight size={16} className="text-zinc-400 shrink-0" />}
                  <Folder size={16} className="text-zinc-400 shrink-0" />
                  <span className="truncate">{lib.name}</span>
                </button>
                <AnimatePresence>
                  {expandedLibs[lib.id] && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden flex flex-col gap-0.5 mt-1"
                    >
                      {lib.docs.map((doc) => {
                        const appliedRoles = appliedDerivations[doc.id] || new Set<string>();
                        const generatedRoles = generatedDerivations[doc.id] || appliedRoles;
                        return <div key={doc.id}>
                        <button
                          onClick={() => setActiveItemId(doc.id)}
                          className={`w-full flex items-center gap-3 p-2.5 pl-8 rounded-xl text-left transition-all ${
                            actualItemId === doc.id
                              ? 'bg-zinc-200/60'
                              : 'hover:bg-zinc-200/40'
                          }`}
                        >
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${actualItemId === doc.id ? 'bg-white/60' : 'bg-zinc-200/50'}`}>
                            {getDocIcon(doc.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-zinc-900 truncate">{doc.title}</h4>
                            <p className="text-xs text-zinc-500 truncate mt-0.5">修改于 {doc.updatedAt}</p>
                          </div>
                        </button>
                        {activeUserId === 'u_jobs' && generatedRoles.size > 0 && (
                          <div className="ml-8 mt-0.5">
                            <button onClick={() => setExpandedDerivations(prev => ({ ...prev, [doc.id]: !prev[doc.id] }))} className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-zinc-500 hover:text-indigo-700">
                              {expandedDerivations[doc.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              <Sparkles size={12} className="text-indigo-500" />
                              {generatedRoles.size} 个衍生文档 · 已应用 {appliedRoles.size} 个
                            </button>
                            <AnimatePresence>
                              {expandedDerivations[doc.id] && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden pl-4">
                                {Array.from(appliedRoles).map(roleId => <button key={roleId} onClick={() => setActiveItemId(`${doc.id}|${roleId}`)} className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${activeItemId === `${doc.id}|${roleId}` ? 'bg-indigo-50 text-indigo-700' : 'text-zinc-500 hover:bg-zinc-100'}`}><Sparkles size={12} /><span className="truncate">{roleNames[roleId] || '自定义角色'} · 衍生文档</span></button>)}
                              </motion.div>}
                            </AnimatePresence>
                          </div>
                        )}
                        </div>;
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

            {(activeApp === 'calendar' || activeApp === 'tasks') && (
              <div className="flex flex-col items-center justify-center h-48 text-zinc-400">
                <p className="text-sm">请选择一个项目以查看</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      </div>
    </motion.div>
  );
}
