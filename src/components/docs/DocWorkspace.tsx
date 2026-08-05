import { Share, MessageSquare, MoreHorizontal, Clock, Star, Play, Users, X, FileText, Check, User, Sparkles, Loader2, PanelLeftOpen, Plus, Eye, MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DocItem, DocLibrary, ChatItem, DocComment } from '../../types';

interface DocWorkspaceProps {
  doc: DocItem;
  libraries: DocLibrary[];
  chats: ChatItem[];
  onShareDoc: (chatId: string, doc: DocItem, roleId?: string | null) => void;
  isDirCollapsed: boolean;
  setIsDirCollapsed: (collapsed: boolean) => void;
  initialRoleId?: string | null;
  appliedRoleIds: Set<string>;
  onApplyDerivation: (docId: string, roleId: string, shouldApply: boolean) => void;
  canManageDerivations: boolean;
  comments: DocComment[];
  onAddComment: (comment: Omit<DocComment, 'id' | 'createdAt'>) => void;
  activeUserId: string;
  reviewMode?: boolean;
}

export function DocWorkspace({ doc, libraries, chats, onShareDoc, isDirCollapsed, setIsDirCollapsed, initialRoleId, appliedRoleIds, onApplyDerivation, canManageDerivations, comments, onAddComment, activeUserId, reviewMode = false }: DocWorkspaceProps) {
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set(initialRoleId ? [initialRoleId] : []));
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());

  // Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(canManageDerivations && !!initialRoleId);
  const [activeDerivativeRoles, setActiveDerivativeRoles] = useState<string[]>(initialRoleId ? [initialRoleId] : []);
  const [activeDerivativeDocs, setActiveDerivativeDocs] = useState<string[]>([]);
  const [loadingRoles, setLoadingRoles] = useState<Record<string, boolean>>({});
  const [viewingDerivativeRole, setViewingDerivativeRole] = useState<string | null>(reviewMode ? null : initialRoleId || null);
  const [highlightedCitation, setHighlightedCitation] = useState<string | null>(null);
  const [citationPreview, setCitationPreview] = useState<'1' | '2' | null>(null);
  const [showOriginal, setShowOriginal] = useState(canManageDerivations);
  const [commentMenuCitation, setCommentMenuCitation] = useState<'1' | '2' | null>(null);
  const [commentingCitation, setCommentingCitation] = useState<'1' | '2' | null>(null);
  const [commentDraft, setCommentDraft] = useState('');

  useEffect(() => {
    const closeCitationPreview = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-citation-popover], [data-citation-trigger]')) return;
      setCitationPreview(null);
    };
    document.addEventListener('pointerdown', closeCitationPreview);
    return () => document.removeEventListener('pointerdown', closeCitationPreview);
  }, []);

  const [roles, setRoles] = useState([
    { id: 'backend', name: '后端工程师' },
    { id: 'frontend', name: '前端工程师' },
    { id: 'qa', name: '测试工程师' },
    { id: 'ui', name: 'UI设计师' },
  ]);

  const [isCreateRoleModalOpen, setIsCreateRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleSkill, setNewRoleSkill] = useState('');

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [selectedShareChatId, setSelectedShareChatId] = useState<string | null>(null);

  const toggleRoleSelection = (id: string) => {
    setSelectedRoleIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleDocSelection = (id: string) => {
    setSelectedDocIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleGenerate = () => {
    const rolesArray = Array.from(selectedRoleIds) as string[];
    setActiveDerivativeRoles(rolesArray);
    setActiveDerivativeDocs(Array.from(selectedDocIds) as string[]);
    
    const initialLoadingState: Record<string, boolean> = {};
    rolesArray.forEach((r: string) => {
      initialLoadingState[r] = true;
    });
    setLoadingRoles(initialLoadingState);

    setIsRoleModalOpen(false);
    setIsSidebarOpen(true);
    setIsDirCollapsed(true);
    setViewingDerivativeRole(null);
    
    rolesArray.forEach((r: string, index) => {
      setTimeout(() => {
        setLoadingRoles(prev => ({ ...prev, [r]: false }));
      }, 1500 + index * 800);
    });
  };

  const allDocs = libraries.flatMap(lib => lib.docs);
  const selectedDocs = allDocs.filter(d => selectedDocIds.has(d.id));
  const openCitation = (citationId: '1' | '2') => {
    setCitationPreview(citationId);
    setHighlightedCitation(citationId);
  };
  const revealOriginal = () => {
    const citationToHighlight = citationPreview;
    setCitationPreview(null);
    setShowOriginal(true);
    if (citationToHighlight) setHighlightedCitation(citationToHighlight);
    setTimeout(() => setHighlightedCitation(null), 1600);
  };
  const closeOriginal = () => {
    setShowOriginal(false);
    setHighlightedCitation(null);
  };
  const renderCitationCard = (citationId: '1' | '2') => citationPreview === citationId ? (
    <span data-citation-popover className="relative ml-auto block w-[min(390px,100%)] rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl">
      <span className="block text-xs font-medium text-zinc-400">原文定位 · [{citationId}]</span>
      <span className="mt-1 block text-xs leading-relaxed text-zinc-300">{citationId === '1' ? '本文档作为项目的唯一事实来源。请确保在周五的站会之前，' : '关键交付物包括确定间距令牌和排版比例，以及'}</span>
      <span className="block text-sm font-semibold leading-relaxed text-zinc-900">{citationId === '1' ? '所有更新都已与相应的设计资产同步。' : '跨 React 和 Figma 的组件库一致性。'}</span>
      <span className="block text-xs leading-relaxed text-zinc-300">{citationId === '1' ? '相关结论会在站会前完成确认。' : '并针对所有界面颜色完成无障碍标准审计。'}</span>
      <button onClick={revealOriginal} className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">查看原文</button>
      <span className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-zinc-200 bg-white" />
    </span>
  ) : null;
  const submitComment = () => {
    if (!commentingCitation || !commentDraft.trim()) return;
    onAddComment({ docId: doc.id, roleId: initialRoleId || 'backend', authorId: activeUserId, citationId: commentingCitation, content: commentDraft.trim() });
    setCommentDraft('');
    setCommentingCitation(null);
    setCommentMenuCitation(null);
  };
  
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <header className="h-[72px] shrink-0 border-b border-zinc-100 px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
          {isDirCollapsed && (
            <button 
              onClick={() => setIsDirCollapsed(false)} 
              className="text-zinc-400 hover:text-zinc-700 transition-colors mr-2 p-1.5 rounded-md hover:bg-zinc-100"
              title="展开侧边栏"
            >
              <PanelLeftOpen size={20} />
            </button>
          )}
          <div className="flex items-center gap-1.5 text-sm text-zinc-500 font-medium">
            <span className="hover:text-zinc-900 cursor-pointer transition-colors">工作区</span>
            <span className="text-zinc-300">/</span>
            <span className="hover:text-zinc-900 cursor-pointer transition-colors">项目</span>
            <span className="text-zinc-300">/</span>
            <span className="text-zinc-900">{doc.title}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-400 flex items-center gap-1.5 mr-2">
            <Clock size={14} /> 编辑于 {doc.updatedAt}
          </span>
          <button className="w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-amber-500 hover:bg-amber-50 rounded-full transition-colors">
            <Star size={18} />
          </button>
          <div className="flex items-center">
            <div className="flex -space-x-2 mr-4">
              <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" className="w-8 h-8 rounded-full border-2 border-white" alt="" />
              <img src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" className="w-8 h-8 rounded-full border-2 border-white" alt="" />
            </div>
            {canManageDerivations && <button 
              onClick={() => {
                if (isSidebarOpen) return;
                if (activeDerivativeRoles.length === 0) {
                  setIsRoleModalOpen(true);
                } else {
                  setIsSidebarOpen(true);
                }
              }}
              className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors mr-2"
            >
              <Users size={16} />
              角色衍生
            </button>}
            {!canManageDerivations && initialRoleId && <button onClick={() => showOriginal ? closeOriginal() : setShowOriginal(true)} className="flex items-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors mr-2">
              <Eye size={16} />
              {showOriginal ? '关闭原文' : '查看原文'}
            </button>}
            <button 
              onClick={() => setIsShareModalOpen(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <Share size={16} />
              分享
            </button>
          </div>
          <button className="w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 rounded-full transition-colors">
            <MoreHorizontal size={18} />
          </button>
        </div>
      </header>

      {/* Main Area */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Original Document */}
        <AnimatePresence initial={false}>
        {showOriginal && <motion.div
          layout
          initial={!canManageDerivations ? { opacity: 0, x: 72 } : false}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 72 }}
          transition={{ duration: 0.26, ease: 'easeOut' }}
          className={`relative flex-1 min-w-0 overflow-y-auto ${viewingDerivativeRole ? 'border-r border-zinc-200' : ''} ${!canManageDerivations ? 'order-2 bg-white' : 'order-1'}`}
        >
          {!canManageDerivations && <button onClick={closeOriginal} aria-label="关闭原文" className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-700"><X size={17} /></button>}
          <div className="max-w-4xl mx-auto px-12 py-16">
            <div className="mb-6 flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-100 text-xs font-medium text-zinc-600">
                {doc.type === 'document' ? '文档' : doc.type === 'spreadsheet' ? '表格' : doc.type === 'presentation' ? '演示文稿' : '文件夹'}
              </span>
            </div>
            
            <h1 className="text-4xl md:text-5xl font-bold text-zinc-900 tracking-tight mb-8 outline-none" contentEditable suppressContentEditableWarning>
              {doc.title}
            </h1>

            {doc.content ? (
              <div 
                className="imported-doc" 
                dangerouslySetInnerHTML={{ __html: doc.content }} 
                contentEditable 
                suppressContentEditableWarning 
              />
            ) : (
              <div className="space-y-6 text-base text-zinc-700 leading-relaxed font-normal">
                <p className="outline-none" contentEditable suppressContentEditableWarning>
                  本文档作为项目的唯一事实来源。请确保在周五的站会之前，所有更新都已与相应的设计资产同步。
                </p>

                <h3 className="text-xl font-semibold text-zinc-900 mt-12 mb-4 outline-none" contentEditable suppressContentEditableWarning>
                  1. 执行摘要
                </h3>
                
                <p className={`outline-none transition-colors duration-500 ${highlightedCitation === '1' ? 'bg-amber-100/80 rounded px-1' : ''}`} contentEditable suppressContentEditableWarning>
                  我们的目标是整合所有平台的设计语言系统。主要目标是减少认知负荷，同时保持企业客户所需的高端质感。新界面在很大程度上依赖于微妙的对比度、精确的间距比例以及让人感觉自然而非机械的运动曲线。
                </p>
                {comments.filter(comment => comment.citationId === '1').map(comment => <div key={comment.id} className="mt-3 ml-1 max-w-md rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-sm text-indigo-900"><span className="font-semibold">陈莎莎 · </span>{comment.content}</div>)}

                <div className="my-8 p-6 bg-zinc-50 rounded-2xl border border-zinc-100 flex gap-4 items-start">
                  <div className="bg-white p-3 rounded-xl shadow-sm border border-zinc-100 text-blue-600 shrink-0">
                    <Play size={24} className="ml-0.5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-zinc-900 mb-1">嵌入的原型</h4>
                    <p className="text-sm text-zinc-500 mb-3">新认证模块的交互流程图。</p>
                    <button className="text-sm font-medium text-blue-600 hover:text-blue-700">在新标签页中打开 &rarr;</button>
                  </div>
                </div>

                <h3 className="text-xl font-semibold text-zinc-900 mt-12 mb-4 outline-none" contentEditable suppressContentEditableWarning>
                  2. 关键交付物
                </h3>
                <ul className={`list-disc pl-5 space-y-2 outline-none transition-colors duration-500 ${highlightedCitation === '2' ? 'bg-amber-100/80 rounded px-1 py-1' : ''}`} contentEditable suppressContentEditableWarning>
                  <li>确定间距令牌和排版比例。</li>
                  <li>跨 React 和 Figma 的组件库一致性。</li>
                  <li>针对所有界面颜色的 WCAG AA 无障碍标准合规性审计。</li>
                </ul>
                {comments.filter(comment => comment.citationId === '2').map(comment => <div key={comment.id} className="mt-3 ml-1 max-w-md rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-sm text-indigo-900"><span className="font-semibold">陈莎莎 · </span>{comment.content}</div>)}
              </div>
            )}
          </div>
        </motion.div>}
        </AnimatePresence>

        {/* Generated Document View */}
        {viewingDerivativeRole && (
          <motion.div layout transition={{ duration: 0.26, ease: 'easeOut' }} className={`flex-1 min-w-0 overflow-y-auto bg-zinc-50/50 ${!canManageDerivations ? 'order-1' : 'order-2'}`}>
            <div className="max-w-4xl mx-auto px-10 py-16">
              <div className="mb-6">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-100 text-xs font-medium text-indigo-700">
                  <Sparkles size={12} />
                  AI 衍生视图 · {roles.find(r => r.id === viewingDerivativeRole)?.name}
                </span>
              </div>
              <h1 className="text-3xl font-bold text-zinc-900 tracking-tight mb-8">
                {doc.title}
              </h1>
              
              <div className="space-y-6 text-sm text-zinc-700 leading-relaxed">
                <p>
                  此文档是基于 <span className="font-semibold">{doc.title}</span> 
                  {activeDerivativeDocs.length > 0 && <span> 结合 {activeDerivativeDocs.length} 篇关联知识</span>} 
                  ，专为 <span className="font-semibold text-indigo-600">{roles.find(r => r.id === viewingDerivativeRole)?.name}</span> 视角生成的摘要和行动指南。
                </p>

                <div className="relative p-5 bg-white border border-zinc-200 rounded-xl shadow-sm">
                   <h3 className="text-base font-semibold text-zinc-900 mb-3 flex items-center gap-2">
                     核心关注点提取
                   </h3>
                   <ul className="list-disc pl-5 space-y-2 text-zinc-600">
                     <li>关键技术实现路径与架构设计 <span className="relative inline-block"><sup data-citation-trigger className="cursor-pointer text-indigo-500 hover:text-indigo-700" onClick={() => openCitation('1')} onContextMenu={event => { event.preventDefault(); setCommentMenuCitation('1'); }}>[1]</sup>{citationPreview === '1' && <span className="pointer-events-none absolute bottom-[calc(100%+14px)] left-1/2 z-30 block w-[390px] -translate-x-1/2"><span className="pointer-events-auto block">{renderCitationCard('1')}</span></span>}</span></li>
                     <li>跨模块依赖关系及排期影响 <span className="relative inline-block"><sup data-citation-trigger className="cursor-pointer text-indigo-500 hover:text-indigo-700" onClick={() => openCitation('2')} onContextMenu={event => { event.preventDefault(); setCommentMenuCitation('2'); }}>[2]</sup>{citationPreview === '2' && <span className="pointer-events-none absolute bottom-[calc(100%+14px)] left-1/2 z-30 block w-[390px] -translate-x-1/2"><span className="pointer-events-auto block">{renderCitationCard('2')}</span></span>}</span></li>
                     <li>从关联文档中提取的风险预警</li>
                   </ul>
                </div>
                {commentMenuCitation && <div className="relative w-44 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg">
                  <button onClick={() => setCommentingCitation(commentMenuCitation)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"><MessageCircle size={15} /> 评论</button>
                </div>}
                {commentingCitation && <div className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 text-sm font-semibold text-zinc-900">评论引用 [{commentingCitation}]</div>
                  <textarea value={commentDraft} onChange={event => setCommentDraft(event.target.value)} placeholder="写下你的评论…" className="min-h-20 w-full resize-none rounded-lg border border-zinc-200 p-2 text-sm outline-none focus:border-indigo-400" />
                  <div className="mt-3 flex justify-end gap-2"><button onClick={() => setCommentingCitation(null)} className="px-3 py-1.5 text-sm text-zinc-500">取消</button><button onClick={submitComment} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">发送</button></div>
                </div>}
                
                <h3 className="text-lg font-semibold text-zinc-900 mt-8 mb-4">
                  行动建议 (Action Items)
                </h3>
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-white border border-zinc-100 rounded-lg shadow-sm">
                      <div className="w-5 h-5 mt-0.5 rounded border border-zinc-300 shrink-0 flex items-center justify-center text-transparent hover:text-zinc-400 cursor-pointer transition-colors">
                        <Check size={14} />
                      </div>
                      <p className="text-zinc-600">审查第 {i} 阶段的 API 定义，并与前端团队确认数据结构。</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Derivative Sidebar */}
        <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.aside
            initial={{ width: 0, x: 320, opacity: 0 }}
            animate={{ width: 320, x: 0, opacity: 1 }}
            exit={{ width: 0, x: 320, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="order-3 ml-auto shrink-0 overflow-hidden border-l border-zinc-200 bg-white flex flex-col z-10 shadow-[-4px_0_12px_rgba(0,0,0,0.02)]"
          >
            <div className="h-[72px] border-b border-zinc-100 flex items-center px-5 justify-between shrink-0">
              <span className="font-semibold text-sm text-zinc-900">角色衍生</span>
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-md hover:bg-zinc-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {activeDerivativeRoles.map(roleId => {
                const role = roles.find(r => r.id === roleId);
                const isLoading = loadingRoles[roleId];
                const isViewing = viewingDerivativeRole === roleId;
                
                return (
                  <div key={roleId} className={`p-5 border-b border-zinc-100 transition-colors ${isViewing ? 'bg-indigo-50/40' : ''}`}>
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center shrink-0">
                            <User size={14} className="text-zinc-500" />
                          </div>
                          <span className="text-sm font-semibold text-zinc-900">
                            {role?.name}
                          </span>
                        </div>
                      </div>
                      
                      {activeDerivativeDocs.length > 0 && (
                        <div className="flex flex-col gap-1.5 mt-1">
                          {activeDerivativeDocs.map(docId => {
                            const d = allDocs.find(x => x.id === docId);
                            return (
                               <span key={docId} className="text-xs px-2.5 py-1.5 bg-zinc-50 text-zinc-600 rounded-md flex items-center gap-1.5 truncate">
                                 <FileText size={12} className="shrink-0 text-zinc-400" /> 
                                 <span className="truncate">{d?.title}</span>
                               </span>
                            )
                          })}
                        </div>
                      )}

                      {isLoading ? (
                        <div className="mt-1 flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50/60 p-2.5 rounded-lg border border-indigo-100/60">
                          <Loader2 size={14} className="animate-spin shrink-0" />
                          <span className="font-medium">AI 正在生成专属视图...</span>
                        </div>
                      ) : (
                        <div className="mt-2 flex gap-2">
                          <button 
                            onClick={() => setViewingDerivativeRole(isViewing ? null : roleId)}
                            className={`flex-[1.2] text-xs font-medium py-2 rounded-lg transition-colors flex items-center justify-center ${
                              isViewing 
                                ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' 
                                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                            }`}
                          >
                            {isViewing ? '关闭视图' : '查看文档'}
                          </button>
                          {canManageDerivations && <button 
                            onClick={() => {
                              setLoadingRoles(prev => ({ ...prev, [roleId]: true }));
                              setTimeout(() => setLoadingRoles(prev => ({ ...prev, [roleId]: false })), 1500);
                            }}
                            className="flex-1 text-xs font-medium py-2 bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200 transition-colors flex items-center justify-center"
                          >
                            重新生成
                          </button>}
                          {canManageDerivations && <button 
                            onClick={() => onApplyDerivation(doc.id, roleId, !appliedRoleIds.has(roleId))}
                            className={`flex-[1.5] text-xs font-medium py-2 rounded-lg transition-colors flex items-center justify-center ${
                              appliedRoleIds.has(roleId)
                                ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                            }`}
                          >
                            {appliedRoleIds.has(roleId) ? '已应用' : '应用'}
                          </button>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {canManageDerivations && <div className="p-4 border-t border-zinc-100">
              <button 
                onClick={() => setIsRoleModalOpen(true)}
                className="w-full py-2 flex items-center justify-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 rounded-lg transition-colors"
              >
                <Plus size={16} />
                新增角色
              </button>
            </div>}
          </motion.aside>
        )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isRoleModalOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-900/60 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl shadow-xl border border-zinc-100 p-6 w-full max-w-lg"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-zinc-900">角色衍生</h3>
                <button 
                  onClick={() => setIsRoleModalOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600 p-1 rounded-md hover:bg-zinc-100"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-zinc-900">角色选择 (可多选)</h4>
                  <button 
                    onClick={() => setIsCreateRoleModalOpen(true)}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    <Plus size={14} />
                    新建角色
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {roles.map(role => {
                    const isSelected = selectedRoleIds.has(role.id);
                    return (
                      <button
                        key={role.id}
                        onClick={() => toggleRoleSelection(role.id)}
                        className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                          isSelected 
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                            : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                        }`}
                      >
                        {role.name}
                        {isSelected && <Check size={16} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mb-6">
                <h4 className="text-sm font-medium text-zinc-900 mb-3">关联文档</h4>
                
                <div className="relative mb-3">
                  <Sparkles size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500" />
                  <input 
                    type="text" 
                    placeholder="AI 搜索相关文档..." 
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto border border-zinc-200 rounded-xl divide-y divide-zinc-100">
                  {allDocs.map(d => {
                    const isSelected = selectedDocIds.has(d.id);
                    return (
                      <button
                        key={d.id}
                        onClick={() => toggleDocSelection(d.id)}
                        className={`w-full flex items-center justify-between p-3 text-left transition-colors hover:bg-zinc-50 ${isSelected ? 'bg-indigo-50/50' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-indigo-100 text-indigo-600' : 'bg-zinc-100 text-zinc-500'}`}>
                            <FileText size={16} />
                          </div>
                          <span className={`text-sm ${isSelected ? 'font-medium text-indigo-900' : 'text-zinc-700'}`}>
                            {d.title}
                          </span>
                        </div>
                        {isSelected && <Check size={16} className="text-indigo-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedDocs.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-zinc-900 mb-2">已选择关联知识</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedDocs.map(d => (
                      <span key={d.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-50 border border-indigo-100 text-xs font-medium text-indigo-700">
                        <FileText size={12} />
                        {d.title}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button 
                  onClick={() => setIsRoleModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={handleGenerate}
                  disabled={selectedRoleIds.size === 0}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                >
                  生成衍生
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCreateRoleModalOpen && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-zinc-900/60 p-4">
             <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 10 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 10 }}
               className="bg-white rounded-2xl shadow-xl border border-zinc-100 p-6 w-full max-w-sm"
             >
               <div className="flex items-center justify-between mb-6">
                 <h3 className="text-lg font-semibold text-zinc-900">新建角色</h3>
                 <button 
                   onClick={() => setIsCreateRoleModalOpen(false)}
                   className="text-zinc-400 hover:text-zinc-600 p-1 rounded-md hover:bg-zinc-100 transition-colors"
                 >
                   <X size={20} />
                 </button>
               </div>
               <div className="space-y-4 mb-6">
                 <div>
                   <label className="block text-sm font-medium text-zinc-700 mb-1.5">自定义角色名</label>
                   <input 
                     type="text" 
                     value={newRoleName}
                     onChange={e => setNewRoleName(e.target.value)}
                     className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                     placeholder="例如：产品经理"
                   />
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-zinc-700 mb-1.5">自定义生成文档的skill</label>
                   <textarea 
                     value={newRoleSkill}
                     onChange={e => setNewRoleSkill(e.target.value)}
                     rows={3}
                     className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                     placeholder="描述该角色生成文档时需要遵循的规则或关注点..."
                   />
                 </div>
               </div>
               <div className="flex justify-end gap-3">
                  <button 
                    onClick={() => setIsCreateRoleModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    onClick={() => {
                      const newId = 'role_' + Date.now();
                      setRoles(prev => [...prev, { id: newId, name: newRoleName }]);
                      toggleRoleSelection(newId);
                      setNewRoleName('');
                      setNewRoleSkill('');
                      setIsCreateRoleModalOpen(false);
                    }}
                    disabled={!newRoleName.trim() || !newRoleSkill.trim()}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                  >
                    新建
                  </button>
               </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isShareModalOpen && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-zinc-900/60 p-4">
             <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 10 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 10 }}
               className="bg-white rounded-2xl shadow-xl border border-zinc-100 p-6 w-full max-w-sm flex flex-col max-h-[80vh]"
             >
               <div className="flex items-center justify-between mb-6 shrink-0">
                 <h3 className="text-lg font-semibold text-zinc-900">分享文档到会话</h3>
                 <button 
                   onClick={() => setIsShareModalOpen(false)}
                   className="text-zinc-400 hover:text-zinc-600 p-1 rounded-md hover:bg-zinc-100 transition-colors"
                 >
                   <X size={20} />
                 </button>
               </div>
               
               <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
                 <div className="space-y-1">
                   {chats.map(chat => {
                     const isSelected = selectedShareChatId === chat.id;
                     return (
                       <button
                         key={chat.id}
                         onClick={() => setSelectedShareChatId(chat.id)}
                         className={`w-full flex items-center justify-between p-3 rounded-xl transition-colors ${
                           isSelected 
                             ? 'bg-indigo-50/50' 
                             : 'hover:bg-zinc-50'
                         }`}
                       >
                         <div className="flex items-center gap-3">
                           <img src={chat.user.avatar} alt={chat.user.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                           <div className="text-left">
                             <div className={`text-sm ${isSelected ? 'font-medium text-indigo-900' : 'font-medium text-zinc-900'}`}>
                               {chat.user.name}
                             </div>
                             <div className="text-xs text-zinc-500 truncate max-w-[180px]">
                               {chat.lastMessage}
                             </div>
                           </div>
                         </div>
                         {isSelected && <Check size={16} className="text-indigo-600 shrink-0" />}
                       </button>
                     );
                   })}
                 </div>
               </div>

               <div className="flex justify-end gap-3 shrink-0 mt-6 pt-4 border-t border-zinc-100">
                  <button 
                    onClick={() => setIsShareModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    onClick={() => {
                      if (selectedShareChatId) {
                        onShareDoc(selectedShareChatId, doc);
                        setIsShareModalOpen(false);
                        setSelectedShareChatId(null);
                      }
                    }}
                    disabled={!selectedShareChatId}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                  >
                    发送
                  </button>
               </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
