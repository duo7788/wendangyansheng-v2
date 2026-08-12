import { Share, MessageSquare, MoreHorizontal, Clock, Star, Play, Users, X, FileText, Check, User, Sparkles, PanelLeftOpen, Plus, Eye, MessageCircle, AtSign, ChevronLeft, ChevronRight, PenLine } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DocItem, DocLibrary, ChatItem, DocComment, DerivationSnapshot, GeneratedDerivation, ChallengeTask, VisualOverview } from '../../types';
import { formatPlainTextAsDocument } from './DocEmptyState';
import { USERS } from '../../App';

type CommentAnchor = {
  citationId?: '1' | '2';
  selectedText: string;
  sourceText: string;
  x: number;
  y: number;
};

type MentionMenu = {
  query: string;
  range: Range;
  x: number;
  y: number;
};

type ChallengeMessage = { role: { id: string; name: string }; content: string; isConflict?: boolean };
type SourceImage = { id: string; src: string; alt: string };

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

const sourceImagesFromContent = (content: string): SourceImage[] => {
  const parsed = new DOMParser().parseFromString(content, 'text/html');
  return Array.from(parsed.images).flatMap((image, index) => {
    const src = image.currentSrc || image.getAttribute('src') || '';
    if (!src) return [];
    return [{ id: `source-image-${index + 1}`, src, alt: image.getAttribute('alt') || `原文图片 ${index + 1}` }];
  });
};

const hashSourceText = async (content: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
};

// A cosmetic edit must not make every role view look stale. This normalized
// version is shared with the generation API: it intentionally ignores spaces
// and punctuation, while preserving every meaningful letter and number.
const meaningfulSourceVersion = (content: string) => content
  .normalize('NFKC')
  .replace(/[\s\p{P}\p{S}]+/gu, '');

const numericTokens = (text: string) => [...text.matchAll(/[0-9０-９][0-9０-９.,，]*(?:[\-–—][0-9０-９][0-9０-９.,，]*)?/g)].map(match => match[0]);

const findSingleNumericReplacement = (before: string, after: string) => {
  // Compare complete numeric values/ranges independently from rich-text
  // structure. A contentEditable blur can normalise line breaks or wrappers,
  // but it must not prevent 0–10000 → 0–20000 from being recognised.
  const beforeTokens = numericTokens(before);
  const afterTokens = numericTokens(after);
  if (beforeTokens.length !== afterTokens.length) return null;
  const changed = beforeTokens.flatMap((token, index) => token === afterTokens[index] ? [] : [{ oldText: token, newText: afterTokens[index] }]);
  return changed.length === 1 ? changed[0] : null;
};

const findReplacementFromStaleCitations = (derivations: GeneratedDerivation[], currentSource: string) => {
  const currentNumbers = [...new Set(numericTokens(currentSource))];
  const candidates = new Map<string, { oldText: string; newText: string }>();
  derivations.forEach(derivation => {
    [...derivation.content.matchAll(/\[\[cite:([^\]]+)\]\]/g)].forEach(match => {
      const rawCitation = match[1];
      const separator = rawCitation.indexOf('|');
      const quote = (separator >= 0 ? rawCitation.slice(separator + 1) : rawCitation).trim();
      numericTokens(quote).forEach(oldText => currentNumbers.forEach(newText => {
        if (oldText === newText) return;
        if (currentSource.includes(replaceExactText(quote, oldText, newText))) {
          candidates.set(`${oldText}\u0000${newText}`, { oldText, newText });
        }
      }));
    });
  });
  return candidates.size === 1 ? [...candidates.values()][0] : null;
};

// This deliberately covers the lightweight editing case in the prototype:
// one short value or wording replacement (for example, 0–1000 → 0–2000).
// It is not used for structural or multi-location document rewrites.
const getSimpleSourceReplacement = (before: string, after: string) => {
  if (before === after) return null;
  const numericReplacement = findSingleNumericReplacement(before, after);
  if (numericReplacement) return numericReplacement;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let beforeStart = start;
  let afterStart = start;
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  // A character-level diff within 0–1000 → 0–2000 is only “1 → 2”. Extend
  // that diff to the complete numeric token so unrelated 1s are never touched.
  const numericTokenCharacter = (value: string | undefined) => Boolean(value && /[0-9０-９.,，\-–—]/.test(value));
  const isNumericChange = numericTokenCharacter(before[beforeStart]) || numericTokenCharacter(after[afterStart]) || numericTokenCharacter(before[beforeStart - 1]) || numericTokenCharacter(after[afterStart - 1]);
  if (isNumericChange) {
    while (beforeStart > 0 && numericTokenCharacter(before[beforeStart - 1])) beforeStart -= 1;
    while (afterStart > 0 && numericTokenCharacter(after[afterStart - 1])) afterStart -= 1;
    while (beforeEnd < before.length && numericTokenCharacter(before[beforeEnd])) beforeEnd += 1;
    while (afterEnd < after.length && numericTokenCharacter(after[afterEnd])) afterEnd += 1;
  }
  const oldText = before.slice(beforeStart, beforeEnd).trim();
  const newText = after.slice(afterStart, afterEnd).trim();
  // One-character non-numeric replacements are too ambiguous for a safe
  // document-wide exact substitution; ask the user to keep those as a manual
  // regeneration instead.
  if (!oldText || !newText || oldText.length > 48 || newText.length > 48 || (!isNumericChange && (oldText.length < 2 || newText.length < 2))) {
    return findSingleNumericReplacement(before, after);
  }
  return { oldText, newText };
};

const replaceExactText = (content: string, oldText: string, newText: string) => content.split(oldText).join(newText);

const markUpdatedPhrases = (content: string, phrases: string[]) => {
  const uniquePhrases = [...new Set(phrases.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!uniquePhrases.length) return content;
  // Never alter citation, history, or image marker syntax while decorating the
  // visible Markdown. Those tokens are parsed separately below.
  return content.split(/(\[\[cite:[\s\S]*?\]\]|\[\[history:[^\]]+\]\]|\[\[image:[^\]]+\]\])/g)
    .map(part => {
      if (/^\[\[(?:cite|history|image):/.test(part)) return part;
      return uniquePhrases.reduce((marked, phrase) => marked.split(phrase).join(`[[updated:${phrase}]]`), part);
    })
    .join('');
};

type InlineCitation = { id: number; quote: string; sourceDocumentId?: string };

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

const HistoryLogicTag = ({ source }: { source: string; key?: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  return <span className="relative ml-1 inline-block align-baseline">
    <button type="button" aria-expanded={isOpen} onClick={event => { event.stopPropagation(); setIsOpen(open => !open); }} className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 transition-colors hover:border-emerald-300 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-200">历史逻辑</button>
    {isOpen && <span className="absolute left-1/2 top-[calc(100%+10px)] z-30 block w-72 -translate-x-1/2 rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-xl">
      <span className="block text-[11px] font-medium text-zinc-400">代码来源</span>
      <span className="mt-1.5 block cursor-default break-all text-xs font-medium text-blue-600 underline underline-offset-2">{source}</span>
      <span className="mt-2 block text-[11px] leading-relaxed text-zinc-400">历史逻辑仅展示来源，不支持查看</span>
      <span aria-hidden="true" className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-l border-t border-zinc-200 bg-white" />
    </span>}
  </span>;
};

const DerivationImage = ({ image }: { image: SourceImage; key?: string }) => <figure className="my-6 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
  <img src={image.src} alt={image.alt} className="max-h-[420px] w-full object-contain" loading="lazy" />
  {image.alt && <figcaption className="border-t border-zinc-100 bg-white px-3 py-2 text-xs text-zinc-500">{image.alt}</figcaption>}
</figure>;

const renderInlineMarkdown = (text: string, keyPrefix: string, onCitationClick?: (citation: InlineCitation) => void, activeCitationId?: number, onRevealOriginal?: () => void, sourceText = '', citationSourceTexts: Record<string, string> = {}, citationNumbers: Record<string, number> = {}): ReactNode[] => {
  const tokens = text.split(/(\[\[cite:[\s\S]*?\]\]|\[\[history:[^\]]+\]\]|\[\[updated:[\s\S]*?\]\]|\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.startsWith('[[history:') && token.endsWith(']]')) return <HistoryLogicTag key={key} source={token.slice(10, -2).trim()} />;
    if (token.startsWith('[[updated:') && token.endsWith(']]')) return <mark key={key} className="rounded bg-violet-100 px-1 py-0.5 font-semibold text-violet-800 ring-1 ring-violet-200">{token.slice(10, -2)}</mark>;
    if (token.startsWith('[[cite:') && token.endsWith(']]')) {
      const rawCitation = token.slice(7, -2).trim();
      const separator = rawCitation.indexOf('|');
      const sourceDocumentId = separator >= 0 ? rawCitation.slice(0, separator).trim() : undefined;
      const quote = (separator >= 0 ? rawCitation.slice(separator + 1) : rawCitation).trim();
      const citation = { id: sourceDocumentId ? (citationNumbers[sourceDocumentId] || 1) : Number(keyPrefix.replace(/\D/g, '')) + 1, quote, sourceDocumentId };
      const context = citationContext(sourceDocumentId ? (citationSourceTexts[sourceDocumentId] || sourceText) : sourceText, citation.quote);
      return <span key={key} className="relative ml-1 inline-block align-baseline"><button type="button" data-citation-trigger onClick={event => { event.stopPropagation(); onCitationClick?.(citation); }} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">[{citation.id}]</button>{activeCitationId === citation.id && <span data-citation-popover className="absolute bottom-[calc(100%+12px)] left-1/2 z-30 block w-[360px] -translate-x-1/2 rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-xl"><span className="block text-xs font-medium text-zinc-400">原文定位 · [{citation.id}]</span><span className="mt-2 block text-xs leading-relaxed text-zinc-300">{context.before}</span><span className="block text-sm font-semibold leading-relaxed text-zinc-900">{context.focus}</span><span className="block text-xs leading-relaxed text-zinc-300">{context.after}</span><button type="button" onClick={onRevealOriginal} className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">查看原文</button><span className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-zinc-200 bg-white" /></span>}</span>;
    }
    if (token.startsWith('**') && token.endsWith('**')) return <strong key={key} className="font-semibold text-zinc-900">{token.slice(2, -2)}</strong>;
    if (token.startsWith('`') && token.endsWith('`')) return <code key={key} className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.9em] text-zinc-800">{token.slice(1, -1)}</code>;
    return <span key={key}>{token}</span>;
  });
};

const isTableSeparator = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
const splitTableRow = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());

const renderMarkdownLines = (lines: string[], keyPrefix: string, onCitationClick?: (citation: InlineCitation) => void, activeCitationId?: number, onRevealOriginal?: () => void, sourceText = '', citationSourceTexts: Record<string, string> = {}, citationNumbers: Record<string, number> = {}, historySources: string[] = [], sourceImages: SourceImage[] = []) => {
  const rendered: ReactNode[] = [];
  let nextHistorySource = 0;
  let fallbackImageIndex = 0;
  let hasSeenLargeHeading = false;
  const imageById = new Map(sourceImages.map(image => [image.id, image]));
  const placedImageIds = new Set(lines.flatMap(line => [...line.matchAll(/^\s*\[\[image:([^\]]+)\]\]\s*$/g)].map(match => match[1].trim())).filter(id => imageById.has(id)));
  const fallbackImages = sourceImages.filter(image => !placedImageIds.has(image.id));
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const key = `${keyPrefix}-${index}`;
    const imageMarker = line.match(/^\s*\[\[image:([^\]]+)\]\]\s*$/);
    if (imageMarker) {
      const image = imageById.get(imageMarker[1].trim());
      if (image) rendered.push(<DerivationImage key={`${key}-image`} image={image} />);
      continue;
    }
    if (line.includes('|') && isTableSeparator(lines[index + 1] || '')) {
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      let cursor = index + 2;
      while (cursor < lines.length && lines[cursor].includes('|') && lines[cursor].trim()) {
        rows.push(splitTableRow(lines[cursor]));
        cursor += 1;
      }
      rendered.push(<div key={key} className="my-5 rounded-xl border border-zinc-200 bg-white shadow-sm"><table className="min-w-full border-collapse text-left text-sm"><thead className="bg-zinc-50 text-xs font-semibold text-zinc-500"><tr>{headers.map((header, column) => <th key={`${key}-head-${column}`} className="border-b border-zinc-200 px-4 py-3 align-top">{renderInlineMarkdown(header, `${key}-head-${column}`, onCitationClick, activeCitationId, onRevealOriginal, sourceText, citationSourceTexts, citationNumbers)}</th>)}</tr></thead><tbody className="divide-y divide-zinc-100 text-zinc-700">{rows.map((row, rowIndex) => <tr key={`${key}-row-${rowIndex}`} className="hover:bg-zinc-50/70">{headers.map((_, column) => <td key={`${key}-cell-${rowIndex}-${column}`} className="px-4 py-3 align-top leading-6">{renderInlineMarkdown(row[column] || '', `${key}-cell-${rowIndex}-${column}`, onCitationClick, activeCitationId, onRevealOriginal, sourceText, citationSourceTexts, citationNumbers)}</td>)}</tr>)}</tbody></table></div>);
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
    if (level === 2 && hasSeenLargeHeading && fallbackImages[fallbackImageIndex]) rendered.push(<DerivationImage key={`${key}-fallback-image`} image={fallbackImages[fallbackImageIndex++]} />);
    if (level === 2) hasSeenLargeHeading = true;
    const historySource = level === 2 ? historySources[nextHistorySource++] : undefined;
    rendered.push(<h2 key={key} className={`${className} flex items-center gap-3`}>{renderInlineMarkdown(heading[2], key, onCitationClick, activeCitationId, onRevealOriginal, sourceText, citationSourceTexts, citationNumbers)}{historySource && <HistoryLogicTag source={historySource} />}</h2>);
    continue;
  }
  const task = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
  if (task) {
    rendered.push(<div key={key} className="flex gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm"><span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${task[1].toLowerCase() === 'x' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-zinc-300'}`}>{task[1].toLowerCase() === 'x' ? <Check size={12} /> : null}</span><span>{renderInlineMarkdown(task[2], key, onCitationClick, activeCitationId, onRevealOriginal, sourceText, citationSourceTexts, citationNumbers)}</span></div>);
    continue;
  }
  const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
  if (ordered) {
    rendered.push(<div key={key} className="flex gap-3 pl-1"><span className="font-medium text-zinc-400">{line.match(/^\s*(\d+)/)?.[1]}.</span><span>{renderInlineMarkdown(ordered[1], key, onCitationClick, activeCitationId, onRevealOriginal, sourceText, citationSourceTexts, citationNumbers)}</span></div>);
    continue;
  }
  const bullet = line.match(/^\s*[-*]\s+(.+)$/);
  if (bullet) {
    rendered.push(<div key={key} className="flex gap-3 pl-1"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" /><span>{renderInlineMarkdown(bullet[1], key, onCitationClick, activeCitationId, onRevealOriginal, sourceText, citationSourceTexts, citationNumbers)}</span></div>);
    continue;
  }
  rendered.push(<p key={key}>{renderInlineMarkdown(line, key, onCitationClick, activeCitationId, onRevealOriginal, sourceText, citationSourceTexts, citationNumbers)}</p>);
  }
  while (fallbackImages[fallbackImageIndex]) rendered.push(<DerivationImage key={`${keyPrefix}-tail-image-${fallbackImageIndex}`} image={fallbackImages[fallbackImageIndex++]} />);
  return rendered;
};

const derivationTitle = (content: string, fallback: string) => {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1].trim() || fallback;
};

