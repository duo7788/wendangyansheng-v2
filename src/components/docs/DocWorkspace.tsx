import { Share, MessageSquare, MoreHorizontal, Clock, Star, Play, Users, X, FileText, Check, User, Sparkles, Loader2, PanelLeftOpen, Plus, Eye, MessageCircle, AtSign } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DocItem, DocLibrary, ChatItem, DocComment } from '../../types';
import { formatPlainTextAsDocument } from './DocEmptyState';

type CommentAnchor = {
  citationId?: '1' | '2';
  selectedText: string;
  sourceText: string;
  x: number;
  y: number;
};

type GeneratedDerivation = {
  content: string;
  relatedDocumentIds: string[];
  generatedAt: string;
};

type MentionMenu = {
  query: string;
  range: Range;
  x: number;
  y: number;
};

// The current prototype keeps its source document in the editor markup rather
// than a database.  This supplies that same source to Kimi until document
// editing is persisted in Supabase.
const getSourceDocumentContent = () => `本文档作为项目的唯一事实来源。请确保在周五的站会之前，所有更新都已与相应的设计资产同步。

1. 执行摘要
我们的目标是整合所有平台的设计语言系统。主要目标是减少认知负荷，同时保持企业客户所需的高端质感。新界面在很大程度上依赖于微妙的对比度、精确的间距比例以及让人感觉自然而非机械的运动曲线。

2. 关键交付物
- 确定间距令牌和排版比例。
- 跨 React 和 Figma 的组件库一致性。
- 针对所有界面颜色的 WCAG AA 无障碍标准合规性审计。`;

// AI needs the document's meaning, not its editor markup or embedded image
// data. Removing those keeps requests below Vercel's serverless body limit.
const toAiText = (content: string, maxLength = 30000) => {
  const parsed = new DOMParser().parseFromString(content, 'text/html');
  const blocks = Array.from(parsed.body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li'))
    .map(block => block.textContent?.replace(/\s+/g, ' ').trim() || '')
    .filter(Boolean);
  const plainText = blocks.length ? blocks.join('\n') : (parsed.body.textContent || content);
  return plainText.replace(/\n{3,}/g, '\n\n').trim().slice(0, maxLength);
};

type InlineCitation = { id: number; quote: string };

// Generated citations occasionally differ only in line breaks, non-breaking
// spaces, full-width punctuation, or curly quotes. Normalising those cosmetic
// differences keeps source lookup strict in meaning while much more reliable.
const normalizeCitationText = (value: string) => value
  .normalize('NFKC')
  .replace(/[\s\u00a0]+/g, '')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'");

const citationContext = (source: string, quote: string) => {
  const normalizedSource = source.replace(/\s+/g, ' ').trim();
  const normalizedQuote = quote.replace(/\s+/g, ' ').trim();
  const index = normalizedSource.indexOf(normalizedQuote);
  if (index < 0) {
    // The full source still validates the citation, even when typography makes
    // a character-for-character context preview impossible.
    return { before: '', focus: quote, after: '' };
  }
  return {
    before: normalizedSource.slice(Math.max(0, index - 54), index),
    focus: normalizedQuote,
    after: normalizedSource.slice(index + normalizedQuote.length, index + normalizedQuote.length + 54),
  };
};

const renderInlineMarkdown = (text: string, keyPrefix: string, onCitationClick?: (citation: InlineCitation) => void, activeCitationId?: number, onRevealOriginal?: () => void, sourceText = ''): ReactNode[] => {
  const tokens = text.split(/(\[\[cite:[\s\S]*?\]\]|\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.startsWith('[[cite:') && token.endsWith(']]')) {
      const citation = { id: Number(keyPrefix.replace(/\D/g, '')) + 1, quote: token.slice(7, -2).trim() };
      const context = citationContext(sourceText, citation.quote);
      return <span key={key} className="relative ml-1 inline-block align-baseline"><button type="button" data-citation-trigger onClick={event => { event.stopPropagation(); onCitationClick?.(citation); }} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">[{citation.id}]</button>{activeCitationId === citation.id && <span data-citation-popover className="absolute bottom-[calc(100%+12px)] left-1/2 z-30 block w-[360px] -translate-x-1/2 rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-xl"><span className="block text-xs font-medium text-zinc-400">原文定位 · [{citation.id}]</span><span className="mt-2 block text-xs leading-relaxed text-zinc-300">{context.before}</span><span className="block text-sm font-semibold leading-relaxed text-zinc-900">{context.focus}</span><span className="block text-xs leading-relaxed text-zinc-300">{context.after}</span><button type="button" onClick={onRevealOriginal} className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">查看原文</button><span className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-zinc-200 bg-white" /></span>}</span>;
    }
    if (token.startsWith('**') && token.endsWith('**')) return <strong key={key} className="font-semibold text-zinc-900">{token.slice(2, -2)}</strong>;
    if (token.startsWith('`') && token.endsWith('`')) return <code key={key} className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.9em] text-zinc-800">{token.slice(1, -1)}</code>;
    return <span key={key}>{token}</span>;
  });
};

const isTableSeparator = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
const splitTableRow = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());

