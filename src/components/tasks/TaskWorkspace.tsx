import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, ChevronDown, CircleDot, MessageSquareMore, Send, Trash2 } from 'lucide-react';
import { ChallengeTask, DocComment, DocLibrary } from '../../types';
import { USERS } from '../../App';

interface TaskWorkspaceProps {
  comments: DocComment[];
  libraries: DocLibrary[];
  activeUserId: string;
  onReply: (id: string, content: string) => void;
  onResolve: (id: string) => void;
  onDelete: (id: string) => void;
  challengeTasks: ChallengeTask[];
  onMarkChallengeTaskRead: (taskId: string) => void;
  onResolveChallengeTask: (taskId: string) => void;
}

export function TaskWorkspace({ comments, libraries, activeUserId, onReply, onResolve, onDelete, challengeTasks, onMarkChallengeTaskRead, onResolveChallengeTask }: TaskWorkspaceProps) {
  const [showResolved, setShowResolved] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [completingCommentId, setCompletingCommentId] = useState<string | null>(null);
  const docsById = useMemo(() => new Map(libraries.flatMap(library => library.docs).map(doc => [doc.id, doc])), [libraries]);
  const relevantComments = comments.filter(comment =>
    (comment.authorId === activeUserId && comment.recipientId === activeUserId) ||
    (comment.authorId !== activeUserId && comment.recipientId === activeUserId) ||
    (comment.authorId === activeUserId && (comment.replies || []).some(reply => reply.authorId !== activeUserId))
  );
  const openComments = relevantComments.filter(comment => comment.status !== 'resolved');
  const resolvedComments = relevantComments.filter(comment => comment.status === 'resolved');
  const openChallengeTasks = challengeTasks.filter(task => task.status === 'open');
  const resolvedChallengeTasks = challengeTasks.filter(task => task.status === 'resolved');
  const openCount = openComments.length + openChallengeTasks.length;

  const completeChallengeTask = (taskId: string) => {
    if (completingTaskId) return;
    setCompletingTaskId(taskId);
    window.setTimeout(() => {
      onResolveChallengeTask(taskId);
      setCompletingTaskId(null);
    }, 1000);
  };
  const completeCommentTask = (commentId: string) => {
    if (completingCommentId) return;
    setCompletingCommentId(commentId);
    window.setTimeout(() => {
      onResolve(commentId);
      setCompletingCommentId(null);
    }, 1000);
  };

  const renderChallengeCard = (task: ChallengeTask, isResolved = false) => {
    const completing = completingTaskId === task.id;
    return <motion.article layout key={task.id} onClick={() => onMarkChallengeTaskRead(task.id)} className={`relative cursor-pointer rounded-2xl border p-5 transition-colors ${isResolved ? 'border-zinc-100 bg-zinc-50/70 opacity-70' : 'border-zinc-200 bg-white shadow-sm hover:bg-zinc-50'}`}>
      {task.unread && !isResolved && <span aria-label="未读" className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-rose-500" />}
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span className="rounded-md bg-zinc-200 px-2 py-1 font-medium text-zinc-900">{task.docTitle}</span>
            <span>{task.createdAt}</span>
          </div>
          <p className="text-sm font-semibold leading-6 text-zinc-900">{task.content}</p>
          <p className="mt-3 text-xs text-zinc-500">来自 {task.roleName} 的模拟质疑</p>
        </div>
        {isResolved ? <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700"><CheckCircle2 size={19} /></span> : <button type="button" onClick={event => { event.stopPropagation(); completeChallengeTask(task.id); }} disabled={Boolean(completingTaskId)} aria-label="标记为完成" className={`group flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${completing ? 'border-emerald-300 bg-emerald-100 text-emerald-700' : 'border-zinc-200 bg-white text-zinc-400 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700'}`}><CheckCircle2 size={19} /><span className="pointer-events-none absolute right-4 top-14 rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition-none group-hover:opacity-100">标记为完成</span></button>}
      </div>
    </motion.article>;
  };

  const renderCommentCard = (comment: DocComment, isResolved = false) => {
    const doc = docsById.get(comment.docId);
    const partnerId = comment.authorId === activeUserId ? comment.recipientId : comment.authorId;
    const partner = USERS.find(user => user.id === partnerId);
    const replies = comment.replies || [];
    const isExpanded = expandedId === comment.id;
    const completing = completingCommentId === comment.id;
    return <article key={comment.id} className={`rounded-2xl border p-5 ${isResolved ? 'border-zinc-100 bg-zinc-50/50 opacity-70' : 'border-zinc-200 bg-white shadow-sm'}`}>
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-3 flex items-center gap-2 text-xs text-zinc-500"><span className="truncate rounded-md bg-zinc-200 px-2 py-1 font-medium text-zinc-900">{doc?.title || '文档评论'}</span><span className="shrink-0">{comment.createdAt}</span></div><h3 className="line-clamp-3 text-sm font-semibold leading-6 text-zinc-900">{comment.content}</h3><p className="mt-3 text-xs text-zinc-500">{partner ? `与 ${partner.name}` : '文档讨论'}</p></div>{isResolved ? <button onClick={() => onDelete(comment.id)} className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white hover:text-rose-600" aria-label="删除已完成记录"><Trash2 size={17} /></button> : <button onClick={() => completeCommentTask(comment.id)} disabled={Boolean(completingCommentId)} aria-label="标记为完成" className={`group relative shrink-0 rounded-xl border p-2.5 transition-colors ${completing ? 'border-emerald-300 bg-emerald-100 text-emerald-700' : 'border-zinc-200 bg-white text-zinc-400 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700'}`}><CheckCircle2 size={17} /><span className="pointer-events-none absolute right-0 top-[calc(100%+7px)] whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition-none group-hover:opacity-100">标记为完成</span></button>}</div>
      {comment.selectedText && <div className="mt-4 rounded-xl border-l-2 border-zinc-300 bg-white px-3 py-2 text-xs leading-relaxed text-zinc-700">原文定位：{comment.selectedText}</div>}
      <button onClick={() => { setExpandedId(isExpanded ? null : comment.id); setDraft(''); }} className="mt-4 flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-indigo-700"><MessageSquareMore size={16} />{isExpanded ? '收起讨论' : `查看讨论（${replies.length} 条回复）`}</button>
      {isExpanded && <div className="mt-4 border-t border-zinc-100 pt-4"><div className="space-y-3">{replies.map(reply => { const user = USERS.find(item => item.id === reply.authorId); return <div key={reply.id} className="flex gap-2.5"><img src={user?.avatar} alt="" className="mt-0.5 h-7 w-7 rounded-full object-cover" /><div className="rounded-xl bg-zinc-50 px-3 py-2"><p className="text-xs font-semibold text-zinc-700">{user?.name || '成员'} <span className="ml-1 font-normal text-zinc-400">{reply.createdAt}</span></p><p className="mt-1 text-sm text-zinc-700">{reply.content}</p></div></div>; })}</div>{!isResolved && replies.length < 7 && <form onSubmit={event => { event.preventDefault(); onReply(comment.id, draft); setDraft(''); }} className="mt-4 flex gap-2"><input value={draft} onChange={event => setDraft(event.target.value)} placeholder="回复这条讨论…" className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-indigo-400" /><button disabled={!draft.trim()} className="rounded-lg bg-zinc-200 px-3 text-zinc-500 transition-colors enabled:bg-zinc-950 enabled:text-white enabled:hover:bg-zinc-800 disabled:cursor-not-allowed" aria-label="发送回复"><Send size={16} /></button></form>}</div>}
    </article>;
  };

  return <main className="h-full overflow-y-auto bg-white"><div className="mx-auto max-w-7xl px-10 py-12"><header className="mb-9"><p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">协作中心</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900">任务</h1><p className="mt-2 text-sm text-zinc-500">集中处理需要你回应或确认解决的文档讨论。</p></header><section><div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900"><CircleDot size={18} className="text-indigo-600" />待处理 <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">{openCount}</span></h2></div><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{openCount ? <>{openChallengeTasks.map(task => renderChallengeCard(task))}{openComments.map(comment => renderCommentCard(comment))}</> : <div className="col-span-full rounded-2xl border border-dashed border-zinc-200 py-12 text-center text-sm text-zinc-400">目前没有待处理的任务。</div>}</div></section><section className="mt-10 border-t border-zinc-100 pt-6"><button onClick={() => setShowResolved(!showResolved)} className="flex w-full items-center justify-between text-left"><span className="flex items-center gap-2 text-base font-semibold text-zinc-700"><CheckCircle2 size={18} className="text-emerald-600" />已完成 <span className="text-sm font-normal text-zinc-400">{resolvedChallengeTasks.length + resolvedComments.length}</span></span><ChevronDown size={18} className={`text-zinc-400 transition-transform ${showResolved ? 'rotate-180' : ''}`} /></button>{showResolved && <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{resolvedChallengeTasks.length + resolvedComments.length ? <>{resolvedChallengeTasks.map(task => renderChallengeCard(task, true))}{resolvedComments.map(comment => renderCommentCard(comment, true))}</> : <p className="col-span-full py-5 text-sm text-zinc-400">还没有已完成的任务。</p>}</div>}</section></div></main>;
}
