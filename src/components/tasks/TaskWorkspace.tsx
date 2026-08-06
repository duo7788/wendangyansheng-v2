import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, CircleDot, MessageSquareMore, Send, Trash2 } from 'lucide-react';
import { DocComment, DocLibrary } from '../../types';
import { USERS } from '../../App';

interface TaskWorkspaceProps { comments: DocComment[]; libraries: DocLibrary[]; activeUserId: string; onReply: (id: string, content: string) => void; onResolve: (id: string) => void; onDelete: (id: string) => void; }

export function TaskWorkspace({ comments, libraries, activeUserId, onReply, onResolve, onDelete }: TaskWorkspaceProps) {
  const [showResolved, setShowResolved] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const docsById = useMemo(() => new Map(libraries.flatMap(library => library.docs).map(doc => [doc.id, doc])), [libraries]);
  // A task means there is something for the current person to resolve: a
  // comment addressed to them, a note they left for themselves, or a response
  // from another person to a discussion they initiated. Starting a comment on
  // someone else's document alone deliberately does not create a task.
  const relevant = comments.filter(comment =>
    (comment.authorId === activeUserId && comment.recipientId === activeUserId) ||
    (comment.authorId !== activeUserId && comment.recipientId === activeUserId) ||
    (comment.authorId === activeUserId && (comment.replies || []).some(reply => reply.authorId !== activeUserId))
  );
  const open = relevant.filter(comment => comment.status !== 'resolved');
  const resolved = relevant.filter(comment => comment.status === 'resolved');
  const renderCard = (comment: DocComment, isResolved = false) => {
    const doc = docsById.get(comment.docId);
    const partnerId = comment.authorId === activeUserId ? comment.recipientId : comment.authorId;
    const partner = USERS.find(user => user.id === partnerId);
    const replies = comment.replies || [];
    const isExpanded = expandedId === comment.id;
    return <article key={comment.id} className={`rounded-2xl border p-4 ${isResolved ? 'border-zinc-100 bg-zinc-50/50 opacity-70' : 'border-zinc-200 bg-white shadow-sm'}`}>
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex items-center gap-2 text-xs text-zinc-500"><span className="truncate rounded-md bg-indigo-50 px-2 py-1 font-medium text-indigo-700">{doc?.title || '文档评论'}</span><span className="shrink-0">{comment.createdAt}</span></div><h3 className="line-clamp-3 text-sm font-semibold leading-6 text-zinc-900">{comment.content}</h3><p className="mt-2 text-xs text-zinc-500">{partner ? `与 ${partner.name}` : '文档讨论'} · {replies.length + 1}/8 轮</p></div>{isResolved ? <button onClick={() => onDelete(comment.id)} className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white hover:text-rose-600" aria-label="删除已解决记录"><Trash2 size={17} /></button> : <button onClick={() => onResolve(comment.id)} className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 text-emerald-700 hover:bg-emerald-100" aria-label="标记为已解决"><CheckCircle2 size={16} /></button>}</div>
      {comment.selectedText && <div className="mt-4 rounded-xl border-l-2 border-indigo-300 bg-indigo-50/60 px-3 py-2 text-xs leading-relaxed text-indigo-900">原文定位：{comment.selectedText}</div>}
      <button onClick={() => { setExpandedId(isExpanded ? null : comment.id); setDraft(''); }} className="mt-4 flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-indigo-700"><MessageSquareMore size={16} />{isExpanded ? '收起讨论' : `查看讨论（${replies.length} 条回复）`}</button>
      {isExpanded && <div className="mt-4 border-t border-zinc-100 pt-4"><div className="space-y-3">{replies.map(reply => { const user = USERS.find(item => item.id === reply.authorId); return <div key={reply.id} className="flex gap-2.5"><img src={user?.avatar} alt="" className="mt-0.5 h-7 w-7 rounded-full object-cover" /><div className="rounded-xl bg-zinc-50 px-3 py-2"><p className="text-xs font-semibold text-zinc-700">{user?.name || '成员'} <span className="ml-1 font-normal text-zinc-400">{reply.createdAt}</span></p><p className="mt-1 text-sm text-zinc-700">{reply.content}</p></div></div>; })}</div>{!isResolved && replies.length < 7 && <form onSubmit={event => { event.preventDefault(); onReply(comment.id, draft); setDraft(''); }} className="mt-4 flex gap-2"><input value={draft} onChange={event => setDraft(event.target.value)} placeholder="回复这条讨论…" className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-indigo-400" /><button disabled={!draft.trim()} className="rounded-lg bg-indigo-600 px-3 text-white disabled:opacity-40" aria-label="发送回复"><Send size={16} /></button></form>}{!isResolved && replies.length >= 7 && <p className="mt-4 text-xs text-zinc-400">该讨论已达到 8 轮上限，请标记为已解决或新开评论。</p>}</div>}
    </article>;
  };
  return <main className="h-full overflow-y-auto bg-white"><div className="mx-auto max-w-7xl px-10 py-12"><header className="mb-9"><p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">协作中心</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900">任务</h1><p className="mt-2 text-sm text-zinc-500">集中处理需要你回应或确认解决的文档讨论。</p></header><section><div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900"><CircleDot size={18} className="text-indigo-600" />待处理 <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">{open.length}</span></h2></div><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{open.length ? open.map(comment => renderCard(comment)) : <div className="col-span-full rounded-2xl border border-dashed border-zinc-200 py-12 text-center text-sm text-zinc-400">目前没有待处理的讨论。</div>}</div></section><section className="mt-10 border-t border-zinc-100 pt-6"><button onClick={() => setShowResolved(!showResolved)} className="flex w-full items-center justify-between text-left"><span className="flex items-center gap-2 text-base font-semibold text-zinc-700"><CheckCircle2 size={18} className="text-emerald-600" />已解决 <span className="text-sm font-normal text-zinc-400">{resolved.length}</span></span><ChevronDown size={18} className={`text-zinc-400 transition-transform ${showResolved ? 'rotate-180' : ''}`} /></button>{showResolved && <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{resolved.length ? resolved.map(comment => renderCard(comment, true)) : <p className="col-span-full py-5 text-sm text-zinc-400">还没有已解决的讨论。</p>}</div>}</section></div></main>;
}