const RenderedDerivation = ({ content, updatedPhrases = [], hideLeadingTitle = false, sourceText, citationSourceTexts, citationNumbers, sourceImages = [], activeCitation, onCitationClick, onRevealOriginal }: { content: string; updatedPhrases?: string[]; hideLeadingTitle?: boolean; sourceText: string; citationSourceTexts?: Record<string, string>; citationNumbers?: Record<string, number>; sourceImages?: SourceImage[]; activeCitation: InlineCitation | null; onCitationClick: (citation: InlineCitation) => void; onRevealOriginal: () => void }) => {
  const decoratedContent = markUpdatedPhrases(content, updatedPhrases);
  const lines = decoratedContent.replace(/\r\n/g, '\n').split('\n');
  // Old saved generations may still include the former appendix. Hide it so
  // they do not contradict the new inline-citation experience.
  const legacyEvidenceIndex = lines.findIndex(line => /^#{1,3}\s*原文依据\s*$/.test(line.trim()));
  const visibleLines = (legacyEvidenceIndex === -1 ? lines : lines.slice(0, legacyEvidenceIndex));
  const historySources = [...decoratedContent.matchAll(/\[\[history:([^\]]+)\]\]/g)].map(match => match[1].trim());
  const contentWithoutHistoryMarkers = visibleLines.map(line => line.replace(/\s*\[\[history:[^\]]+\]\]/g, ''));
  if (hideLeadingTitle && /^#\s+/.test(contentWithoutHistoryMarkers[0]?.trim() || '')) contentWithoutHistoryMarkers.splice(0, 1);
  return <article className="space-y-3 text-sm leading-7 text-zinc-700">{renderMarkdownLines(contentWithoutHistoryMarkers, 'line', onCitationClick, activeCitation?.id, onRevealOriginal, sourceText, citationSourceTexts, citationNumbers, historySources, sourceImages)}</article>;
};