const renderMarkdownLines = (lines: string[], keyPrefix: string, onCitationClick?: (citation: InlineCitation) => void, activeCitationId?: number, onRevealOriginal?: () => void, sourceText = '') => {
  const rendered: ReactNode[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const key = `${keyPrefix}-${index}`;
    if (line.includes('|') && isTableSeparator(lines[index + 1] || '')) {
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      let cursor = index + 2;
      while (cursor < lines.length && lines[cursor].includes('|') && lines[cursor].trim()) {
        rows.push(splitTableRow(lines[cursor]));
        cursor += 1;
      }
      rendered.push(<div key={key} className="my-5 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm"><table className="min-w-full border-collapse text-left text-sm"><thead className="bg-zinc-50 text-xs font-semibold text-zinc-500"><tr>{headers.map((header, column) => <th key={`${key}-head-${column}`} className="border-b border-zinc-200 px-4 py-3 align-top">{renderInlineMarkdown(header, `${key}-head-${column}`, onCitationClick, activeCitationId, onRevealOriginal, sourceText)}</th>)}</tr></thead><tbody className="divide-y divide-zinc-100 text-zinc-700">{rows.map((row, rowIndex) => <tr key={`${key}-row-${rowIndex}`} className="hover:bg-zinc-50/70">{headers.map((_, column) => <td key={`${key}-cell-${rowIndex}-${column}`} className="px-4 py-3 align-top leading-6">{renderInlineMarkdown(row[column] || '', `${key}-cell-${rowIndex}-${column}`, onCitationClick, activeCitationId, onRevealOriginal, sourceText)}</td>)}</tr>)}</tbody></table></div>);
      index = cursor - 1;
      continue;
    }
    if (!line.trim()) {
      rendered.push(<div key={key} className="h-3" />);
      continue;
    }
  const heading = line.match(/^(#{1,3})\s+(.+)$/);
  if (heading) {
    const level = heading[1].length;
    const className = level === 1 ? 'mt-2 text-2xl font-bold tracking-tight text-zinc-900' : level === 2 ? 'mt-9 text-xl font-semibold text-zinc-900' : 'mt-6 text-base font-semibold text-zinc-900';
    rendered.push(<h2 key={key} className={className}>{renderInlineMarkdown(heading[2], key, onCitationClick, activeCitationId, onRevealOriginal, sourceText)}</h2>);
    continue;
  }
  const task = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
  if (task) {
    rendered.push(<div key={key} className="flex gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm"><span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${task[1].toLowerCase() === 'x' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-zinc-300'}`}>{task[1].toLowerCase() === 'x' ? <Check size={12} /> : null}</span><span>{renderInlineMarkdown(task[2], key, onCitationClick, activeCitationId, onRevealOriginal, sourceText)}</span></div>);
    continue;
  }
  const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
  if (ordered) {
    rendered.push(<div key={key} className="flex gap-3 pl-1"><span className="font-medium text-zinc-400">{line.match(/^\s*(\d+)/)?.[1]}.</span><span>{renderInlineMarkdown(ordered[1], key, onCitationClick, activeCitationId, onRevealOriginal, sourceText)}</span></div>);
    continue;
  }
  const bullet = line.match(/^\s*[-*]\s+(.+)$/);
  if (bullet) {
    rendered.push(<div key={key} className="flex gap-3 pl-1"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" /><span>{renderInlineMarkdown(bullet[1], key, onCitationClick, activeCitationId, onRevealOriginal, sourceText)}</span></div>);
    continue;
  }
  rendered.push(<p key={key}>{renderInlineMarkdown(line, key, onCitationClick, activeCitationId, onRevealOriginal, sourceText)}</p>);
  }
  return rendered;
};

const RenderedDerivation = ({ content, sourceText, activeCitation, onCitationClick, onRevealOriginal }: { content: string; sourceText: string; activeCitation: InlineCitation | null; onCitationClick: (citation: InlineCitation) => void; onRevealOriginal: () => void }) => {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  // Old saved generations may still include the former appendix. Hide it so
  // they do not contradict the new inline-citation experience.
  const legacyEvidenceIndex = lines.findIndex(line => /^#{1,3}\s*原文依据\s*$/.test(line.trim()));
  const visibleLines = legacyEvidenceIndex === -1 ? lines : lines.slice(0, legacyEvidenceIndex);
  return <article className="space-y-3 text-sm leading-7 text-zinc-700">{renderMarkdownLines(visibleLines, 'line', onCitationClick, activeCitation?.id, onRevealOriginal, sourceText)}</article>;
};

interface DocWorkspaceProps {
  doc: DocItem;
  libraryName?: string;
  onUpdateDoc?: (docId: string, patch: Partial<DocItem>) => void;
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

export function DocWorkspace({ doc, libraryName, onUpdateDoc, libraries, chats, onShareDoc, isDirCollapsed, setIsDirCollapsed, initialRoleId, appliedRoleIds, onApplyDerivation, canManageDerivations, comments, onAddComment, activeUserId, reviewMode = false }: DocWorkspaceProps) {
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set<string>(initialRoleId ? [initialRoleId] : []));
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());

  // Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDerivativeMenuOpen, setIsDerivativeMenuOpen] = useState(false);
  const [isCommentPanelOpen, setIsCommentPanelOpen] = useState(reviewMode);
  const [activeDerivativeRoles, setActiveDerivativeRoles] = useState<string[]>(Array.from(appliedRoleIds));
  const [activeDerivativeDocs, setActiveDerivativeDocs] = useState<string[]>([]);
  const [loadingRoles, setLoadingRoles] = useState<Record<string, boolean>>({});
  const [generatedDerivations, setGeneratedDerivations] = useState<Record<string, GeneratedDerivation>>({});
  const [generationErrors, setGenerationErrors] = useState<Record<string, string>>({});
  const [viewingDerivativeRole, setViewingDerivativeRole] = useState<string | null>(reviewMode && canManageDerivations ? null : initialRoleId || null);
  const [highlightedCitation, setHighlightedCitation] = useState<string | null>(null);
  const [citationPreview, setCitationPreview] = useState<'1' | '2' | null>(null);
  const [inlineCitationPreview, setInlineCitationPreview] = useState<InlineCitation | null>(null);
  // Recipients with an applied role open their dedicated view. Everyone else
  // opens the original document rather than an empty workspace.
  const [showOriginal, setShowOriginal] = useState(canManageDerivations || !initialRoleId);
  const [commentAnchor, setCommentAnchor] = useState<CommentAnchor | null>(null);
  const [isCommentComposerOpen, setIsCommentComposerOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(doc.isUntitled ? '' : doc.title);
  const [bodyTitle, setBodyTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  const citationHighlightTimer = useRef<number | null>(null);
  const originalDocumentRef = useRef<HTMLDivElement>(null);
  const [mentionMenu, setMentionMenu] = useState<MentionMenu | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);

  const openCommentPanel = () => {
    setIsSidebarOpen(false);
    setIsCommentPanelOpen(true);
  };
  const saveTitle = () => {
    const title = titleDraft.trim();
    onUpdateDoc?.(doc.id, { title: title || '未命名文档', isUntitled: !title });
    setIsEditingTitle(false);
  };
  const openRolePanel = () => {
    setIsCommentPanelOpen(false);
    setIsSidebarOpen(true);
  };

  useEffect(() => {
    setActiveDerivativeRoles(previous => Array.from(new Set([...previous, ...Array.from(appliedRoleIds)])));
  }, [appliedRoleIds]);

  // Restore previously generated content after a refresh or when a document is reopened.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/derivations?sourceDocumentId=${encodeURIComponent(doc.id)}`)
      .then(response => response.ok ? response.json() : Promise.reject(new Error('无法读取已保存的衍生文档')))
      .then(data => {
        if (cancelled) return;
        const restored = (data.derivations || []).reduce((result: Record<string, GeneratedDerivation>, item: { role_id: string; content: string; related_document_ids: string[]; updated_at: string }) => {
          result[item.role_id] = { content: item.content, relatedDocumentIds: item.related_document_ids || [], generatedAt: item.updated_at };
          return result;
        }, {});
        setGeneratedDerivations(restored);
        setActiveDerivativeRoles(previous => Array.from(new Set([...previous, ...Object.keys(restored)])));
      })
      // The endpoint is unavailable in plain `vite` development. Vercel deploys it.
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [doc.id]);

  useEffect(() => {
    const closeCitationPreview = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-citation-popover], [data-citation-trigger]')) return;
      setCitationPreview(null);
      setInlineCitationPreview(null);
      setHighlightedCitation(null);
    };
    document.addEventListener('pointerdown', closeCitationPreview);
    return () => document.removeEventListener('pointerdown', closeCitationPreview);
  }, []);

  useEffect(() => () => {
    if (citationHighlightTimer.current) window.clearTimeout(citationHighlightTimer.current);
  }, []);

  useEffect(() => {
    const closeMentionMenu = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-mention-menu]')) return;
      setMentionMenu(null);
    };
    document.addEventListener('pointerdown', closeMentionMenu);
    return () => document.removeEventListener('pointerdown', closeMentionMenu);
  }, []);

  useEffect(() => {
    const closeCommentControls = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-comment-interaction]')) return;
      setCommentAnchor(null);
      setIsCommentComposerOpen(false);
    };
    document.addEventListener('pointerdown', closeCommentControls);
    return () => document.removeEventListener('pointerdown', closeCommentControls);
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

  const allDocs = libraries.flatMap(lib => lib.docs);
  // A document has one role in a source document: it is either the current
  // document, a collaborative related document, or a read-only citation.
  const unavailableCitationIds = new Set([doc.id, ...Array.from(selectedDocIds), ...activeDerivativeDocs]);
  const mentionableDocs = allDocs.filter(item => item.type !== 'folder');
  const matchingMentionDocs = mentionMenu
    ? mentionableDocs.filter(item => item.title.toLocaleLowerCase().includes(mentionMenu.query.toLocaleLowerCase()))
    : [];
  const selectableMentionDocs = matchingMentionDocs.filter(item => !unavailableCitationIds.has(item.id));

  const updateMentionMenu = () => {
    if (!canManageDerivations) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed || selection.anchorNode?.nodeType !== Node.TEXT_NODE) {
      setMentionMenu(null);
      return;
    }
    const typedText = selection.anchorNode.textContent?.slice(0, selection.anchorOffset) || '';
    const match = typedText.match(/@([^\s@]*)$/);
    if (!match) {
      setMentionMenu(null);
      return;
    }
    const range = selection.getRangeAt(0).cloneRange();
    const rect = range.getBoundingClientRect();
    setMentionMenu({
      query: match[1],
      range,
      x: Math.min(Math.max(rect.left, 16), window.innerWidth - 336),
      y: Math.min(rect.bottom + 8, window.innerHeight - 300),
    });
    setActiveMentionIndex(0);
  };

  const insertCitationMention = (referenceDoc: DocItem) => {
    if (!mentionMenu || mentionMenu.range.startContainer.nodeType !== Node.TEXT_NODE) return;
    const range = mentionMenu.range.cloneRange();
    const triggerLength = mentionMenu.query.length + 1;
    range.setStart(range.startContainer, Math.max(0, range.startOffset - triggerLength));
    range.deleteContents();
    const citation = document.createElement('span');
    citation.contentEditable = 'false';
    citation.dataset.citationDocumentId = referenceDoc.id;
    citation.title = `引用文档：${referenceDoc.title}`;
    citation.className = 'mx-1 inline-flex cursor-default select-none items-center rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 align-baseline text-sm font-medium text-indigo-700';
    citation.textContent = `引用 · ${referenceDoc.title}`;
    const trailingSpace = document.createTextNode(' ');
    range.insertNode(trailingSpace);
    range.insertNode(citation);
    const selection = window.getSelection();
    const caret = document.createRange();
    caret.setStartAfter(trailingSpace);
    caret.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(caret);
    setMentionMenu(null);
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!mentionMenu) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setMentionMenu(null);
    } else if (event.key === 'ArrowDown' && selectableMentionDocs.length) {
      event.preventDefault();
      setActiveMentionIndex(index => (index + 1) % selectableMentionDocs.length);
    } else if (event.key === 'ArrowUp' && selectableMentionDocs.length) {
      event.preventDefault();
      setActiveMentionIndex(index => (index - 1 + selectableMentionDocs.length) % selectableMentionDocs.length);
    } else if (event.key === 'Enter' && selectableMentionDocs[activeMentionIndex]) {
      event.preventDefault();
      insertCitationMention(selectableMentionDocs[activeMentionIndex]);
    }
  };

  const generateForRole = async (roleId: string, relatedDocIds: string[]) => {
    const role = roles.find(item => item.id === roleId);
    if (!role) return;
    setLoadingRoles(prev => ({ ...prev, [roleId]: true }));
    setGenerationErrors(prev => ({ ...prev, [roleId]: '' }));
    try {
      const relatedDocuments = allDocs.filter(item => relatedDocIds.includes(item.id)).map(item => ({
        id: item.id,
        title: item.title,
        content: toAiText(item.content || ''),
      }));
      const response = await fetch('/api/generate-derivation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceDocument: { id: doc.id, title: doc.title, content: toAiText(doc.content || getSourceDocumentContent()) },
          role: { id: role.id, name: role.name },
          relatedDocuments,
        }),
      });
      const responseText = await response.text();
      let data: { derivation?: { content: string; related_document_ids?: string[]; updated_at: string }; error?: string };
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(`生成请求失败（${response.status}）：${responseText.slice(0, 140) || '服务器未返回详情'}`);
      }
      if (!response.ok) throw new Error(data.error || '生成失败');
      setGeneratedDerivations(prev => ({
        ...prev,
        [roleId]: {
          content: data.derivation.content,
          relatedDocumentIds: data.derivation.related_document_ids || relatedDocIds,
          generatedAt: data.derivation.updated_at,
        },
      }));
    } catch (error) {
      setGenerationErrors(prev => ({ ...prev, [roleId]: error instanceof Error ? error.message : '生成失败，请稍后重试' }));
    } finally {
      setLoadingRoles(prev => ({ ...prev, [roleId]: false }));
    }
  };

  const handleGenerate = () => {
    const rolesArray = (Array.from(selectedRoleIds) as string[]).filter(roleId => !appliedRoleIds.has(roleId));
    if (rolesArray.length === 0) return;
    setActiveDerivativeRoles(previous => Array.from(new Set([...previous, ...rolesArray])));
    setActiveDerivativeDocs(Array.from(selectedDocIds) as string[]);
    
    setIsRoleModalOpen(false);
    setIsSidebarOpen(true);
    setIsDirCollapsed(true);
    setViewingDerivativeRole(null);
    
    // Generate only the roles the user selected. A full-document understanding
    // pass is intentionally not on this critical path: it added a serial model
    // request and made first-time generation slower than the original product.
    void Promise.all(rolesArray.map(roleId => generateForRole(roleId, Array.from(selectedDocIds))));
  };

  const selectedDocs = allDocs.filter(d => selectedDocIds.has(d.id));
  const flashOriginalCitation = (citationId: '1' | '2') => {
    setHighlightedCitation(citationId);
    if (citationHighlightTimer.current) window.clearTimeout(citationHighlightTimer.current);
    citationHighlightTimer.current = window.setTimeout(() => {
      setHighlightedCitation(null);
      citationHighlightTimer.current = null;
    }, 1000);
  };
  const openCitation = (citationId: '1' | '2') => {
    if (showOriginal) {
      setCitationPreview(null);
      flashOriginalCitation(citationId);
      return;
    }
    setCitationPreview(citationId);
    setHighlightedCitation(citationId);
  };
  const revealOriginal = () => {
    const citationToHighlight = citationPreview;
    setCitationPreview(null);
    setShowOriginal(true);
    if (citationToHighlight) flashOriginalCitation(citationToHighlight);
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
  // Same yellow, one-second source emphasis as the mock citation interaction,
  // but the target sentence now comes from Kimi's inline [[cite:...]] marker.
  const flashInlineOriginal = (quote: string) => {
    const root = originalDocumentRef.current;
    if (!root || !quote.trim()) return;
    root.querySelectorAll('[data-inline-source-highlight]').forEach(mark => mark.replaceWith(document.createTextNode(mark.textContent || '')));
    root.querySelectorAll('[data-inline-source-highlight-block]').forEach(element => element.classList.remove('rounded', 'bg-amber-200/80', 'px-0.5'));
    const normalizedQuote = normalizeCitationText(quote);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const locations: Array<{ node: Text; offset: number }> = [];
    let searchableText = '';
    let node: Text | null = walker.nextNode() as Text | null;
    while (node) {
      const rawText = node.textContent || '';
      for (let offset = 0; offset < rawText.length; offset += 1) {
        const normalizedCharacter = normalizeCitationText(rawText[offset]);
        for (const character of normalizedCharacter) {
          searchableText += character;
          locations.push({ node, offset });
        }
      }
      node = walker.nextNode() as Text | null;
    }
    const start = searchableText.indexOf(normalizedQuote);
    if (start >= 0) {
      const startLocation = locations[start];
      const endLocation = locations[start + normalizedQuote.length - 1];
      if (startLocation && endLocation && startLocation.node === endLocation.node) {
        const range = document.createRange();
        range.setStart(startLocation.node, startLocation.offset);
        range.setEnd(endLocation.node, endLocation.offset + 1);
        const mark = document.createElement('mark');
        mark.dataset.inlineSourceHighlight = 'true';
        mark.className = 'rounded bg-amber-200/80 px-0.5 text-zinc-900 transition-colors';
        range.surroundContents(mark);
        mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (citationHighlightTimer.current) window.clearTimeout(citationHighlightTimer.current);
        citationHighlightTimer.current = window.setTimeout(() => {
          mark.replaceWith(document.createTextNode(mark.textContent || ''));
          citationHighlightTimer.current = null;
        }, 1000);
        return;
      }
      // A citation may cross inline tags or source paragraphs. In that case,
      // highlight the containing source block rather than failing silently.
      const block = startLocation?.node.parentElement?.closest('p, li, td, th, h1, h2, h3, h4, h5, h6') || startLocation?.node.parentElement;
      if (block) {
        block.setAttribute('data-inline-source-highlight-block', 'true');
        block.classList.add('rounded', 'bg-amber-200/80', 'px-0.5');
        block.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (citationHighlightTimer.current) window.clearTimeout(citationHighlightTimer.current);
        citationHighlightTimer.current = window.setTimeout(() => {
          block.classList.remove('rounded', 'bg-amber-200/80', 'px-0.5');
          citationHighlightTimer.current = null;
        }, 1400);
      }
    }
  };
  const openInlineCitation = (citation: InlineCitation) => {
    if (showOriginal) {
      flashInlineOriginal(citation.quote);
      return;
    }
    setInlineCitationPreview(citation);
  };
  const revealInlineOriginal = () => {
    const citation = inlineCitationPreview;
    setInlineCitationPreview(null);
    setShowOriginal(true);
    if (citation) window.setTimeout(() => flashInlineOriginal(citation.quote), 280);
  };
  const placeCommentAnchor = (selectedText: string, rect: DOMRect, citationId?: '1' | '2', sourceText = selectedText) => {
    setCommentAnchor({
      citationId,
      selectedText: selectedText.slice(0, 180),
      sourceText: sourceText.slice(0, 220),
      x: Math.min(Math.max(rect.left + rect.width / 2, 150), window.innerWidth - 150),
      y: Math.max(rect.top - 10, 16),
    });
    setIsCommentComposerOpen(false);
  };

  const handleSelection = (sourceText?: string) => {
    if (activeUserId === 'u_jobs') return;
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    if (!selection || !selectedText || selection.rangeCount === 0) return;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    placeCommentAnchor(selectedText, rect, undefined, sourceText || selectedText);
  };

  const handleDerivativeSelection = () => handleSelection('精确的间距比例以及让人感觉自然而非机械的运动曲线。');

  const handleCitationComment = (citationId: '1' | '2', event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    const selectedText = citationId === '1' ? '关键技术实现路径与架构设计' : '跨模块依赖关系及排期影响';
    const sourceText = citationId === '1' ? '精确的间距比例以及让人感觉自然而非机械的运动曲线。' : '跨 React 和 Figma 的组件库一致性。';
    placeCommentAnchor(selectedText, event.currentTarget.getBoundingClientRect(), citationId, sourceText);
  };

  const submitComment = () => {
    if (!commentAnchor || !commentDraft.trim()) return;
    onAddComment({
      docId: doc.id,
      roleId: initialRoleId || 'backend',
      authorId: activeUserId,
      citationId: commentAnchor.citationId,
      selectedText: commentAnchor.selectedText,
      sourceText: commentAnchor.sourceText,
      content: commentDraft.trim(),
    });
    setCommentDraft('');
    setIsCommentComposerOpen(false);
    setCommentAnchor(null);
    openCommentPanel();
  };
  const submitReply = (comment: DocComment) => {
    const draft = replyDrafts[comment.id]?.trim();
    if (!draft) return;
    onAddComment({
      docId: doc.id,
      roleId: comment.roleId,
      authorId: activeUserId,
      recipientId: comment.authorId,
      replyToId: comment.id,
      citationId: comment.citationId,
      selectedText: comment.selectedText,
      sourceText: comment.sourceText,
      content: draft,
    });
    setReplyDrafts(previous => ({ ...previous, [comment.id]: '' }));
  };

  const originalHighlight = comments.find(comment => comment.authorId !== 'u_jobs' && comment.sourceText)?.sourceText;
  const highlightOriginalPhrase = (text: string) => {
    if (!originalHighlight || !text.includes(originalHighlight)) return text;
    const [before, after] = text.split(originalHighlight, 2);
    return <>{before}<mark className="rounded bg-amber-200/80 px-0.5 text-zinc-900 transition-colors">{originalHighlight}</mark>{after}</>;
  };
  const renderDerivativeHighlight = (text: string, citationId?: '1' | '2') => {
    const comment = comments.find(item => item.authorId !== 'u_jobs' && (
      (citationId && item.citationId === citationId) ||
      Boolean(item.selectedText && (text.includes(item.selectedText) || item.selectedText.includes(text)))
    ));
    if (!comment) return text;
    const selected = comment.selectedText?.trim();
    if (selected && text.includes(selected)) {
      const [before, after] = text.split(selected, 2);
      return <>{before}<mark className="rounded bg-amber-200/80 px-0.5 text-zinc-900">{selected}</mark>{after}</>;
    }
    return <mark className="rounded bg-amber-200/80 px-0.5 text-zinc-900">{text}</mark>;
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
            <span>文档</span><span className="text-zinc-300">/</span><span>{libraryName || '文档库'}</span><span className="text-zinc-300">/</span>
            {isEditingTitle ? <input autoFocus value={titleDraft} onChange={event => setTitleDraft(event.target.value)} onBlur={saveTitle} onKeyDown={event => { if (event.key === 'Enter') saveTitle(); if (event.key === 'Escape') { setTitleDraft(doc.isUntitled ? '' : doc.title); setIsEditingTitle(false); } }} className="w-40 rounded border border-indigo-300 bg-white px-1.5 py-0.5 text-sm text-zinc-900 outline-none" /> : <button onClick={() => setIsEditingTitle(true)} className={`text-left ${doc.isUntitled ? 'text-zinc-400' : 'text-zinc-900'} hover:text-indigo-600`}>{doc.title}</button>}
            {viewingDerivativeRole && <><span className="text-zinc-300">/</span><span className="text-zinc-900">{roles.find(role => role.id === viewingDerivativeRole)?.name} · 衍生文档</span></>}
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
            {canManageDerivations && <div className="relative mr-2">
              <button 
                onClick={() => activeDerivativeRoles.length === 0 ? setIsRoleModalOpen(true) : setIsDerivativeMenuOpen(open => !open)}
                className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Users size={16} />
                角色衍生
              </button>
              <AnimatePresence>
                {isDerivativeMenuOpen && <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} className="absolute right-0 top-[calc(100%+8px)] z-40 w-48 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg">
                  <button onClick={() => { openRolePanel(); setIsDerivativeMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50"><Eye size={15} className="text-indigo-600" />查看已有衍生</button>
                  <button onClick={() => { setIsRoleModalOpen(true); setIsDerivativeMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50"><Plus size={15} className="text-indigo-600" />创建新衍生</button>
                </motion.div>}
              </AnimatePresence>
            </div>}
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
          onMouseUp={() => !canManageDerivations && handleSelection()}
          className={`relative flex-1 min-w-0 overflow-y-auto ${viewingDerivativeRole ? 'border-r border-zinc-200' : ''} ${!canManageDerivations ? 'order-2 bg-white' : 'order-1'}`}
        >
          {!canManageDerivations && <button onClick={closeOriginal} aria-label="关闭原文" className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-700"><X size={17} /></button>}
          <div ref={originalDocumentRef} onKeyUp={updateMentionMenu} onKeyDown={handleEditorKeyDown} className="max-w-4xl mx-auto px-12 py-16">
            <div className="mb-6 flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-100 text-xs font-medium text-zinc-600">
                {doc.type === 'document' ? '文档' : doc.type === 'spreadsheet' ? '表格' : doc.type === 'presentation' ? '演示文稿' : '文件夹'}
              </span>
            </div>

            {doc.isBlank ? <input autoFocus value={bodyTitle} onChange={event => setBodyTitle(event.target.value)} placeholder="请输入标题" className="mb-8 w-full border-0 bg-transparent text-3xl font-bold tracking-tight text-zinc-900 placeholder:text-zinc-300 outline-none" /> : <h1 contentEditable suppressContentEditableWarning className="mb-8 cursor-text text-3xl font-bold tracking-tight text-zinc-900">{doc.title}</h1>}
            {doc.isBlank ? (
              <textarea value={bodyText} onChange={event => setBodyText(event.target.value)} onPaste={event => { const text = event.clipboardData.getData('text/plain'); if (!text) return; event.preventDefault(); onUpdateDoc?.(doc.id, { content: formatPlainTextAsDocument(text), isBlank: false }); }} placeholder="请尽情编辑文本吧……" className="min-h-[320px] w-full resize-none border-0 bg-transparent text-sm leading-relaxed text-zinc-700 placeholder:text-zinc-300 outline-none" />
            ) : doc.content ? (
              <div 
                className="imported-doc" 
                dangerouslySetInnerHTML={{ __html: doc.content }} 
                contentEditable 
                suppressContentEditableWarning 
              />
            ) : (
              <div className="space-y-6 text-sm text-zinc-700 leading-relaxed font-normal">
                <p className="outline-none" contentEditable suppressContentEditableWarning>
                  本文档作为项目的唯一事实来源。请确保在周五的站会之前，所有更新都已与相应的设计资产同步。
                </p>

                <h3 className="text-lg font-semibold text-zinc-900 mt-12 mb-4 outline-none" contentEditable suppressContentEditableWarning>
                  1. 执行摘要
                </h3>
                
                <p onClick={() => comments.some(comment => comment.authorId !== 'u_jobs') && openCommentPanel()} className={`outline-none transition-colors duration-500 ${highlightedCitation === '1' ? 'bg-amber-100/80 rounded px-1' : ''} ${comments.some(comment => comment.authorId !== 'u_jobs' && comment.sourceText) ? 'cursor-pointer' : ''}`} contentEditable={!reviewMode} suppressContentEditableWarning>
                  {highlightOriginalPhrase('我们的目标是整合所有平台的设计语言系统。主要目标是减少认知负荷，同时保持企业客户所需的高端质感。新界面在很大程度上依赖于微妙的对比度、精确的间距比例以及让人感觉自然而非机械的运动曲线。')}
                </p>
                {!reviewMode && comments.filter(comment => comment.citationId === '1' && comment.authorId !== 'u_jobs').map(comment => <div key={comment.id} className="mt-3 ml-1 max-w-md rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-sm text-indigo-900"><span className="font-semibold">陈莎莎 · </span>{comment.content}</div>)}

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

                <h3 className="text-lg font-semibold text-zinc-900 mt-12 mb-4 outline-none" contentEditable suppressContentEditableWarning>
                  2. 关键交付物
                </h3>
                <ul className={`list-disc pl-5 space-y-2 outline-none transition-colors duration-500 ${highlightedCitation === '2' ? 'bg-amber-100/80 rounded px-1 py-1' : ''}`} contentEditable suppressContentEditableWarning>
                  <li>确定间距令牌和排版比例。</li>
                  <li>跨 React 和 Figma 的组件库一致性。</li>
                  <li>针对所有界面颜色的 WCAG AA 无障碍标准合规性审计。</li>
                </ul>
                {!reviewMode && comments.filter(comment => comment.citationId === '2' && comment.authorId !== 'u_jobs').map(comment => <div key={comment.id} className="mt-3 ml-1 max-w-md rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-sm text-indigo-900"><span className="font-semibold">陈莎莎 · </span>{comment.content}</div>)}
              </div>
            )}
          </div>
          <AnimatePresence>
            {mentionMenu && <motion.div
              data-mention-menu
              role="listbox"
              aria-label="插入引用文档"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              style={{ left: mentionMenu.x, top: mentionMenu.y }}
              className="fixed z-50 w-80 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl"
            >
              <div className="flex items-center gap-2 px-2.5 py-2 text-xs font-medium text-zinc-500"><AtSign size={14} className="text-indigo-600" />引用文档</div>
              {matchingMentionDocs.length ? matchingMentionDocs.map(item => {
                const unavailable = unavailableCitationIds.has(item.id);
                const selectableIndex = selectableMentionDocs.findIndex(candidate => candidate.id === item.id);
                return <button
                  key={item.id}
                  type="button"
                  role="option"
                  disabled={unavailable}
                  aria-selected={!unavailable && selectableIndex === activeMentionIndex}
                  aria-label={`${item.title}${item.id === doc.id ? '，当前原文档，不可引用' : unavailable ? '，已关联为协作文档，不可引用' : ''}`}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => insertCitationMention(item)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors ${unavailable ? 'cursor-not-allowed opacity-45' : selectableIndex === activeMentionIndex ? 'bg-indigo-50 text-indigo-900' : 'text-zinc-700 hover:bg-zinc-50'}`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500"><FileText size={15} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.title}</span><span className="mt-0.5 block text-xs text-zinc-400">{item.author} · {item.updatedAt}</span></span>
                  {unavailable && <span className="shrink-0 text-xs text-zinc-400">{item.id === doc.id ? '当前文档' : '已关联'}</span>}
                </button>;
              }) : <p className="px-2.5 py-5 text-center text-sm text-zinc-400">没有匹配的文档</p>}
            </motion.div>}
          </AnimatePresence>
        </motion.div>}
        </AnimatePresence>

        {/* Generated Document View */}
        {viewingDerivativeRole && (
          <motion.div onMouseUp={handleDerivativeSelection} layout transition={{ duration: 0.26, ease: 'easeOut' }} className={`flex-1 min-w-0 overflow-y-auto bg-zinc-50/50 ${!canManageDerivations ? 'order-1' : 'order-2'}`}>
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
              
              {generatedDerivations[viewingDerivativeRole] ? (
                <RenderedDerivation
                  content={generatedDerivations[viewingDerivativeRole].content}
                  sourceText={toAiText(doc.content || getSourceDocumentContent())}
                  activeCitation={inlineCitationPreview}
                  onCitationClick={openInlineCitation}
                  onRevealOriginal={revealInlineOriginal}
                />
              ) : (
              <div className="space-y-6 text-sm text-zinc-700 leading-relaxed">
                <p>
                  此文档是基于 <span className="font-semibold">{doc.title}</span> 
                  {activeDerivativeDocs.length > 0 && <span> 结合 {activeDerivativeDocs.length} 篇关联知识</span>} 
                  ，专为 <span className="font-semibold text-indigo-600">{roles.find(r => r.id === viewingDerivativeRole)?.name}</span> 视角生成的摘要和行动指南。
                </p>

                <div className="relative rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                   <h3 className="text-base font-semibold text-zinc-900 mb-3 flex items-center gap-2">
                     核心关注点提取
                   </h3>
                   <ul className="list-disc pl-5 space-y-2 text-zinc-600">
                     <li onClick={() => comments.some(comment => comment.citationId === '1' && comment.authorId !== 'u_jobs') && openCommentPanel()} className={comments.some(comment => comment.citationId === '1' && comment.authorId !== 'u_jobs') ? 'cursor-pointer' : ''}>{renderDerivativeHighlight('关键技术实现路径与架构设计', '1')} <span className="relative inline-block"><sup data-citation-trigger className="cursor-pointer text-indigo-500 hover:text-indigo-700" onClick={event => { event.stopPropagation(); openCitation('1'); }} onContextMenu={event => handleCitationComment('1', event)}>[1]</sup>{citationPreview === '1' && <span className="pointer-events-none absolute bottom-[calc(100%+14px)] left-1/2 z-30 block w-[390px] -translate-x-1/2"><span className="pointer-events-auto block">{renderCitationCard('1')}</span></span>}</span></li>
                     <li onClick={() => comments.some(comment => comment.citationId === '2' && comment.authorId !== 'u_jobs') && openCommentPanel()} className={comments.some(comment => comment.citationId === '2' && comment.authorId !== 'u_jobs') ? 'cursor-pointer' : ''}>{renderDerivativeHighlight('跨模块依赖关系及排期影响', '2')} <span className="relative inline-block"><sup data-citation-trigger className="cursor-pointer text-indigo-500 hover:text-indigo-700" onClick={event => { event.stopPropagation(); openCitation('2'); }} onContextMenu={event => handleCitationComment('2', event)}>[2]</sup>{citationPreview === '2' && <span className="pointer-events-none absolute bottom-[calc(100%+14px)] left-1/2 z-30 block w-[390px] -translate-x-1/2"><span className="pointer-events-auto block">{renderCitationCard('2')}</span></span>}</span></li>
                     <li>从关联文档中提取的风险预警</li>
                   </ul>
                </div>
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
              )}
            </div>
          </motion.div>
        )}

        <AnimatePresence>
          {commentAnchor && !isCommentComposerOpen && (
            <motion.div
              data-comment-interaction
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.96 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              style={{ left: commentAnchor.x, top: Math.max(commentAnchor.y - 48, 12) }}
              className="fixed z-50 -translate-x-1/2 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl"
              onMouseDown={event => event.preventDefault()}
            >
              <button onClick={() => setIsCommentComposerOpen(true)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-indigo-50 hover:text-indigo-700">
                <MessageCircle size={16} /> 评论
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {commentAnchor && isCommentComposerOpen && (
            <motion.div
              data-comment-interaction
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              style={{ left: commentAnchor.x, top: Math.min(commentAnchor.y + 12, window.innerHeight - 250) }}
              className="fixed z-50 w-[320px] -translate-x-1/2 rounded-2xl border border-indigo-100 bg-white p-4 shadow-2xl"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="text-sm font-semibold text-zinc-900">添加评论</p><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">“{commentAnchor.selectedText}”</p></div>
                <button onClick={() => { setIsCommentComposerOpen(false); setCommentAnchor(null); }} aria-label="关闭评论" className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X size={16} /></button>
              </div>
              <textarea autoFocus value={commentDraft} onChange={event => setCommentDraft(event.target.value)} placeholder="写下你的评论…" className="min-h-24 w-full resize-none rounded-xl border border-zinc-200 p-3 text-sm outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              <div className="mt-3 flex justify-end gap-2"><button onClick={() => { setIsCommentComposerOpen(false); setCommentAnchor(null); }} className="px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-700">取消</button><button disabled={!commentDraft.trim()} onClick={submitComment} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">发送</button></div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Derivative Sidebar */}
        <AnimatePresence initial={false}>
        {(isSidebarOpen || isCommentPanelOpen) && (
          <motion.aside
            initial={{ width: 0, x: 320, opacity: 0 }}
            animate={{ width: 320, x: 0, opacity: 1 }}
            exit={{ width: 0, x: 320, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="order-3 ml-auto shrink-0 overflow-hidden border-l border-zinc-200 bg-white flex flex-col z-10 shadow-[-4px_0_12px_rgba(0,0,0,0.02)]"
          >
            <div className="h-[72px] border-b border-zinc-100 flex items-center px-5 justify-between shrink-0">
              <span className="font-semibold text-sm text-zinc-900">{isCommentPanelOpen ? '文档评论' : '角色衍生'}</span>
              <button 
                onClick={() => isCommentPanelOpen ? setIsCommentPanelOpen(false) : setIsSidebarOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-md hover:bg-zinc-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isCommentPanelOpen ? <div className="p-4 space-y-3">
                {comments.filter(comment => comment.authorId !== 'u_jobs').map(comment => {
                  const reply = comments.find(item => item.replyToId === comment.id);
                  return <div key={comment.id} className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-3.5">
                    <div className="flex items-center gap-2 text-xs"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700">陈</span><span className="font-semibold text-zinc-900">陈莎莎（后端）</span><span className="text-zinc-400">{comment.createdAt}</span></div>
                    <p className="mt-3 text-sm leading-relaxed text-zinc-700">{comment.content}</p>
                    {comment.sourceText && <p className="mt-2 border-l-2 border-amber-300 pl-2 text-xs leading-relaxed text-zinc-500">定位原文：{comment.sourceText}</p>}
                    {reply ? <div className="mt-3 border-t border-zinc-200/80 pt-3"><p className="text-xs font-semibold text-indigo-700">乔布斯的回复</p><p className="mt-1 text-sm leading-relaxed text-zinc-700">{reply.content}</p></div> : activeUserId === 'u_jobs' ? <div className="mt-3 border-t border-zinc-200/80 pt-3"><textarea value={replyDrafts[comment.id] || ''} onChange={event => setReplyDrafts(previous => ({ ...previous, [comment.id]: event.target.value }))} placeholder="回复陈莎莎…" className="min-h-16 w-full resize-none rounded-lg border border-zinc-200 bg-white p-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /><div className="mt-2 flex justify-end"><button onClick={() => submitReply(comment)} disabled={!replyDrafts[comment.id]?.trim()} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">发送回复</button></div></div> : null}
                  </div>;
                })}
                {comments.filter(comment => comment.authorId !== 'u_jobs').length === 0 && <div className="py-12 text-center text-sm text-zinc-400">暂时没有文档评论</div>}
              </div> : <>
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
                      
                      {(generatedDerivations[roleId]?.relatedDocumentIds || activeDerivativeDocs).length > 0 && (
                        <div className="flex flex-col gap-1.5 mt-1">
                          {(generatedDerivations[roleId]?.relatedDocumentIds || activeDerivativeDocs).map(docId => {
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
                        <div className="mt-2">
                          {generationErrors[roleId] && <p className="mb-2 rounded-lg bg-rose-50 p-2 text-xs leading-relaxed text-rose-700">{generationErrors[roleId]}</p>}
                          <div className="flex gap-2">
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
                              void generateForRole(roleId, generatedDerivations[roleId]?.relatedDocumentIds || activeDerivativeDocs);
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
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              </>}
            </div>
            {!isCommentPanelOpen && canManageDerivations && <div className="p-4 border-t border-zinc-100">
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
                    const isApplied = appliedRoleIds.has(role.id);
                    const isSelected = isApplied || selectedRoleIds.has(role.id);
                    return (
                      <button
                        key={role.id}
                        disabled={isApplied}
                        onClick={() => !isApplied && toggleRoleSelection(role.id)}
                        className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                          isApplied
                            ? 'cursor-not-allowed border-emerald-200 bg-emerald-50 text-emerald-700'
                            : isSelected 
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                            : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                        }`}
                      >
                        {role.name}
                        {isApplied ? <span className="text-xs font-semibold">已启用</span> : isSelected && <Check size={16} />}
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
                  disabled={(Array.from(selectedRoleIds) as string[]).filter(roleId => !appliedRoleIds.has(roleId)).length === 0}
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