const MindMapOverview = ({ overview, roleName }: { overview: VisualOverview; roleName: string }) => {
  const positions = [[72, 56], [572, 56], [72, 248], [572, 248]];
  return <section className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-6">
    <div className="mb-5"><p className="text-xs font-semibold tracking-wide text-zinc-500">PROJECT OVERVIEW</p><p className="mt-2 text-sm text-zinc-500">为 {roleName} 整理的项目速览</p></div>
    <div className="overflow-x-auto pb-1">
      <div className="relative mx-auto h-[410px] min-w-[760px] rounded-xl border border-zinc-200 bg-white" aria-label={`${overview.title}项目思维导图`}>
        <svg aria-hidden="true" viewBox="0 0 760 410" className="absolute inset-0 h-full w-full">
          {overview.branches.slice(0, 4).map((branch, index) => {
            const [x, y] = positions[index];
            const isKey = /风险|待确认|关键/.test(branch.title);
            const targetX = x < 380 ? x + 184 : x;
            return <path key={branch.title} d={`M380 205 C380 ${y + 46}, ${targetX} ${y + 46}, ${targetX} ${y + 46}`} fill="none" stroke={isKey ? '#7C3AED' : '#D4D4D8'} strokeWidth="1.5" />;
          })}
        </svg>
        <div className="absolute left-1/2 top-1/2 z-10 w-44 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-zinc-950 px-4 py-4 text-center text-sm font-semibold leading-5 text-white shadow-lg">{overview.title}</div>
        {overview.branches.slice(0, 4).map((branch, index) => {
          const [left, top] = positions[index];
          const isKey = /风险|待确认|关键/.test(branch.title);
          return <div key={branch.title} style={{ left, top }} className={`absolute w-[184px] rounded-xl border p-3 ${isKey ? 'border-violet-200 bg-violet-50' : 'border-zinc-200 bg-white'}`}>
            <p className={`text-xs font-semibold ${isKey ? 'text-violet-700' : 'text-zinc-800'}`}>{branch.title}</p>
            <ul className="mt-2 space-y-1.5">{branch.items.map(item => <li key={item} className="flex gap-1.5 text-[11px] leading-4 text-zinc-600"><span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${isKey ? 'bg-violet-500' : 'bg-zinc-400'}`} />{item}</li>)}</ul>
          </div>;
        })}
      </div>
    </div>
  </section>;
};

const PIXEL_ROLE_COLORS: Record<string, string> = {
  backend: '#18181B',
  frontend: '#3B82F6',
  ui: '#8B5CF6',
  qa: '#22C55E',
};

const PixelSpeaker = ({ roleId, roleName, speaking, flipped = false }: { roleId: string; roleName: string; speaking: boolean; flipped?: boolean }) => {
  const [talkFrame, setTalkFrame] = useState(false);
  const clothingColor = PIXEL_ROLE_COLORS[roleId] || '#71717A';

  useEffect(() => {
    if (!speaking) {
      setTalkFrame(false);
      return;
    }
    setTalkFrame(false);
    const intervalId = window.setInterval(() => setTalkFrame(frame => !frame), 300);
    return () => window.clearInterval(intervalId);
  }, [speaking]);

  return <div className="flex w-12 shrink-0 flex-col items-center gap-1 text-center">
    <span className="max-w-full truncate text-[10px] font-semibold text-zinc-800">{roleName.replace('工程师', '')}</span>
    <svg width="42" height="41" viewBox="0 0 31 30" fill="none" role="img" aria-label={`${roleName}${speaking ? '正在发言' : ''}`} className={`overflow-visible [image-rendering:pixelated] ${flipped ? '-scale-x-100' : ''}`}>
      <rect x="4.50293" width="14.6361" height="11.2586" fill="black" />
      <rect x="18.5767" y="2.25171" width="5.06635" height="11.2586" fill="black" />
      <rect x="1.68896" y="2.81464" width="2.81464" height="7.88099" fill="black" />
      <rect y="10.6956" width="6.75513" height="7.31806" fill="black" />
      <rect x="6.75488" y="9.00685" width="14.0732" height="10.1327" fill="#FFEBD8" />
      <rect x="4.50293" y="11.2586" width="2.25171" height="4.50342" fill="#FFEBD8" />
      <rect x="0.562988" y="19.1395" width="15.762" height="7.88099" fill={clothingColor} />
      <rect x="16.3247" y="16.3249" width="14.0732" height="7.88099" fill="#C6C6C6" />
      <rect x="16.2124" y="23.643" width="14.1858" height="5.40411" fill="#C6C6C6" />
      <rect x="6.07959" y="27.0205" width="10.1327" height="2.02654" fill="#C6C6C6" />
      {talkFrame ? <motion.g key="talking" initial={{ opacity: 0.5 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}><rect x="10" y="21" width="5.06635" height="3.37757" fill="#FFEBD8" /><rect x="11" y="12" width="2" height="2" fill="black" /><rect x="16" y="12" width="2" height="2" fill="black" /></motion.g> : <motion.g key="resting" initial={{ opacity: 0.5 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}><rect x="9.56982" y="23.643" width="5.06635" height="3.37757" fill="#FFEBD8" /><rect x="10.6953" y="11.8215" width="1.68878" height="3.37757" fill="black" /><rect x="16.3247" y="11.8215" width="1.68878" height="3.37757" fill="black" /></motion.g>}
    </svg>
  </div>;
};

interface DocWorkspaceProps {
  doc: DocItem;
  libraryName?: string;
  onUpdateDoc?: (docId: string, patch: Partial<DocItem>) => void;
  libraries: DocLibrary[];
  chats: ChatItem[];
  onShareDoc: (chatIds: string[], doc: DocItem) => void;
  isDirCollapsed: boolean;
  setIsDirCollapsed: (collapsed: boolean) => void;
  initialRoleId?: string | null;
  appliedRoleIds: Set<string>;
  onApplyDerivation: (docId: string, roleId: string, shouldApply: boolean) => void;
  onGeneratedDerivation: (docId: string, roleId: string) => void;
  storedDerivations: Record<string, GeneratedDerivation>;
  onStoreGeneratedDerivation: (docId: string, roleId: string, derivation: GeneratedDerivation) => void;
  derivationSnapshots: DerivationSnapshot[];
  onRecordDerivationSnapshot: (snapshot: Omit<DerivationSnapshot, 'id' | 'createdAt'>) => void;
  canManageDerivations: boolean;
  comments: DocComment[];
  onAddComment: (comment: Omit<DocComment, 'id' | 'createdAt'>) => void;
  onResolveComment: (commentId: string) => void;
  activeUserId: string;
  onAddChallengeTask: (task: Omit<ChallengeTask, 'createdAt' | 'unread' | 'status'>) => void;
  reviewMode?: boolean;
}

export function DocWorkspace({ doc, libraryName, onUpdateDoc, libraries, chats, onShareDoc, isDirCollapsed, setIsDirCollapsed, initialRoleId, appliedRoleIds, onApplyDerivation, onGeneratedDerivation, storedDerivations, onStoreGeneratedDerivation, derivationSnapshots, onRecordDerivationSnapshot, canManageDerivations, comments, onAddComment, onResolveComment, activeUserId, onAddChallengeTask, reviewMode = false }: DocWorkspaceProps) {
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isChallengeModalOpen, setIsChallengeModalOpen] = useState(false);
  const [isChallengeMenuOpen, setIsChallengeMenuOpen] = useState(false);
  const [isChallengePanelOpen, setIsChallengePanelOpen] = useState(false);
  const [challengeRoleIds, setChallengeRoleIds] = useState<Set<string>>(new Set());
  const [challengeSentencesPerRole, setChallengeSentencesPerRole] = useState<1 | 2>(2);
  const [challengeTurn, setChallengeTurn] = useState(0);
  const [challengeRun, setChallengeRun] = useState(0);
  const [isChallengeStopped, setIsChallengeStopped] = useState(false);
  const [challengeTasks, setChallengeTasks] = useState<Array<{ key: string; roleName: string; content: string }>>([]);
  const [challengeMessages, setChallengeMessages] = useState<ChallengeMessage[]>([]);
  const [isChallengeLoading, setIsChallengeLoading] = useState(false);
  const [challengeError, setChallengeError] = useState('');
  const [challengeRunId, setChallengeRunId] = useState<string | null>(null);
  const [latestChallengeRun, setLatestChallengeRun] = useState<{ id: string; challenges: ChallengeMessage[]; createdAt: string } | null>(null);
  const [savingChallengeTaskKeys, setSavingChallengeTaskKeys] = useState<Set<string>>(new Set());
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set<string>(initialRoleId ? [initialRoleId] : []));
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [includeVisualOverview, setIncludeVisualOverview] = useState(false);
  const [derivativePackageTab, setDerivativePackageTab] = useState<'overview' | 'document'>('document');
  const [activeSourceDocumentId, setActiveSourceDocumentId] = useState(doc.id);

  // Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDerivativeMenuOpen, setIsDerivativeMenuOpen] = useState(false);
  const [isCommentPanelOpen, setIsCommentPanelOpen] = useState(reviewMode || comments.length > 0);
  const [activeDerivativeRoles, setActiveDerivativeRoles] = useState<string[]>(Array.from(appliedRoleIds));
  const [activeDerivativeDocs, setActiveDerivativeDocs] = useState<string[]>([]);
  const [displayedRelatedDocs, setDisplayedRelatedDocs] = useState<Record<string, string[]>>({});
  const [loadingRoles, setLoadingRoles] = useState<Record<string, boolean>>({});
  const [cancelledRoles, setCancelledRoles] = useState<Set<string>>(new Set());
  const [generatedDerivations, setGeneratedDerivations] = useState<Record<string, GeneratedDerivation>>(storedDerivations);
  const [sourceContentHash, setSourceContentHash] = useState<string | null>(null);
  const [isPreparingUpdates, setIsPreparingUpdates] = useState(false);
  const [updatePreparationError, setUpdatePreparationError] = useState('');
  const [generationErrors, setGenerationErrors] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [viewingDerivativeRole, setViewingDerivativeRole] = useState<string | null>(reviewMode && canManageDerivations ? null : initialRoleId || null);
  const [isRestoringOriginal, setIsRestoringOriginal] = useState(false);
  const [pendingDerivativeRole, setPendingDerivativeRole] = useState<string | null>(null);
  const [highlightedCitation, setHighlightedCitation] = useState<string | null>(null);
  const [citationPreview, setCitationPreview] = useState<'1' | '2' | null>(null);
  const [inlineCitationPreview, setInlineCitationPreview] = useState<InlineCitation | null>(null);
  const [pendingInlineCitation, setPendingInlineCitation] = useState<InlineCitation | null>(null);
  // Recipients with an applied role open their dedicated view. Everyone else
  // opens the original document rather than an empty workspace.
  const [showOriginal, setShowOriginal] = useState(canManageDerivations || !initialRoleId);
  const [commentAnchor, setCommentAnchor] = useState<CommentAnchor | null>(null);
  const [isCommentComposerOpen, setIsCommentComposerOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [resolvingCommentId, setResolvingCommentId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(doc.isUntitled ? '' : doc.title);
  const [bodyTitle, setBodyTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  const citationHighlightTimer = useRef<number | null>(null);
  const citationScrollSettleTimer = useRef<number | null>(null);
  const citationScrollListener = useRef<((event: Event) => void) | null>(null);
  const originalDocumentRef = useRef<HTMLDivElement>(null);
  const initialSourceTextRef = useRef('');
  const sourceEditBaselineRef = useRef('');
  const [mentionMenu, setMentionMenu] = useState<MentionMenu | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const commentSelectionStartedRef = useRef(false);
  const derivativeViewTimerRef = useRef<number | null>(null);
  const generationControllersRef = useRef<Record<string, AbortController>>({});
  const toastTimerRef = useRef<number | null>(null);
  const challengePanelScrollRef = useRef<HTMLDivElement>(null);
  const activeChallengeItemRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 2800);
  };

  const openCommentPanel = () => {
    setIsSidebarOpen(false);
    setIsChallengePanelOpen(false);
    setIsCommentPanelOpen(true);
  };
  const openRolePanel = () => {
    setIsCommentPanelOpen(false);
    setIsChallengePanelOpen(false);
    setIsSidebarOpen(true);
  };
  const saveTitle = () => {
    const title = titleDraft.trim();
    onUpdateDoc?.(doc.id, { title: title || '未命名文档', isUntitled: !title });
    setIsEditingTitle(false);
  };
  useEffect(() => {
    setActiveDerivativeRoles(previous => Array.from(new Set([...previous, ...Array.from(appliedRoleIds)])));
  }, [appliedRoleIds]);

  useEffect(() => {
    setActiveSourceDocumentId(doc.id);
    setDisplayedRelatedDocs({});
  }, [doc.id]);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  // Existing comments are part of the document context, not only the review
  // route. Opening a document therefore exposes the matching discussion.
  useEffect(() => {
    if (comments.length > 0) setIsCommentPanelOpen(true);
  }, [doc.id, comments.length]);

  // Keep a just-generated local view intact when the user switches roles or
  // re-enters the same document during this prototype session.
  useEffect(() => {
    setGeneratedDerivations(storedDerivations);
  }, [storedDerivations]);

  // The document owner needs the complete generated-role index, not only the
  // roles that have been applied. This restores successful generations after
  // a refresh so the directory remains an accurate entry point to each view.
  useEffect(() => {
    if (!canManageDerivations) return;
    let cancelled = false;
    fetch(`/api/derivations?sourceDocumentId=${encodeURIComponent(doc.id)}`)
      .then(response => response.ok ? response.json() : Promise.reject(new Error('无法读取衍生文档')))
      .then(data => {
        if (cancelled) return;
        const derivations = (data.derivations || []).flatMap((item: { role_id?: string; content?: string; related_document_ids?: string[]; source_content_hash?: string | null; visual_overview?: VisualOverview | null; updated_at?: string }) => {
          if (!item.role_id || !item.content) return [];
          return [[item.role_id, {
            content: item.content,
            relatedDocumentIds: item.related_document_ids || [],
            sourceContentHash: item.source_content_hash || null,
            generatedAt: item.updated_at || '',
            visualOverview: Boolean(item.visual_overview),
            visualOverviewData: item.visual_overview || null,
          }] as const];
        });
        if (!derivations.length) return;
        setGeneratedDerivations(previous => ({ ...Object.fromEntries(derivations), ...previous }));
        derivations.forEach(([roleId, derivation]) => {
          onStoreGeneratedDerivation(doc.id, roleId, derivation);
          onGeneratedDerivation(doc.id, roleId);
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [doc.id, canManageDerivations, onStoreGeneratedDerivation, onGeneratedDerivation]);

  useEffect(() => {
    if (initialRoleId && generatedDerivations[initialRoleId]?.visualOverviewData) setDerivativePackageTab('overview');
  }, [initialRoleId, generatedDerivations]);

  // The latest successful run determines whether the challenge action offers
  // a history entry point or opens the creation configuration directly.
  useEffect(() => {
    setLatestChallengeRun(null);
    if (!canManageDerivations) return;
    let cancelled = false;
    fetch(`/api/generate-challenges?sourceDocumentId=${encodeURIComponent(doc.id)}`)
      .then(response => response.ok ? response.json() : Promise.reject(new Error('无法读取模拟质疑')))
      .then(data => {
        if (cancelled || !data.run?.id || !Array.isArray(data.run.challenges)) return;
        const challenges = data.run.challenges.flatMap((item: { role_id?: string; role_name?: string; content?: string; is_conflict?: boolean }) => {
          if (!item.role_id || !item.role_name || !item.content) return [];
          return [{ role: { id: item.role_id, name: item.role_name }, content: item.content, isConflict: item.is_conflict === true }];
        });
        if (challenges.length) setLatestChallengeRun({ id: data.run.id, challenges, createdAt: data.run.created_at || '' });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [doc.id, canManageDerivations]);

  // A source document deliberately opens clean. Only a recipient entering an
  // already-applied role view may load that role's saved full document.
  useEffect(() => {
    if (!initialRoleId || canManageDerivations || storedDerivations[initialRoleId]) return;
    let cancelled = false;
    fetch(`/api/derivations?sourceDocumentId=${encodeURIComponent(doc.id)}`)
      .then(response => response.ok ? response.json() : Promise.reject(new Error('无法读取衍生文档')))
      .then(data => {
        if (cancelled) return;
        const item = (data.derivations || []).find((candidate: { role_id: string }) => candidate.role_id === initialRoleId);
        if (!item?.content) return;
        const derivation: GeneratedDerivation = {
          content: item.content,
          relatedDocumentIds: item.related_document_ids || [],
          sourceContentHash: item.source_content_hash || null,
          generatedAt: item.updated_at || '',
          visualOverview: Boolean(item.visual_overview),
          visualOverviewData: item.visual_overview || null,
        };
        setGeneratedDerivations(previous => ({ ...previous, [initialRoleId]: derivation }));
        onStoreGeneratedDerivation(doc.id, initialRoleId, derivation);
        onGeneratedDerivation(doc.id, initialRoleId);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [doc.id, initialRoleId, canManageDerivations, storedDerivations, onStoreGeneratedDerivation, onGeneratedDerivation]);

  // The model receives plain text. Only the source body participates in the
  // version identity, so renaming a document does not falsely age its views.
  const sourceTextForAi = toAiText(doc.content || getSourceDocumentContent());
  const sourceVersionText = meaningfulSourceVersion(sourceTextForAi);
  const sourceImages = sourceImagesFromContent(doc.content || '');
  useEffect(() => {
    let cancelled = false;
    void hashSourceText(sourceVersionText).then(hash => {
      if (!cancelled) setSourceContentHash(hash);
    });
    return () => { cancelled = true; };
  }, [sourceVersionText]);

  // Reset the editing baseline when switching documents. During an edit the
  // focus handler below replaces it with the text the user actually saw.
  useEffect(() => {
    initialSourceTextRef.current = sourceTextForAi;
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
    if (citationScrollSettleTimer.current) window.clearTimeout(citationScrollSettleTimer.current);
    if (citationScrollListener.current) window.removeEventListener('scroll', citationScrollListener.current, true);
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

  const challengeParticipants = roles.filter(role => challengeRoleIds.has(role.id));
  const activeChallengeMessage = challengeMessages[challengeTurn];
  const [typedChallengeLength, setTypedChallengeLength] = useState(0);
  const isChallengeSentenceComplete = Boolean(activeChallengeMessage && typedChallengeLength >= activeChallengeMessage.content.length);

  useEffect(() => {
    if (!isChallengePanelOpen || isChallengeStopped || !activeChallengeMessage) {
      setTypedChallengeLength(0);
      return;
    }
    setTypedChallengeLength(0);
    const intervalId = window.setInterval(() => {
      setTypedChallengeLength(length => Math.min(length + 1, activeChallengeMessage.content.length));
    }, 28);
    return () => window.clearInterval(intervalId);
  }, [isChallengePanelOpen, isChallengeStopped, challengeTurn, activeChallengeMessage?.content]);

  useEffect(() => {
    if (!isChallengePanelOpen || isChallengeStopped || !activeChallengeMessage || !isChallengeSentenceComplete) return;
    const timeoutId = window.setTimeout(() => setChallengeTurn(turn => Math.min(turn + 1, challengeMessages.length)), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [isChallengePanelOpen, isChallengeStopped, activeChallengeMessage?.content, isChallengeSentenceComplete, challengeMessages.length]);

  useEffect(() => {
    if (!isChallengePanelOpen || isChallengeStopped || !activeChallengeMessage) return;
    const frameId = window.requestAnimationFrame(() => {
      const container = challengePanelScrollRef.current;
      const activeItem = activeChallengeItemRef.current;
      if (!container || !activeItem) return;
      const containerRect = container.getBoundingClientRect();
      const itemRect = activeItem.getBoundingClientRect();
      const safeTop = containerRect.top + 24;
      const safeBottom = containerRect.bottom - 32;
      if (itemRect.top < safeTop || itemRect.bottom > safeBottom) {
        const offset = itemRect.top < safeTop ? itemRect.top - safeTop : itemRect.bottom - safeBottom;
        container.scrollTo({ top: Math.max(0, container.scrollTop + offset), behavior: 'smooth' });
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isChallengePanelOpen, isChallengeStopped, challengeTurn, activeChallengeMessage?.content]);

  const generateChallenges = async (run: number) => {
    if (!challengeParticipants.length) return;
    setIsChallengeLoading(true);
    setChallengeError('');
    setChallengeMessages([]);
    setChallengeRunId(null);
    setChallengeTurn(0);
    setIsChallengeStopped(false);
    try {
      const relatedDocuments = allDocs.filter(item => selectedDocIds.has(item.id)).map(item => ({ id: item.id, title: item.title, content: toAiText(item.content || '') }));
      const response = await fetch('/api/generate-challenges', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocument: { id: doc.id, title: doc.title, content: sourceTextForAi }, relatedDocuments, roles: challengeParticipants, sentencesPerRole: challengeSentencesPerRole }),
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.challenges)) throw new Error(data.error || '生成模拟质疑失败');
      if (!data.run?.id) throw new Error('模拟质疑已生成，但未能保存记录');
      setChallengeRun(run);
      setChallengeMessages(data.challenges);
      setChallengeRunId(data.run.id);
      setLatestChallengeRun({ id: data.run.id, challenges: data.challenges, createdAt: data.run.created_at || '' });
    } catch (error) {
      setChallengeError(error instanceof Error ? error.message : '生成模拟质疑失败');
    } finally {
      setIsChallengeLoading(false);
    }
  };
  const startChallenge = () => {
    if (!challengeRoleIds.size) return;
    setChallengeTasks([]);
    setIsChallengeModalOpen(false);
    setIsCommentPanelOpen(false);
    setIsSidebarOpen(false);
    setIsChallengePanelOpen(true);
    void generateChallenges(0);
  };
  const viewExistingChallenge = () => {
    if (!latestChallengeRun) return;
    setChallengeMessages(latestChallengeRun.challenges);
    setChallengeRunId(latestChallengeRun.id);
    setChallengeTurn(latestChallengeRun.challenges.length);
    setIsChallengeStopped(false);
    setChallengeError('');
    setIsChallengeMenuOpen(false);
    setIsCommentPanelOpen(false);
    setIsSidebarOpen(false);
    setIsChallengePanelOpen(true);
  };
  const restartChallenge = () => {
    void generateChallenges(challengeRun + 1);
  };
  const closeChallengePanel = () => {
    setIsChallengeStopped(true);
    setIsChallengePanelOpen(false);
  };
  const challengeTaskKey = (index: number) => `${challengeRun}-${index}`;
  const addChallengeTask = async (index: number) => {
    const message = challengeMessages[index];
    if (!message || !challengeRunId) return;
    const key = challengeTaskKey(index);
    if (challengeTasks.some(task => task.key === key) || savingChallengeTaskKeys.has(key)) return;
    setSavingChallengeTaskKeys(previous => new Set(previous).add(key));
    try {
      const response = await fetch('/api/challenge-tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeRunId, sourceDocumentId: doc.id, challengeIndex: index, roleId: message.role.id, roleName: message.role.name, content: message.content }),
      });
      const data = await response.json();
      if (!response.ok || !data.task?.id) throw new Error(data.error || '保存质疑任务失败');
      setChallengeTasks(previous => [...previous, { key, roleName: message.role.name, content: message.content }]);
      onAddChallengeTask({ id: data.task.id, docId: doc.id, docTitle: doc.title, roleName: message.role.name, content: message.content });
    } catch (error) {
      setChallengeError(error instanceof Error ? error.message : '保存质疑任务失败');
    } finally {
      setSavingChallengeTaskKeys(previous => {
        const next = new Set(previous);
        next.delete(key);
        return next;
      });
    }
  };
  const toggleChallengeRole = (roleId: string) => setChallengeRoleIds(previous => {
    const next = new Set(previous);
    if (next.has(roleId)) next.delete(roleId); else next.add(roleId);
    return next;
  });

  const [isCreateRoleModalOpen, setIsCreateRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleSkill, setNewRoleSkill] = useState('');

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [selectedShareChatIds, setSelectedShareChatIds] = useState<Set<string>>(new Set());

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
        // This first version deliberately supports one primary document plus
        // one related document. Keeping the limit explicit makes the reading
        // layout predictable while we validate the interaction.
        newSet.clear();
        newSet.add(id);
      }
      return newSet;
    });
  };

  const allDocs = libraries.flatMap(lib => lib.docs);
  // A role's own conversation represents the document owner on that role's
  // screen. Never offer the current person as a share target.
  const shareTargets = chats.reduce<Array<{ chat: ChatItem; user: (typeof USERS)[number] }>>((targets, chat) => {
    const participantId = chat.participantIds?.find(id => id !== activeUserId)
      || (chat.user.id === activeUserId ? 'u_jobs' : chat.user.id);
    if (participantId === activeUserId || targets.some(target => target.user.id === participantId)) return targets;
    const user = USERS.find(candidate => candidate.id === participantId) || chat.user;
    return [...targets, { chat, user }];
  }, []);
  const viewingDerivation = viewingDerivativeRole ? generatedDerivations[viewingDerivativeRole] : undefined;
  const sidebarRelatedDocumentIds = Array.from(new Set([
    ...activeDerivativeDocs,
    ...(Object.values(generatedDerivations) as GeneratedDerivation[]).flatMap(derivation => derivation.relatedDocumentIds),
    ...Object.values(displayedRelatedDocs).flat(),
  ]));
  const sourceDocuments = [doc, ...sidebarRelatedDocumentIds
    .filter(id => id !== doc.id)
    .map(id => allDocs.find(item => item.id === id))
    .filter((item): item is DocItem => Boolean(item))];
  const activeSourceDocument = sourceDocuments.find(item => item.id === activeSourceDocumentId) || doc;

  const switchRelatedDocument = (roleId: string, nextSourceId: string, roleRelatedDocIds: string[]) => {
    if (nextSourceId === activeSourceDocumentId) return;
    const previousSourceId = activeSourceDocumentId;
    setActiveSourceDocumentId(nextSourceId);
    setDisplayedRelatedDocs(previous => ({
      ...previous,
      [roleId]: [previousSourceId, ...roleRelatedDocIds.filter(id => id !== nextSourceId && id !== previousSourceId)],
    }));
  };
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

  const generateForRole = async (roleId: string, relatedDocIds: string[], withVisualOverview = Boolean(generatedDerivations[roleId]?.visualOverview) || includeVisualOverview, existingContent?: string) => {
    const role = roles.find(item => item.id === roleId);
    if (!role) return;
    const previousDerivation = generatedDerivations[roleId];
    const controller = new AbortController();
    generationControllersRef.current[roleId] = controller;
    setLoadingRoles(prev => ({ ...prev, [roleId]: true }));
    setGenerationErrors(prev => ({ ...prev, [roleId]: '' }));
    setCancelledRoles(previous => {
      const next = new Set(previous);
      next.delete(roleId);
      return next;
    });
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
          // Image URLs may be embedded Base64 data and exceed Vercel's body
          // limit. Kimi only needs a stable marker and descriptive text; the
          // browser already keeps the real URL for rendering.
          sourceImages: sourceImages.map(({ id, alt }) => ({ id, alt })),
          ...(existingContent ? { existingContent } : {}),
        }),
        signal: controller.signal,
      });
      const responseText = await response.text();
      let data: { derivation?: { content: string; related_document_ids?: string[]; source_content_hash?: string | null; updated_at: string }; error?: string };
      try {
        data = JSON.parse(responseText);
      } catch {
        data = {};
      }
      if (!response.ok || !data.derivation) {
        throw new Error(data.error || 'AI 衍生生成失败，请检查服务配置后重试');
      }
      const derivation: GeneratedDerivation = {
        content: data.derivation.content,
        relatedDocumentIds: data.derivation.related_document_ids || relatedDocIds,
        sourceContentHash: data.derivation.source_content_hash || null,
        generatedAt: data.derivation.updated_at,
        visualOverview: false,
      };
      if (withVisualOverview) {
        try {
          const overviewResponse = await fetch('/api/generate-overview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceDocument: { id: doc.id, title: doc.title, content: toAiText(doc.content || getSourceDocumentContent()) },
              relatedDocuments,
              role: { id: role.id, name: role.name },
            }),
            signal: controller.signal,
          });
          const overviewData = await overviewResponse.json();
          if (!overviewResponse.ok || !overviewData.overview) throw new Error(overviewData.error || '生成项目速览失败');
          derivation.visualOverview = true;
          derivation.visualOverviewData = overviewData.overview;
        } catch (overviewError) {
          if (controller.signal.aborted) return;
          setGenerationErrors(prev => ({ ...prev, [roleId]: `角色文档已生成，但项目速览生成失败：${overviewError instanceof Error ? overviewError.message : '请稍后重试'}` }));
        }
      }
      setGeneratedDerivations(prev => ({ ...prev, [roleId]: derivation }));
      onGeneratedDerivation(doc.id, roleId);
      onStoreGeneratedDerivation(doc.id, roleId, derivation);
      if (previousDerivation) {
        onRecordDerivationSnapshot({
          docId: doc.id,
          roleId,
          roleName: role.name,
          sourceContentHash: data.derivation.source_content_hash || sourceContentHash || 'unknown',
        });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setGenerationErrors(prev => ({ ...prev, [roleId]: error instanceof Error ? error.message : '生成失败，请稍后重试' }));
    } finally {
      if (generationControllersRef.current[roleId] === controller) delete generationControllersRef.current[roleId];
      setLoadingRoles(prev => ({ ...prev, [roleId]: false }));
    }
  };

  const stopGeneration = (roleId: string) => {
    generationControllersRef.current[roleId]?.abort();
    setCancelledRoles(previous => new Set(previous).add(roleId));
    setLoadingRoles(previous => ({ ...previous, [roleId]: false }));
  };

  const closeDerivativeRole = (roleId: string) => {
    if (appliedRoleIds.has(roleId)) {
      showToast('如需关闭该角色的衍生文档请先取消应用');
      return;
    }
    generationControllersRef.current[roleId]?.abort();
    setActiveDerivativeRoles(previous => previous.filter(id => id !== roleId));
    setSelectedRoleIds(previous => {
      const next = new Set(previous);
      next.delete(roleId);
      return next;
    });
    setCancelledRoles(previous => {
      const next = new Set(previous);
      next.delete(roleId);
      return next;
    });
    setDisplayedRelatedDocs(previous => {
      const next = { ...previous };
      delete next[roleId];
      return next;
    });
    if (viewingDerivativeRole === roleId) {
      setViewingDerivativeRole(null);
      setShowOriginal(true);
      setActiveSourceDocumentId(doc.id);
    }
  };

  const handleGenerate = () => {
    // A role view remains available even before it is applied. Opening the
    // create dialog again must therefore generate only roles without an
    // existing view; deliberate regeneration stays on the role card.
    const rolesArray = (Array.from(selectedRoleIds) as string[]).filter(roleId => !appliedRoleIds.has(roleId) && !generatedDerivations[roleId]);
    if (rolesArray.length === 0) return;
    setActiveDerivativeRoles(previous => Array.from(new Set([...previous, ...rolesArray])));
    setActiveDerivativeDocs(Array.from(selectedDocIds) as string[]);
    
    setIsRoleModalOpen(false);
    // The right column is a single contextual container. Generation makes
    // derivation the active context, so it must replace comments explicitly.
    setIsCommentPanelOpen(false);
    setIsChallengePanelOpen(false);
    setIsSidebarOpen(true);
    setViewingDerivativeRole(null);
    setSelectedRoleIds(previous => {
      const next = new Set(previous);
      rolesArray.forEach(roleId => next.delete(roleId));
      return next;
    });
    // Let the role modal finish closing before the library begins to collapse.
    window.setTimeout(() => setIsDirCollapsed(true), 240);
    
    // Generate only the roles the user selected. A full-document understanding
    // pass is intentionally not on this critical path: it added a serial model
    // request and made first-time generation slower than the original product.
    void Promise.all(rolesArray.map(roleId => generateForRole(roleId, Array.from(selectedDocIds), includeVisualOverview)));
  };

  const toggleDerivativeView = (roleId: string, isViewing: boolean) => {
    if (pendingDerivativeRole) return;
    if (derivativeViewTimerRef.current) window.clearTimeout(derivativeViewTimerRef.current);

    if (isViewing) {
      setIsRestoringOriginal(true);
      setViewingDerivativeRole(null);
      derivativeViewTimerRef.current = window.setTimeout(() => {
        setIsRestoringOriginal(false);
        derivativeViewTimerRef.current = null;
      }, 350);
      return;
    }

    if (viewingDerivativeRole) {
      setPendingDerivativeRole(roleId);
      setIsRestoringOriginal(true);
      setViewingDerivativeRole(null);
      derivativeViewTimerRef.current = window.setTimeout(() => {
        setDerivativePackageTab(generatedDerivations[roleId]?.visualOverviewData ? 'overview' : 'document');
        setViewingDerivativeRole(roleId);
        setIsRestoringOriginal(false);
        setPendingDerivativeRole(null);
        derivativeViewTimerRef.current = null;
      }, 350);
      return;
    }

    setViewingDerivativeRole(roleId);
    setDerivativePackageTab(generatedDerivations[roleId]?.visualOverviewData ? 'overview' : 'document');
  };

  const selectedDocs = allDocs.filter(d => selectedDocIds.has(d.id));
  const updateCandidateRoleIds = sourceContentHash
    ? (Object.entries(generatedDerivations) as Array<[string, GeneratedDerivation]>)
      .filter(([, derivation]) => derivation.sourceContentHash !== sourceContentHash)
      .map(([roleId]) => roleId)
    : [];
  const isDerivationOutdated = (roleId: string) => {
    const derivation = generatedDerivations[roleId];
    return Boolean(sourceContentHash && derivation?.sourceContentHash !== sourceContentHash);
  };

  const syncSmallSourceUpdate = async () => {
    if (updateCandidateRoleIds.length === 0) return;
    const staleDerivations = updateCandidateRoleIds.map(roleId => generatedDerivations[roleId]).filter((derivation): derivation is GeneratedDerivation => Boolean(derivation));
    const replacement = findReplacementFromStaleCitations(staleDerivations, sourceTextForAi)
      || getSimpleSourceReplacement(initialSourceTextRef.current, sourceTextForAi);
    if (!replacement) {
      setUpdatePreparationError('未找到唯一的数值或短文字修改点，请重新编辑该处内容后再同步。');
      return;
    }
    setIsPreparingUpdates(true);
    setUpdatePreparationError('');
    try {
      const synced = await Promise.all(updateCandidateRoleIds.map(async roleId => {
        const derivation = generatedDerivations[roleId];
        const role = roles.find(item => item.id === roleId);
        if (!derivation || !role) return false;
        const content = replaceExactText(derivation.content, replacement.oldText, replacement.newText);
        const response = await fetch('/api/generate-derivation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceDocument: { id: doc.id, title: doc.title, content: sourceTextForAi },
            role: { id: role.id, name: role.name },
            relatedDocuments: allDocs.filter(item => derivation.relatedDocumentIds.includes(item.id)).map(item => ({ id: item.id, title: item.title, content: toAiText(item.content || '') })),
            partialContent: content,
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.derivation) throw new Error(data.error || '同步修改点失败');
        const nextDerivation: GeneratedDerivation = {
          ...derivation,
          content: data.derivation.content,
          sourceContentHash: data.derivation.source_content_hash || sourceContentHash,
          generatedAt: data.derivation.updated_at || derivation.generatedAt,
          updatedPhrases: content === derivation.content ? [] : [replacement.newText],
        };
        setGeneratedDerivations(previous => ({ ...previous, [roleId]: nextDerivation }));
        onStoreGeneratedDerivation(doc.id, roleId, nextDerivation);
        return content !== derivation.content;
      }));
      const matchedCount = synced.filter(Boolean).length;
      showToast(matchedCount ? `已同步 ${matchedCount} 个衍生文档中的修改点` : '已确认修改；现有衍生文档没有出现该文字或数值');
      initialSourceTextRef.current = sourceTextForAi;
    } catch (error) {
      setUpdatePreparationError(error instanceof Error ? error.message : '更新衍生文档失败');
    } finally {
      setIsPreparingUpdates(false);
    }
  };
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
  const runAfterSourceScrollSettles = (callback: () => void) => {
    if (citationScrollSettleTimer.current) window.clearTimeout(citationScrollSettleTimer.current);
    if (citationScrollListener.current) window.removeEventListener('scroll', citationScrollListener.current, true);
    let lastScrollAt = Date.now();
    const onScroll = () => { lastScrollAt = Date.now(); };
    citationScrollListener.current = onScroll;
    window.addEventListener('scroll', onScroll, true);
    const waitForSettle = () => {
      if (Date.now() - lastScrollAt < 150) {
        citationScrollSettleTimer.current = window.setTimeout(waitForSettle, 150);
        return;
      }
      window.removeEventListener('scroll', onScroll, true);
      citationScrollListener.current = null;
      citationScrollSettleTimer.current = null;
      callback();
    };
    citationScrollSettleTimer.current = window.setTimeout(waitForSettle, 180);
  };
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
        startLocation.node.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        runAfterSourceScrollSettles(() => {
          const range = document.createRange();
          range.setStart(startLocation.node, startLocation.offset);
          range.setEnd(endLocation.node, endLocation.offset + 1);
          const mark = document.createElement('mark');
          mark.dataset.inlineSourceHighlight = 'true';
          mark.className = 'rounded bg-amber-200/80 px-0.5 text-zinc-900 transition-colors';
          range.surroundContents(mark);
          if (citationHighlightTimer.current) window.clearTimeout(citationHighlightTimer.current);
          citationHighlightTimer.current = window.setTimeout(() => {
            mark.replaceWith(document.createTextNode(mark.textContent || ''));
            citationHighlightTimer.current = null;
          }, 1000);
        });
        return;
      }
      // A citation may cross inline tags or source paragraphs. In that case,
      // highlight the containing source block rather than failing silently.
      const block = startLocation?.node.parentElement?.closest('p, li, td, th, h1, h2, h3, h4, h5, h6') || startLocation?.node.parentElement;
      if (block) {
        block.scrollIntoView({ block: 'center', behavior: 'smooth' });
        runAfterSourceScrollSettles(() => {
          block.setAttribute('data-inline-source-highlight-block', 'true');
          block.classList.add('rounded', 'bg-amber-200/80', 'px-0.5');
          if (citationHighlightTimer.current) window.clearTimeout(citationHighlightTimer.current);
          citationHighlightTimer.current = window.setTimeout(() => {
            block.classList.remove('rounded', 'bg-amber-200/80', 'px-0.5');
            citationHighlightTimer.current = null;
          }, 1000);
        });
      }
    }
  };
  const openInlineCitation = (citation: InlineCitation) => {
    setInlineCitationPreview(null);
    // Single-document citations already have their source mounted. Keep the
    // original proven timing instead of routing them through the associated-
    // document switching workflow below.
    if (!citation.sourceDocumentId) {
      setShowOriginal(true);
      window.setTimeout(() => flashInlineOriginal(citation.quote), 300);
      return;
    }
    if (citation.sourceDocumentId && !sourceDocuments.some(source => source.id === citation.sourceDocumentId)) {
      showToast('关联文档未加载，无法定位该引用');
      return;
    }
    setShowOriginal(true);
    setPendingInlineCitation(citation);
    if (citation.sourceDocumentId) setActiveSourceDocumentId(citation.sourceDocumentId);
  };
  const revealInlineOriginal = () => {
    const citation = inlineCitationPreview;
    setInlineCitationPreview(null);
    if (citation && !citation.sourceDocumentId) {
      setShowOriginal(true);
      window.setTimeout(() => flashInlineOriginal(citation.quote), 280);
      return;
    }
    setShowOriginal(true);
    if (citation) {
      setPendingInlineCitation(citation);
      if (citation.sourceDocumentId) setActiveSourceDocumentId(citation.sourceDocumentId);
    }
  };
  // Wait for React to commit the selected source document before searching its
  // DOM. A fixed timeout was unreliable for larger associated documents.
  useEffect(() => {
    if (!pendingInlineCitation || !showOriginal) return;
    if (pendingInlineCitation.sourceDocumentId && pendingInlineCitation.sourceDocumentId !== activeSourceDocumentId) return;
    const frameId = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        flashInlineOriginal(pendingInlineCitation.quote);
        setPendingInlineCitation(null);
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [pendingInlineCitation, activeSourceDocumentId, showOriginal]);
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
      recipientId: 'u_jobs',
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
  const resolveSidebarComment = (commentId: string) => {
    if (resolvingCommentId) return;
    setResolvingCommentId(commentId);
    window.setTimeout(() => {
      onResolveComment(commentId);
      setResolvingCommentId(null);
    }, 1000);
  };

  // New comments store the exact source selection in `sourceText`.  Older
  // comments and comments made from a derivative can have a stale source
  // description, so keep the actual selected words as a safe fallback.
  const originalHighlights = comments
    .filter(comment => comment.status !== 'resolved')
    .flatMap(comment => [comment.sourceText, comment.selectedText]
      .map(text => text?.trim())
      .filter((text): text is string => Boolean(text)));
  const openCommentContext = () => {
    setCommentAnchor(null);
    setIsCommentComposerOpen(false);
    openCommentPanel();
  };
  const highlightOriginalPhrase = (text: string) => {
    const matches = originalHighlights.filter(source => text.includes(source));
    if (!matches.length) return text;
    const expression = new RegExp(`(${matches.map(source => source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
    return <>{text.split(expression).filter(Boolean).map((part, index) => matches.includes(part) ? <mark key={index} role="button" tabIndex={0} title="查看文档评论" onClick={openCommentContext} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') openCommentContext(); }} className="cursor-pointer rounded bg-amber-200/80 px-0.5 text-zinc-900 transition-colors hover:bg-amber-300/80">{part}</mark> : part)}</>;
  };
  // Imported HTML is rendered as document markup rather than React text
  // nodes. Apply the same persisted comment highlight after each comment
  // change so selection comments behave identically in every document type.
  // The effect also follows `showOriginal`: opening an existing comment can
  // mount the original document after this component has already rendered.
  useEffect(() => {
    const root = originalDocumentRef.current?.querySelector<HTMLElement>('.imported-doc');
    if (!root) return;
    root.querySelectorAll<HTMLElement>('[data-comment-highlight]').forEach(mark => mark.replaceWith(document.createTextNode(mark.textContent || '')));
    root.querySelectorAll<HTMLElement>('[data-comment-highlight-block]').forEach(block => {
      block.removeAttribute('data-comment-highlight-block');
      block.removeAttribute('tabindex');
      block.removeAttribute('title');
      block.classList.remove('cursor-pointer', 'rounded', 'bg-amber-100/80', 'px-1', 'transition-colors', 'hover:bg-amber-200/80');
      block.onclick = null;
      block.onkeydown = null;
    });
    originalHighlights.forEach(phrase => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const locations: Array<{ node: Text; offset: number }> = [];
      let searchableText = '';
      let node = walker.nextNode() as Text | null;
      while (node) {
        const value = node.textContent || '';
        for (let offset = 0; offset < value.length; offset += 1) {
          const normalizedCharacter = normalizeCitationText(value[offset]);
          for (const character of normalizedCharacter) {
            searchableText += character;
            locations.push({ node, offset });
          }
        }
        node = walker.nextNode() as Text | null;
      }
      const normalizedPhrase = normalizeCitationText(phrase);
      const start = searchableText.indexOf(normalizedPhrase);
      const startLocation = start >= 0 ? locations[start] : undefined;
      const endLocation = start >= 0 ? locations[start + normalizedPhrase.length - 1] : undefined;
      if (startLocation && endLocation && startLocation.node.parentElement?.closest('[data-comment-highlight]') === null) {
        if (startLocation.node === endLocation.node) {
          const range = document.createRange();
          range.setStart(startLocation.node, startLocation.offset);
          range.setEnd(endLocation.node, endLocation.offset + 1);
          const mark = document.createElement('mark');
          mark.dataset.commentHighlight = 'true';
          mark.tabIndex = 0;
          mark.title = '查看文档评论';
          mark.className = 'cursor-pointer rounded bg-amber-200/80 px-0.5 text-zinc-900 transition-colors hover:bg-amber-300/80';
          mark.addEventListener('click', openCommentContext);
          mark.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') openCommentContext(); });
          range.surroundContents(mark);
          return;
        }
        // A selection may legitimately span inline tags or a line break.
        // Keep its location visible by highlighting the containing paragraph.
        const block = startLocation.node.parentElement?.closest<HTMLElement>('p, li, td, th, h1, h2, h3, h4, h5, h6');
        if (block) {
          block.dataset.commentHighlightBlock = 'true';
          block.tabIndex = 0;
          block.title = '查看文档评论';
          block.classList.add('cursor-pointer', 'rounded', 'bg-amber-100/80', 'px-1', 'transition-colors', 'hover:bg-amber-200/80');
          block.onclick = openCommentContext;
          block.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') openCommentContext(); };
        }
      }
    });
  }, [doc.id, doc.content, showOriginal, activeSourceDocument.id, originalHighlights.join('|')]);
  const renderDerivativeHighlight = (text: string, citationId?: '1' | '2') => {
    const comment = comments.find(item => (
      (citationId && item.citationId === citationId) ||
      Boolean(item.selectedText && (text.includes(item.selectedText) || item.selectedText.includes(text)))
    ));
    if (!comment) return text;
    const commenterName = USERS.find(user => user.id === comment.authorId)?.name || '成员';
    const selected = comment.selectedText?.trim();
    if (selected && text.includes(selected)) {
      const [before, after] = text.split(selected, 2);
      return <>{before}<mark role="button" tabIndex={0} title="查看文档评论" onClick={openCommentContext} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') openCommentContext(); }} className="cursor-pointer rounded bg-amber-200/80 px-0.5 text-zinc-900 hover:bg-amber-300/80">{selected}</mark><span className="ml-1 text-[10px] font-medium text-indigo-600">{commenterName} 评论</span>{after}</>;
    }
    return <><mark role="button" tabIndex={0} title="查看文档评论" onClick={openCommentContext} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') openCommentContext(); }} className="cursor-pointer rounded bg-amber-200/80 px-0.5 text-zinc-900 hover:bg-amber-300/80">{text}</mark><span className="ml-1 text-[10px] font-medium text-indigo-600">{commenterName} 评论</span></>;
  };
  
  return (
    <div className="flex flex-col h-full bg-white">
      <AnimatePresence>
        {toastMessage && <motion.div role="status" aria-live="polite" initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ duration: 0.18, ease: 'easeOut' }} className="fixed left-1/2 top-5 z-[100] -translate-x-1/2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white shadow-xl">{toastMessage}</motion.div>}
      </AnimatePresence>
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
            {isEditingTitle ? <input autoFocus value={titleDraft} onChange={event => setTitleDraft(event.target.value)} onBlur={saveTitle} onKeyDown={event => { if (event.key === 'Enter') saveTitle(); if (event.key === 'Escape') { setTitleDraft(doc.isUntitled ? '' : doc.title); setIsEditingTitle(false); } }} className="w-40 rounded border border-indigo-300 bg-white px-1.5 py-0.5 text-sm text-zinc-900 outline-none" /> : activeSourceDocument.id === doc.id ? <button onClick={() => setIsEditingTitle(true)} className={`text-left ${doc.isUntitled ? 'text-zinc-400' : 'text-zinc-900'} hover:text-indigo-600`}>{doc.title}</button> : <span className="text-zinc-900">{activeSourceDocument.title}</span>}
            {viewingDerivativeRole && <><span className="text-zinc-300">/</span><span className="text-zinc-900">{roles.find(role => role.id === viewingDerivativeRole)?.name} · 衍生文档</span></>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-400 flex items-center gap-1.5 mr-2">
            <Clock size={14} /> 编辑于 {doc.updatedAt}
          </span>
          {canManageDerivations && <div className="relative mr-1">
            <button onClick={() => setIsHistoryOpen(open => !open)} aria-expanded={isHistoryOpen} aria-haspopup="listbox" className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all duration-200 ${isHistoryOpen ? 'bg-zinc-100 text-zinc-900 shadow-sm' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'}`} title="查看衍生更新记录">
              <Clock size={15} /> {isHistoryOpen ? `版本记录 · ${derivationSnapshots.length} 条` : `版本记录${derivationSnapshots.length ? ` ${derivationSnapshots.length}` : ''}`}
            </button>
            <AnimatePresence>
              {isHistoryOpen && <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.18, ease: 'easeOut' }} className="absolute right-0 top-[calc(100%+10px)] z-50 w-80 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
                <div className="border-b border-zinc-100 px-4 py-3"><p className="text-sm font-semibold text-zinc-900">衍生更新记录</p><p className="mt-0.5 text-[11px] text-zinc-500">只记录重新生成节点，不保存原文副本</p></div>
                <div role="listbox" aria-label="历史版本" className="max-h-72 overflow-y-auto p-1.5">
                  {derivationSnapshots.length ? [...derivationSnapshots].reverse().map(snapshot => <button key={snapshot.id} type="button" role="option" onClick={() => setIsHistoryOpen(false)} className="flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-zinc-50 focus:bg-zinc-50 focus:outline-none">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600"><Sparkles size={14} /></span>
                    <span className="min-w-0"><span className="block text-sm font-medium text-zinc-800">重新生成 · {snapshot.roleName}</span><span className="mt-0.5 block text-xs text-zinc-500">{snapshot.createdAt} · 原文版本 {snapshot.sourceContentHash.slice(0, 8)}</span></span>
                  </button>) : <div className="px-3 py-8 text-center"><Clock size={20} className="mx-auto text-zinc-300" /><p className="mt-2 text-xs text-zinc-500">还没有重新生成记录</p></div>}
                </div>
              </motion.div>}
            </AnimatePresence>
          </div>}
          <button className="w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-amber-500 hover:bg-amber-50 rounded-full transition-colors">
            <Star size={18} />
          </button>
          <div className="flex items-center">
            <div className="mr-10 flex -space-x-2">
              <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" className="w-8 h-8 rounded-full border-2 border-white" alt="" />
              <img src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" className="w-8 h-8 rounded-full border-2 border-white" alt="" />
            </div>
            {!canManageDerivations && initialRoleId && <button onClick={() => showOriginal ? closeOriginal() : setShowOriginal(true)} className="flex items-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors mr-2">
              <Eye size={16} />
              {showOriginal ? '关闭原文' : '查看原文'}
            </button>}
            <button 
              onClick={() => setIsShareModalOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800"
            >
              <Share size={16} />
              分享
            </button>
            {canManageDerivations && <>
              <div className="relative ml-3">
                <button onClick={() => { setIsDerivativeMenuOpen(false); latestChallengeRun ? setIsChallengeMenuOpen(open => !open) : setIsChallengeModalOpen(true); }} className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200">
                  <MessageSquare size={16} /> 模拟质疑
                </button>
                <AnimatePresence>
                  {isChallengeMenuOpen && latestChallengeRun && <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} className="absolute left-0 top-[calc(100%+8px)] z-40 w-48 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg">
                    <button onClick={viewExistingChallenge} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50"><Eye size={15} className="text-zinc-600" />查看已有质疑</button>
                    <button onClick={() => { setIsChallengeMenuOpen(false); setIsChallengeModalOpen(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50"><Plus size={15} className="text-zinc-600" />创建新质疑</button>
                  </motion.div>}
                </AnimatePresence>
              </div>
              <span aria-hidden="true" className="mx-5 h-6 w-px bg-zinc-200" />
              <div className="relative">
                <button
                  onClick={() => {
                    setIsChallengePanelOpen(false);
                    setIsCommentPanelOpen(false);
                    activeDerivativeRoles.length === 0 ? setIsRoleModalOpen(true) : setIsDerivativeMenuOpen(open => !open);
                  }}
                  className="flex items-center gap-2 rounded-lg bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
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
              </div>
            </>}
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
          initial={!canManageDerivations ? { opacity: 0, x: 72 } : false}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 72 }}
          transition={{ duration: 0.26, ease: 'easeOut' }}
          onMouseDown={() => { commentSelectionStartedRef.current = true; setCommentAnchor(null); setIsCommentComposerOpen(false); }}
          onMouseUp={() => { if (commentSelectionStartedRef.current) handleSelection(); commentSelectionStartedRef.current = false; }}
          className={`relative flex-1 min-w-0 overflow-y-auto ${viewingDerivativeRole ? 'border-r border-zinc-200' : ''} ${!canManageDerivations ? 'order-2 bg-white' : 'order-1'}`}
        >
          <AnimatePresence>
            {isRestoringOriginal && <motion.div
              aria-hidden="true"
              initial={{ opacity: 0.34 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="pointer-events-none absolute inset-0 z-20 bg-white"
            />}
          </AnimatePresence>
          {!canManageDerivations && <button onClick={closeOriginal} aria-label="关闭原文" className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-700"><X size={17} /></button>}
          <div ref={originalDocumentRef} onKeyUp={updateMentionMenu} onKeyDown={handleEditorKeyDown} className="max-w-4xl mx-auto px-12 py-16">
            {viewingDerivativeRole && sourceDocuments.length > 1 && <div className="-mt-8 mb-7 w-full rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-indigo-700"><FileText size={14} /> 来源文档</div>
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="切换来源文档">
                {sourceDocuments.map(source => <button key={source.id} type="button" role="tab" aria-selected={activeSourceDocument.id === source.id} onClick={() => setActiveSourceDocumentId(source.id)} className={`inline-flex max-w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${activeSourceDocument.id === source.id ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100' : 'text-zinc-600 hover:bg-white/70'}`}><FileText size={14} className={activeSourceDocument.id === source.id ? 'shrink-0 text-indigo-500' : 'shrink-0 text-zinc-400'} /><span className="max-w-52 truncate">{source.title}</span></button>)}
              </div>
            </div>}
            {canManageDerivations && updateCandidateRoleIds.length > 0 && (
              <div className="mb-7 rounded-2xl border border-violet-200 bg-violet-50/70 p-4">
                <p className="text-sm font-semibold text-violet-950">原文有小范围修改</p>
                <p className="mt-1 text-xs leading-relaxed text-violet-800">可直接同步短文字或数值替换到已有衍生文档，不重新生成整篇内容；同步后的修改点会以紫色标出。</p>
                {updatePreparationError && <p className="mt-2 text-xs text-rose-700">{updatePreparationError}</p>}
                <button onClick={() => void syncSmallSourceUpdate()} disabled={isPreparingUpdates} className="mt-3 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60">{isPreparingUpdates ? '正在同步…' : `同步修改点到 ${updateCandidateRoleIds.length} 个衍生文档`}</button>
              </div>
            )}
            {activeSourceDocument.id !== doc.id ? <>
              <div className="mb-6 flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
                  {activeSourceDocument.type === 'document' ? '文档' : activeSourceDocument.type === 'spreadsheet' ? '表格' : activeSourceDocument.type === 'presentation' ? '演示文稿' : '文件夹'}
                </span>
              </div>
              <h1 className="mb-8 text-3xl font-bold tracking-tight text-zinc-900">{activeSourceDocument.title}</h1>
              {activeSourceDocument.content ? <div className="imported-doc" dangerouslySetInnerHTML={{ __html: activeSourceDocument.content }} /> : <p className="text-sm leading-relaxed text-zinc-700">文档内容待补充。</p>}
            </> : <>
            <div className="mb-6 flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-100 text-xs font-medium text-zinc-600">
                {doc.type === 'document' ? '文档' : doc.type === 'spreadsheet' ? '表格' : doc.type === 'presentation' ? '演示文稿' : '文件夹'}
              </span>
            </div>

            {doc.isBlank ? <input autoFocus value={bodyTitle} onChange={event => setBodyTitle(event.target.value)} placeholder="请输入标题" className="mb-8 w-full border-0 bg-transparent text-3xl font-bold tracking-tight text-zinc-900 placeholder:text-zinc-300 outline-none" /> : <h1 contentEditable suppressContentEditableWarning className="mb-8 cursor-text text-3xl font-bold tracking-tight text-zinc-900">{highlightOriginalPhrase(doc.title)}</h1>}
            {doc.isBlank ? (
              <textarea value={bodyText} onChange={event => setBodyText(event.target.value)} onPaste={event => { const text = event.clipboardData.getData('text/plain'); if (!text) return; event.preventDefault(); onUpdateDoc?.(doc.id, { content: formatPlainTextAsDocument(text), isBlank: false }); }} placeholder="请尽情编辑文本吧……" className="min-h-[320px] w-full resize-none border-0 bg-transparent text-sm leading-relaxed text-zinc-700 placeholder:text-zinc-300 outline-none" />
            ) : doc.content ? (
              <div 
                className="imported-doc" 
                dangerouslySetInnerHTML={{ __html: doc.content }} 
                contentEditable 
                suppressContentEditableWarning 
                onFocus={event => { sourceEditBaselineRef.current = toAiText(event.currentTarget.innerHTML); }}
                onBlur={event => {
                  // Capture the actual text immediately before this editing
                  // session. This is more reliable than a mount-time snapshot
                  // when a rich-text editor normalises its DOM on blur.
                  if (sourceEditBaselineRef.current) initialSourceTextRef.current = sourceEditBaselineRef.current;
                  sourceEditBaselineRef.current = '';
                  onUpdateDoc?.(doc.id, { content: event.currentTarget.innerHTML });
                }}
              />
            ) : (
              <div className="space-y-6 text-sm text-zinc-700 leading-relaxed font-normal">
                <p className="outline-none" contentEditable suppressContentEditableWarning>
                  {highlightOriginalPhrase('本文档作为项目的唯一事实来源。请确保在周五的站会之前，所有更新都已与相应的设计资产同步。')}
                </p>

                <h3 className="text-lg font-semibold text-zinc-900 mt-12 mb-4 outline-none" contentEditable suppressContentEditableWarning>
                  1. 执行摘要
                </h3>
                
                <p className={`outline-none transition-colors duration-500 ${highlightedCitation === '1' ? 'bg-amber-100/80 rounded px-1' : ''}`} contentEditable={!reviewMode} suppressContentEditableWarning>
                  {highlightOriginalPhrase('我们的目标是整合所有平台的设计语言系统。主要目标是减少认知负荷，同时保持企业客户所需的高端质感。新界面在很大程度上依赖于微妙的对比度、精确的间距比例以及让人感觉自然而非机械的运动曲线。')}
                </p>
                {!reviewMode && comments.filter(comment => comment.citationId === '1').map(comment => <div key={comment.id} className="mt-3 ml-1 max-w-md rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-sm text-indigo-900"><span className="font-semibold">{USERS.find(user => user.id === comment.authorId)?.name || '成员'} · </span>{comment.content}</div>)}

                <div className="my-8 p-6 bg-zinc-50 rounded-2xl border border-zinc-100 flex gap-4 items-start">
                  <div className="bg-white p-3 rounded-xl shadow-sm border border-zinc-100 text-zinc-500 shrink-0">
                    <Play size={24} className="ml-0.5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-zinc-900 mb-1">嵌入的原型</h4>
                    <p className="text-sm text-zinc-500 mb-3">新认证模块的交互流程图。</p>
                    <button className="text-sm font-medium text-zinc-500 hover:text-zinc-700">在新标签页中打开 &rarr;</button>
                  </div>
                </div>

                <h3 className="text-lg font-semibold text-zinc-900 mt-12 mb-4 outline-none" contentEditable suppressContentEditableWarning>
                  2. 关键交付物
                </h3>
                <ul className={`list-disc pl-5 space-y-2 outline-none transition-colors duration-500 ${highlightedCitation === '2' ? 'bg-amber-100/80 rounded px-1 py-1' : ''}`} contentEditable suppressContentEditableWarning>
                  <li>{highlightOriginalPhrase('确定间距令牌和排版比例。')}</li>
                  <li>{highlightOriginalPhrase('跨 React 和 Figma 的组件库一致性。')}</li>
                  <li>{highlightOriginalPhrase('针对所有界面颜色的 WCAG AA 无障碍标准合规性审计。')}</li>
                </ul>
                {!reviewMode && comments.filter(comment => comment.citationId === '2').map(comment => <div key={comment.id} className="mt-3 ml-1 max-w-md rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-sm text-indigo-900"><span className="font-semibold">{USERS.find(user => user.id === comment.authorId)?.name || '成员'} · </span>{comment.content}</div>)}
              </div>
            )}
            </>}
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
        <AnimatePresence initial={false}>
        {viewingDerivativeRole && (
          <motion.div
            initial={{ opacity: 0, x: 36, flexGrow: 0 }}
            animate={{ opacity: 1, x: 0, flexGrow: 1 }}
            exit={{ opacity: 0, x: 24, flexGrow: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            onMouseUp={handleDerivativeSelection}
            className={`relative flex-1 min-w-0 overflow-y-auto bg-zinc-50/50 ${!canManageDerivations ? 'order-1' : 'order-2'}`}
          >
            {!isSidebarOpen && <button
              type="button"
              onClick={() => toggleDerivativeView(viewingDerivativeRole, true)}
              aria-label="关闭衍生视图"
              className="absolute right-5 top-5 z-10 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
            >
              <X size={15} />
              关闭视图
            </button>}
            <div className="max-w-4xl mx-auto px-10 py-16">
              <div className="mb-6">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-100 text-xs font-medium text-indigo-700">
                  <Sparkles size={12} />
                  AI 衍生视图 · {roles.find(r => r.id === viewingDerivativeRole)?.name}
                </span>
              </div>
              <h1 className="text-3xl font-bold text-zinc-900 tracking-tight mb-8">
                {viewingDerivation?.relatedDocumentIds.length ? derivationTitle(viewingDerivation.content, '联合工作视图') : doc.title}
              </h1>
              
              {generatedDerivations[viewingDerivativeRole] ? (
                <>
                  {generatedDerivations[viewingDerivativeRole].visualOverviewData && <div className="mb-6 flex w-fit rounded-xl bg-zinc-100 p-1" role="tablist" aria-label="衍生文档内容">
                    <button role="tab" aria-selected={derivativePackageTab === 'overview'} onClick={() => setDerivativePackageTab('overview')} className={`relative rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${derivativePackageTab === 'overview' ? 'text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}>{derivativePackageTab === 'overview' && <motion.span layoutId="derivative-package-active-tab" className="absolute inset-0 rounded-lg bg-white shadow-sm" transition={{ duration: 0.2, ease: 'easeOut' }} />}<span className="relative">项目速览</span></button>
                    <button role="tab" aria-selected={derivativePackageTab === 'document'} onClick={() => setDerivativePackageTab('document')} className={`relative rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${derivativePackageTab === 'document' ? 'text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}>{derivativePackageTab === 'document' && <motion.span layoutId="derivative-package-active-tab" className="absolute inset-0 rounded-lg bg-white shadow-sm" transition={{ duration: 0.2, ease: 'easeOut' }} />}<span className="relative">角色文档</span></button>
                  </div>}
                  {derivativePackageTab === 'overview' && generatedDerivations[viewingDerivativeRole].visualOverviewData ? <MindMapOverview overview={generatedDerivations[viewingDerivativeRole].visualOverviewData} roleName={roles.find(role => role.id === viewingDerivativeRole)?.name || '当前角色'} /> : <RenderedDerivation content={generatedDerivations[viewingDerivativeRole].content} updatedPhrases={generatedDerivations[viewingDerivativeRole].updatedPhrases} hideLeadingTitle={Boolean(viewingDerivation?.relatedDocumentIds.length)} sourceText={toAiText(doc.content || getSourceDocumentContent())} citationSourceTexts={Object.fromEntries(sourceDocuments.map(source => [source.id, toAiText(source.content || (source.id === doc.id ? getSourceDocumentContent() : ''))]))} citationNumbers={Object.fromEntries(sourceDocuments.map((source, index) => [source.id, index + 1]))} sourceImages={sourceImages} activeCitation={inlineCitationPreview} onCitationClick={openInlineCitation} onRevealOriginal={revealInlineOriginal} />}
                </>
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
        </AnimatePresence>

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
        {(isSidebarOpen || isCommentPanelOpen || isChallengePanelOpen) && (
          <motion.aside
            initial={{ width: 0, x: isChallengePanelOpen ? 408 : 352, opacity: 0 }}
            animate={{ width: isChallengePanelOpen ? 408 : 352, x: 0, opacity: 1 }}
            exit={{ width: 0, x: isChallengePanelOpen ? 408 : 352, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="order-3 ml-auto shrink-0 overflow-hidden border-l border-zinc-200 bg-white flex flex-col z-10 shadow-[-4px_0_12px_rgba(0,0,0,0.02)]"
          >
            <div className="h-[72px] border-b border-zinc-100 flex items-center px-5 justify-between shrink-0">
              <span className="font-semibold text-sm text-zinc-900">{isChallengePanelOpen ? '模拟质疑' : isCommentPanelOpen ? '文档评论' : '角色衍生'}</span>
              <button 
                onClick={() => isChallengePanelOpen ? closeChallengePanel() : isCommentPanelOpen ? setIsCommentPanelOpen(false) : setIsSidebarOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-md hover:bg-zinc-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div ref={challengePanelScrollRef} className="flex-1 overflow-x-hidden overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {isChallengePanelOpen ? <div className="p-5">
                <p className="text-xs leading-relaxed text-zinc-500">让不同角色从自己的专业视角，像同事评审一样依次追问这份文档。</p>
                <div className="mt-6 space-y-[30px]">
                  {isChallengeLoading && <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">正在请角色审阅文档并准备质疑……</div>}
                  {challengeError && <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-4 text-sm leading-relaxed text-rose-700"><p>{challengeError}</p><button type="button" onClick={restartChallenge} className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100">重试</button></div>}
                  <AnimatePresence initial={false}>
                    {(challengeTurn >= challengeMessages.length ? challengeMessages : challengeMessages.slice(0, Math.min(challengeTurn + 1, challengeMessages.length))).map((message, visibleIndex) => {
                      const messageIndex = visibleIndex;
                      const isSpeaking = messageIndex === challengeTurn && challengeTurn < challengeMessages.length;
                      const isRightAligned = messageIndex % 2 === 1;
                      const taskKey = challengeTaskKey(messageIndex);
                      const canAddTask = challengeTurn >= challengeMessages.length || (isSpeaking && isChallengeSentenceComplete);
                      const taskAdded = challengeTasks.some(task => task.key === taskKey);
                      const isSavingTask = savingChallengeTaskKeys.has(taskKey);
                      const isChallengeComplete = challengeTurn >= challengeMessages.length;
                      return <motion.div ref={node => { if (isSpeaking) activeChallengeItemRef.current = node; }} key={`${message.role.id}-${messageIndex}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }} className={`group/message flex items-end gap-4 ${isRightAligned ? 'flex-row-reverse' : ''}`}>
                        <PixelSpeaker roleId={message.role.id} roleName={message.role.name} speaking={isSpeaking} flipped={isRightAligned} />
                        <div className={`relative max-w-[232px] rounded-2xl px-3.5 py-3 text-xs font-medium leading-5 transition-colors ${message.isConflict ? (isSpeaking ? 'bg-rose-100 text-rose-950 ring-1 ring-rose-200' : 'bg-rose-50 text-rose-800 ring-1 ring-rose-100') : (isSpeaking ? 'bg-zinc-200 text-zinc-900' : 'bg-zinc-100 text-zinc-600')} ${isRightAligned ? 'rounded-br-md' : 'rounded-bl-md'}`}>
                          <span aria-hidden="true" className={`absolute bottom-0 h-4 w-3 bg-inherit ${isRightAligned ? '-right-3 -scale-x-100 [clip-path:polygon(100%_0,100%_100%,0_100%)]' : '-left-3 [clip-path:polygon(100%_0,100%_100%,0_100%)]'}`} />
                          {message.isConflict && <span className="mb-1.5 block text-[10px] font-semibold tracking-wide text-rose-600">需重点核对</span>}
                          <span className="relative">{isSpeaking ? message.content.slice(0, typedChallengeLength) : message.content}</span>
                          {canAddTask && <button type="button" onClick={() => void addChallengeTask(messageIndex)} disabled={taskAdded || isSavingTask} aria-label={taskAdded ? '已添加到任务' : isSavingTask ? '正在保存任务' : '添加到任务'} className={`group/task absolute -bottom-3 ${isRightAligned ? '-left-3' : '-right-3'} flex h-7 w-7 items-center justify-center rounded-full border text-xs transition-colors ${isChallengeComplete ? 'pointer-events-none opacity-0 group-hover/message:pointer-events-auto group-hover/message:opacity-100 group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100' : ''} ${taskAdded || isSavingTask ? 'border-zinc-300 bg-zinc-200 text-zinc-500' : 'border-zinc-200 bg-white text-zinc-700 shadow-sm hover:border-zinc-900 hover:bg-zinc-900 hover:text-white'}`}><Plus size={14} />{!taskAdded && !isSavingTask && <span role="tooltip" className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition-none group-hover/task:opacity-100 group-focus-visible/task:opacity-100">添加到任务</span>}</button>}
                        </div>
                      </motion.div>;
                    })}
                  </AnimatePresence>
                  {!isChallengeLoading && !challengeError && !challengeMessages.length && <p className="rounded-xl bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-400">请选择至少一个角色开始模拟质疑。</p>}
                </div>
                {!isChallengeLoading && challengeTurn >= challengeMessages.length && challengeMessages.length > 0 && <button type="button" onClick={restartChallenge} className="mt-7 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-900">重新质疑</button>}
                {challengeTasks.length > 0 && <div className="mt-5 border-t border-zinc-100 pt-4"><p className="text-xs font-semibold text-zinc-900">任务列表</p><div className="mt-2 space-y-2">{challengeTasks.map(task => <div key={task.key} className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs leading-relaxed text-zinc-700 shadow-sm"><span className="mr-1 font-semibold text-zinc-900">{task.roleName}：</span>{task.content}</div>)}</div></div>}
              </div> : isCommentPanelOpen ? <div className="p-4 space-y-3">
                {comments.filter(comment => comment.status !== 'resolved').map(comment => {
                  const author = USERS.find(user => user.id === comment.authorId);
                  const replies = comment.replies || [];
                  return <div key={comment.id} className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-3.5">
                    <div className="flex items-center gap-2 text-xs"><img src={author?.avatar} alt="" className="h-6 w-6 rounded-full object-cover" /><span className="font-semibold text-zinc-900">{author?.name || '成员'}</span><span className="text-zinc-400">{comment.createdAt}</span><button type="button" onClick={() => resolveSidebarComment(comment.id)} aria-label="标记为完成" className={`group/resolve relative ml-auto flex h-7 w-7 items-center justify-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-100 ${resolvingCommentId === comment.id ? 'border-emerald-300 bg-emerald-50 text-emerald-600' : 'border-zinc-200 bg-white text-zinc-400 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600'}`}><Check size={15} strokeWidth={2.5} /><span role="tooltip" className="pointer-events-none absolute right-0 top-[calc(100%+7px)] z-20 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition-none group-hover/resolve:opacity-100 group-focus-visible/resolve:opacity-100">标记为完成</span></button></div>
                    <p className="mt-3 text-sm leading-relaxed text-zinc-700">{comment.content}</p>
                    {comment.sourceText && <p className="mt-2 border-l-2 border-violet-400 pl-2 text-xs leading-relaxed text-zinc-500">定位原文：{comment.sourceText}</p>}
                    {replies.map(reply => <div key={reply.id} className="mt-3 border-t border-zinc-200/80 pt-3"><p className="text-xs font-semibold text-zinc-900">{USERS.find(user => user.id === reply.authorId)?.name || '成员'}的回复</p><p className="mt-1 text-sm leading-relaxed text-zinc-700">{reply.content}</p></div>)}
                    {replies.length < 7 && <div className="mt-3 border-t border-zinc-200/80 pt-3"><textarea value={replyDrafts[comment.id] || ''} onChange={event => setReplyDrafts(previous => ({ ...previous, [comment.id]: event.target.value }))} placeholder={`回复${author?.name || '对方'}…`} className="min-h-16 w-full resize-none rounded-lg border border-zinc-200 bg-white p-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /><div className="mt-2 flex justify-end"><button onClick={() => submitReply(comment)} disabled={!replyDrafts[comment.id]?.trim()} className="rounded-lg bg-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-500 transition-colors enabled:bg-zinc-950 enabled:text-white enabled:hover:bg-zinc-800 disabled:cursor-not-allowed">发送回复</button></div></div>}
                  </div>;
                })}
                {comments.filter(comment => comment.status !== 'resolved').length === 0 && <div className="py-12 text-center text-sm text-zinc-400">暂时没有待处理的文档评论</div>}
              </div> : <>
              {activeDerivativeRoles.map(roleId => {
                const role = roles.find(r => r.id === roleId);
                const isLoading = loadingRoles[roleId];
                const isViewing = viewingDerivativeRole === roleId;
                const derivation = generatedDerivations[roleId];
                const isCancelled = cancelledRoles.has(roleId);
                // A stopped regeneration stays visually in the neutral state
                // until the user explicitly starts it again, even if an older
                // version remains cached in memory.
                const isComplete = Boolean(derivation) && !isLoading && !isCancelled;
                const relatedDocs = displayedRelatedDocs[roleId] || derivation?.relatedDocumentIds || activeDerivativeDocs;
                const hasRelatedDocs = relatedDocs.length > 0;
                // A missing inline marker is a real data-quality issue: the
                // renderer cannot highlight a source that was never saved.
                // Expose an explicit repair action instead of concealing it.
                const contentWithoutValidCitations = derivation?.content.replace(/\[\[cite:[\s\S]*?\]\]/g, '') || '';
                const hasMalformedCitation = Boolean(derivation?.content.split('\n').some(line => line.includes('[[cite:') && !line.includes(']]')));
                const hasOrphanCitationEnding = contentWithoutValidCitations.includes(']]');
                const needsCitationRepair = Boolean(derivation && (!derivation.content.includes('[[cite:') || hasMalformedCitation || hasOrphanCitationEnding));
                
                return (
                  <section key={roleId} className="group relative mx-5 my-3 overflow-hidden rounded-[18px] border border-zinc-200 bg-white p-4 transition-[height,background-color] duration-200 hover:bg-zinc-50">
                    {canManageDerivations && <button type="button" onClick={() => closeDerivativeRole(roleId)} aria-label={`关闭${role?.name || '角色'}的衍生文档`} title="关闭衍生文档" className="absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white/95 text-zinc-400 opacity-0 shadow-sm transition-all duration-200 hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-700 focus:opacity-100 group-hover:opacity-100"><X size={14} /></button>}
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 origin-bottom-right transition-transform duration-200 ease-out group-hover:-rotate-[4deg] motion-reduce:transform-none">
                      <svg viewBox="0 0 280 210" preserveAspectRatio="none" className="absolute inset-0 h-full w-full text-zinc-300" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M280 12 178 46Q162 51 167 66L195 210H280Z" fill="white" stroke="none" />
                        <path d="M280 12 178 46Q162 51 167 66L195 210" />
                      </svg>
                      {isComplete && <div className="absolute inset-y-0 right-0 w-[142px] [clip-path:polygon(100%_6%,28%_22%,20%_31%,40%_100%,100%_100%)]"><div className="absolute -right-2 top-[50px] w-[112px] -rotate-[16deg] space-y-3 opacity-70"><span className="block h-3 rounded-sm bg-zinc-100" /><span className="block h-3 w-[84%] rounded-sm bg-zinc-100" /></div></div>}
                    </div>
                    <div className={`relative flex flex-col ${isLoading ? 'min-h-[160px]' : isComplete ? (hasRelatedDocs ? 'min-h-[166px]' : 'min-h-[132px]') : 'min-h-[166px]'}`}>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500"><User size={16} strokeWidth={1.8} /></span>
                        <span className="text-sm font-semibold text-zinc-900">{role?.name}</span>
                      </div>

                      {hasRelatedDocs && <div className="mt-3 space-y-1">
                        {relatedDocs.map(docId => {
                          const relatedDoc = allDocs.find(item => item.id === docId);
                          if (!relatedDoc) return null;
                          return <button key={docId} type="button" onClick={() => switchRelatedDocument(roleId, docId, relatedDocs)} className="flex max-w-[138px] items-center gap-1.5 rounded-md bg-zinc-100 px-2.5 py-1.5 text-left text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 hover:text-zinc-950" title={`切换到 ${relatedDoc.title}`}><FileText size={13} className="shrink-0" /><span className="truncate">{relatedDoc.title}</span></button>;
                        })}
                      </div>}

                      {isLoading ? <p className="mt-4 flex items-center gap-1.5 text-xs font-medium text-zinc-950"><PenLine size={14} />衍生文档撰写中……</p> : isComplete ? <p className="mt-4 flex items-center gap-1.5 text-xs text-zinc-400"><Check size={14} />衍生文档已完成</p> : <p className="mt-4 text-xs text-zinc-400">{isCancelled ? '生成已停止，可重新生成。' : '等待生成衍生文档。'}</p>}

                      <div className="mt-auto pt-2">
                        {generationErrors[roleId] && <p className="mb-3 rounded-lg bg-rose-50 p-2 text-xs leading-relaxed text-rose-700">{generationErrors[roleId]}</p>}
                        {isDerivationOutdated(roleId) && <p className="mb-3 text-xs leading-relaxed text-amber-700">这个衍生文档基于旧版原文。</p>}
                        <div className="flex gap-1.5">
                          {isLoading ? <button type="button" onClick={() => stopGeneration(roleId)} className="h-8 min-w-[104px] whitespace-nowrap rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-900">停止</button> : <>
                            {isComplete && <button onClick={() => toggleDerivativeView(roleId, isViewing)} disabled={Boolean(pendingDerivativeRole)} className="h-8 min-w-0 flex-1 whitespace-nowrap rounded-md bg-zinc-100 px-2 text-xs font-semibold text-zinc-900 transition-colors hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-60">{isViewing ? '关闭视图' : '查看文档'}</button>}
                            {canManageDerivations && isComplete && needsCitationRepair && <button onClick={() => void generateForRole(roleId, derivation?.relatedDocumentIds || activeDerivativeDocs, derivation?.visualOverview, derivation?.content)} className="h-8 min-w-0 flex-1 whitespace-nowrap rounded-md bg-amber-50 px-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100">补全引用</button>}
                            {canManageDerivations && <button onClick={() => void generateForRole(roleId, derivation?.relatedDocumentIds || activeDerivativeDocs)} className="h-8 min-w-0 flex-1 whitespace-nowrap rounded-md bg-zinc-100 px-2 text-xs font-semibold text-zinc-900 transition-colors hover:bg-zinc-200">重新生成</button>}
                            {canManageDerivations && isComplete && <button onClick={() => onApplyDerivation(doc.id, roleId, !appliedRoleIds.has(roleId))} className={`h-8 min-w-0 flex-1 whitespace-nowrap rounded-md px-2 text-xs font-semibold transition-colors ${appliedRoleIds.has(roleId) ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100' : 'bg-zinc-950 text-white hover:bg-zinc-800'}`}>{appliedRoleIds.has(roleId) ? '已应用' : '应用'}</button>}
                          </>}
                        </div>
                      </div>
                    </div>
                  </section>
                );
              })}
              </>}
            </div>
            {!isCommentPanelOpen && !isChallengePanelOpen && canManageDerivations && <div className="p-4 border-t border-zinc-100">
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
        {isChallengeModalOpen && <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }} className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between"><div><h3 className="text-lg font-semibold text-zinc-900">模拟质疑</h3><p className="mt-1 text-sm leading-relaxed text-zinc-500">选择角色，让他们轮流从专业视角挑战这份文档。</p></div><button onClick={() => setIsChallengeModalOpen(false)} aria-label="关闭模拟质疑" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100"><X size={18} /></button></div>
            <div className="mt-6 grid grid-cols-2 gap-3">{roles.map(role => { const selected = challengeRoleIds.has(role.id); return <button key={role.id} type="button" onClick={() => toggleChallengeRole(role.id)} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${selected ? 'border-zinc-400 bg-zinc-100 text-zinc-900' : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'}`}><span>{role.name}</span>{selected && <Check size={16} />}</button>; })}</div>
            <div className="mt-5 flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
              <span className="text-sm font-medium text-zinc-900">每个角色</span>
              <label className="flex items-center gap-2 text-sm text-zinc-500">
                <span className="sr-only">每个角色的发言句数</span>
                <select
                  value={challengeSentencesPerRole}
                  aria-label="每个角色的发言句数"
                  onChange={event => setChallengeSentencesPerRole(Number(event.target.value) as 1 | 2)}
                  onWheel={event => {
                    event.preventDefault();
                    setChallengeSentencesPerRole(current => Math.max(1, Math.min(2, current + (event.deltaY > 0 ? 1 : -1))) as 1 | 2);
                  }}
                  className="cursor-ns-resize rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-950 outline-none transition-colors focus:border-zinc-950"
                >
                  <option value={1}>1 句</option>
                  <option value={2}>2 句</option>
                </select>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button onClick={() => setIsChallengeModalOpen(false)} className="px-4 py-2 text-sm font-medium text-zinc-600">取消</button><button disabled={!challengeRoleIds.size} onClick={startChallenge} className="rounded-lg bg-zinc-950 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400">开始模拟</button></div>
          </motion.div>
        </div>}
      </AnimatePresence>

      <AnimatePresence>
        {isRoleModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-900/60 p-4"
          >
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
                    className="flex items-center gap-1 text-xs font-medium text-indigo-600 transition-colors hover:text-indigo-700"
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
                            ? 'border-zinc-400 bg-zinc-100 text-zinc-900'
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
                <div className="mb-1 flex items-baseline justify-between gap-3"><div className="flex items-baseline gap-2"><h4 className="text-sm font-medium text-zinc-900">联合生成资料（可选）</h4><span className="text-[11px] font-medium text-zinc-400">持续优化中</span></div><span className="text-xs text-zinc-400">主文档 + {selectedDocs.length} 篇关联文档</span></div>
                <p className="mb-3 text-xs leading-relaxed text-zinc-500">所选文档会与主文档共同生成适配不同角色的协作视图。</p>
                
                <div aria-disabled="true" className="mb-3 flex cursor-not-allowed items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-400">
                  <Sparkles size={14} className="shrink-0 text-indigo-500" />
                  <span>AI 搜索企业内相关文档，功能开发中……</span>
                </div>

                <div className="max-h-48 overflow-y-auto border border-zinc-200 rounded-xl divide-y divide-zinc-100">
                  {allDocs.filter(d => d.id !== doc.id && d.type !== 'folder').map(d => {
                    const isSelected = selectedDocIds.has(d.id);
                    return (
                      <button
                        key={d.id}
                        onClick={() => toggleDocSelection(d.id)}
                        className={`flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-zinc-50 ${isSelected ? 'bg-zinc-100' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isSelected ? 'bg-zinc-200 text-zinc-700' : 'bg-zinc-100 text-zinc-500'}`}>
                            <FileText size={16} />
                          </div>
                          <span className={`text-sm ${isSelected ? 'font-medium text-zinc-900' : 'text-zinc-700'}`}>
                            {d.title}
                          </span>
                        </div>
                        {isSelected && <Check size={16} className="text-zinc-900" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedDocs.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-zinc-900 mb-2">已选择关联文档</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedDocs.map(d => (
                      <span key={d.id} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-900">
                        <FileText size={12} />
                        {d.title}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button type="button" onClick={() => setIncludeVisualOverview(value => !value)} className={`mb-6 flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors ${includeVisualOverview ? 'border-indigo-200 bg-indigo-50/60' : 'border-zinc-200 bg-white hover:bg-zinc-50'}`}>
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${includeVisualOverview ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-zinc-300 bg-white text-transparent'}`}><Check size={13} strokeWidth={3} /></span>
                <span><span className="block text-sm font-semibold text-zinc-800">附带项目速览</span><span className="mt-1 block text-xs leading-relaxed text-zinc-500">为每个角色生成一张凝练的项目思维导图，说明项目是什么、该做什么、与谁协作。</span></span>
              </button>

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
                  className="rounded-lg bg-zinc-950 px-6 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
                >
                  生成衍生
                </button>
              </div>
            </motion.div>
          </motion.div>
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
                   onClick={() => { setIsShareModalOpen(false); setSelectedShareChatIds(new Set()); }}
                   aria-label="关闭分享窗口"
                   className="text-zinc-400 hover:text-zinc-600 p-1 rounded-md hover:bg-zinc-100 transition-colors"
                 >
                   <X size={20} />
                 </button>
               </div>
               
               <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
                 <div className="space-y-1">
                   {shareTargets.map(({ chat, user }) => {
                     const isSelected = selectedShareChatIds.has(chat.id);
                     return (
                       <button
                         key={chat.id}
                         onClick={() => setSelectedShareChatIds(previous => {
                           const next = new Set(previous);
                           if (next.has(chat.id)) next.delete(chat.id); else next.add(chat.id);
                           return next;
                         })}
                         aria-pressed={isSelected}
                         className={`w-full flex items-center justify-between p-3 rounded-xl border transition-colors ${
                           isSelected 
                             ? 'border-zinc-300 bg-zinc-100 text-zinc-950 shadow-sm'
                             : 'border-transparent hover:bg-zinc-50'
                         }`}
                       >
                         <div className="flex items-center gap-3">
                           <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                           <div className="text-left">
                             <div className={`text-sm ${isSelected ? 'font-semibold text-zinc-950' : 'font-medium text-zinc-900'}`}>
                               {user.name}
                             </div>
                             <div className="text-xs text-zinc-500 truncate max-w-[180px]">
                               {chat.lastMessage}
                             </div>
                           </div>
                         </div>
                         {isSelected && <Check size={16} strokeWidth={2.5} className="shrink-0 text-zinc-900" />}
                       </button>
                     );
                   })}
                 </div>
               </div>

               <div className="flex justify-end gap-3 shrink-0 mt-6 pt-4 border-t border-zinc-100">
                  <button 
                    onClick={() => { setIsShareModalOpen(false); setSelectedShareChatIds(new Set()); }}
                    className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    onClick={() => {
                      if (selectedShareChatIds.size) {
                        onShareDoc(Array.from(selectedShareChatIds), doc);
                        setIsShareModalOpen(false);
                        setSelectedShareChatIds(new Set());
                      }
                    }}
                    disabled={!selectedShareChatIds.size}
                    className="min-w-28 px-5 py-2 bg-zinc-950 hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
                  >
                    {selectedShareChatIds.size ? `发送给 ${selectedShareChatIds.size} 个会话` : '发送'}
                  </button>
               </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
