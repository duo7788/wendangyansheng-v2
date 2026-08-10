import { useState, useRef, ChangeEvent } from 'react';
import { Plus, UploadCloud, FileText, X, Folder, FolderPlus, Link2, Sparkles, LibraryBig } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as mammoth from 'mammoth';
import { DocLibrary, DocItem } from '../../types';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] || character);

export const formatPlainTextAsDocument = (text: string) => text.split(/\r?\n/).reduce<string[]>((blocks, line) => {
  const value = line.trim();
  if (!value) return blocks;
  if (/^#{1,2}\s+/.test(value)) blocks.push(`<h2>${escapeHtml(value.replace(/^#{1,2}\s+/, ''))}</h2>`);
  else if (/^\d+[.、]\s+/.test(value)) blocks.push(`<h2>${escapeHtml(value)}</h2>`);
  else if (/^[-*•]\s+/.test(value)) {
    const previous = blocks.at(-1);
    const item = `<li>${escapeHtml(value.replace(/^[-*•]\s+/, ''))}</li>`;
    if (previous?.startsWith('<ul>')) blocks[blocks.length - 1] = `${previous.slice(0, -5)}${item}</ul>`;
    else blocks.push(`<ul>${item}</ul>`);
  } else blocks.push(`<p>${escapeHtml(value)}</p>`);
  return blocks;
}, []).join('');

const extractHtmlFromConfluenceDoc = async (file: File) => {
  const raw = await file.text();
  const decoded = new TextDecoder('utf-8').decode(Uint8Array.from(raw.replace(/=\r?\n/g, '').replace(/=([\dA-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))), character => character.charCodeAt(0)));
  const html = decoded.match(/<html[\s\S]*<\/html>/i)?.[0] || decoded;
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('script, style, meta, link, o\\:p').forEach(node => node.remove());
  const boundary = raw.match(/boundary="?([^"\r\n;]+)"?/i)?.[1];
  if (boundary) {
    const attachments = new Map<string, string>();
    raw.split(`--${boundary}`).forEach(part => {
      const location = part.match(/Content-Location:\s*file:\/\/\/[^/\r\n]+\/([^\r\n]+)/i)?.[1]?.trim();
      const encoded = part.match(/Content-Transfer-Encoding:\s*base64[\s\S]*?\r?\n\r?\n([A-Za-z0-9+/=\r\n]+)/i)?.[1]?.replace(/\s/g, '');
      if (location && encoded) attachments.set(location, `data:image/png;base64,${encoded}`);
    });
    parsed.querySelectorAll('img').forEach(image => {
      const filename = image.getAttribute('src')?.split('/').pop() || '';
      const dataUri = attachments.get(filename);
      if (dataUri) image.setAttribute('src', dataUri);
      else image.remove();
    });
  }
  return parsed.body.innerHTML || formatPlainTextAsDocument(parsed.body.textContent || '');
};

interface DocEmptyStateProps {
  libraries: DocLibrary[];
  onAddDoc: (libId: string, doc: DocItem) => void;
  onAddLibrary: (name: string) => void;
}

export function DocEmptyState({ libraries, onAddDoc, onAddLibrary }: DocEmptyStateProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingLibrary, setIsCreatingLibrary] = useState(false);
  const [libraryName, setLibraryName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedHtml, setExtractedHtml] = useState<string>('');
  const [isParsing, setIsParsing] = useState(false);
  const [activeEntryIndex, setActiveEntryIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const entryOptions = [
    { id: 'import-local', title: '导入本地文档', description: '用本地文档资源开始编辑（支持 .doc、.docx）', icon: UploadCloud },
    { id: 'create-document', title: '新建文档', description: '每新建一个文档，都是一次灵感的迸发', icon: FolderPlus },
    { id: 'import-feishu', title: '导入飞书文档链接', description: '与飞书能力互通，可对飞书文档进行衍生', icon: Link2, comingSoon: true },
    { id: 'derivation-intro', title: '查看衍生功能介绍', description: '同一份文档，针对不同角色做定制输出，减少协作gap', icon: Sparkles },
    { id: 'create-library', title: '新建文档库', description: '用库更好地管理文档们', icon: LibraryBig },
  ];
  const activeEntry = entryOptions[activeEntryIndex];

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleEntryClick = (index: number) => {
    if (index !== activeEntryIndex) {
      setActiveEntryIndex(index);
      return;
    }

    if (entryOptions[index].id === 'create-document') setIsCreating(true);
    if (entryOptions[index].id === 'import-local') handleImportClick();
    if (entryOptions[index].id === 'create-library') setIsCreatingLibrary(true);
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setIsImporting(true);
      setIsParsing(true);
      
      try {
        if (file.name.toLowerCase().endsWith('.doc')) {
          setExtractedHtml(await extractHtmlFromConfluenceDoc(file));
        } else {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer }, {
            styleMap: ["p[style-name='Heading 1'] => h1:fresh", "p[style-name='Heading 2'] => h2:fresh", "p[style-name='Heading 3'] => h3:fresh"],
            // Keep every embedded DOCX image in the browser as a data URL.
            // This is deliberately client-only: nothing here is uploaded to AI.
            convertImage: mammoth.images.imgElement(async image => ({
              src: `data:${image.contentType};base64,${await image.readAsBase64String()}`,
            })),
          });
          const parsed = new DOMParser().parseFromString(result.value, 'text/html');
          parsed.querySelectorAll('img').forEach((image, index) => {
            if (!image.getAttribute('alt')) image.setAttribute('alt', `文档图片 ${index + 1}`);
            image.setAttribute('loading', 'lazy');
          });
          setExtractedHtml(parsed.body.innerHTML);
        }
      } catch (error) {
        console.error("Error parsing docx:", error);
        setExtractedHtml("<p>无法解析文档内容或不支持的格式。请上传 .docx 文件。</p>");
      } finally {
        setIsParsing(false);
      }
    }
    // Reset input
    e.target.value = '';
  };

  const handleConfirmImport = (libId: string) => {
    if (!selectedFile) return;
    
    const newDoc: DocItem = {
      id: `d-new-${Date.now()}`,
      title: selectedFile.name.replace(/\.[^/.]+$/, ""), // Remove extension
      updatedAt: '刚刚',
      author: '当前用户',
      type: 'document',
      content: extractedHtml,
      isLocalFile: true,
    };
    
    onAddDoc(libId, newDoc);
    
    setIsImporting(false);
    setSelectedFile(null);
    setExtractedHtml('');
    setIsParsing(false);
  };

  const handleCreate = (libId: string) => {
    onAddDoc(libId, { id: `d-new-${Date.now()}`, title: '未命名文档', isUntitled: true, isBlank: true, updatedAt: '刚刚', author: '当前用户', type: 'document' });
    setIsCreating(false);
  };

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-white">
      <div className="absolute left-1/2 top-[25.5vh] z-10 flex w-full max-w-6xl -translate-x-1/2 flex-col items-center px-6 text-center">
        <div className="mb-8">
          <h2 className="text-[20px] font-semibold tracking-tight text-zinc-950">{activeEntry.title}</h2>
          <p className="mt-5 text-[15px] font-normal tracking-tight text-zinc-400">{activeEntry.description}</p>
        </div>

        <div className="relative h-[246px] w-full max-w-[960px]" aria-label="文档入口选择器">
          {entryOptions.map((option, index) => {
            let distance = (index - activeEntryIndex + entryOptions.length) % entryOptions.length;
            if (distance > 2) distance -= entryOptions.length;
            const placement = {
              '-2': { x: -422, scale: 0.54, opacity: 0.34, zIndex: 1 },
              '-1': { x: -248, scale: 0.72, opacity: 0.58, zIndex: 2 },
              '0': { x: 0, scale: 1, opacity: 1, zIndex: 5 },
              '1': { x: 248, scale: 0.72, opacity: 0.58, zIndex: 2 },
              '2': { x: 422, scale: 0.54, opacity: 0.34, zIndex: 1 },
            }[String(distance) as '-2' | '-1' | '0' | '1' | '2'];
            const Icon = option.icon;
            const isActive = distance === 0;

            return <motion.button
              key={option.title}
              type="button"
              aria-pressed={isActive}
              aria-label={option.title}
              onClick={() => handleEntryClick(index)}
              animate={placement}
              whileHover={{ rotate: -4, y: -5, scale: placement.scale * 1.035 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26, mass: 0.7 }}
              style={{ left: 'calc(50% - 115px)', transformOrigin: '50% 50%' }}
              className="absolute top-8 h-[154px] w-[230px] cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-4"
            >
              <svg aria-hidden="true" viewBox="0 0 197 158" preserveAspectRatio="none" className="absolute inset-0 h-full w-full drop-shadow-[0_10px_22px_rgba(24,24,27,0.05)]" fill="white">
                <path d="M79.1664 1H48H23C10.8497 1 1 10.8497 1 23V135C1 147.15 10.8497 157 23 157H174C186.15 157 196 147.15 196 135V40C196 27.8497 186.15 18 174 18H122.834C119.329 18 115.874 17.1626 112.759 15.5574L89.2414 3.44256C86.1256 1.83744 82.6714 1 79.1664 1Z" stroke="#DADBDC" strokeWidth="2" />
              </svg>
              <span className="absolute left-5 right-5 top-[52px] h-px bg-zinc-200" />
              <span className="absolute bottom-5 left-5 flex items-center gap-1.5 text-[13px] font-medium text-zinc-500"><span>{option.title}</span>{option.comingSoon && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">开发中</span>}</span>
              <span className="absolute bottom-4 right-5 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-500"><Icon size={19} strokeWidth={1.6} /></span>
            </motion.button>;
          })}
        </div>

        <div className="-mt-2 flex items-center gap-2" aria-label="选择文档入口">
          {entryOptions.map((option, index) => <button key={option.title} type="button" onClick={() => setActiveEntryIndex(index)} aria-label={`选择${option.title}`} className={`h-1.5 rounded-full transition-all ${index === activeEntryIndex ? 'w-6 bg-zinc-800' : 'w-1.5 bg-zinc-300 hover:bg-zinc-400'}`} />)}
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
        />
      </div>

      <AnimatePresence>
        {isCreatingLibrary && <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4"><motion.form initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }} onSubmit={event => { event.preventDefault(); const name = libraryName.trim(); if (!name) return; onAddLibrary(name); setLibraryName(''); setIsCreatingLibrary(false); }} className="w-full max-w-sm rounded-2xl border border-zinc-100 bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><h3 className="text-lg font-semibold text-zinc-900">新建文档库</h3><button type="button" onClick={() => { setIsCreatingLibrary(false); setLibraryName(''); }} aria-label="关闭" className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"><X size={20} /></button></div><label className="mt-6 block text-sm font-medium text-zinc-700" htmlFor="library-name">文档库名称</label><input id="library-name" autoFocus value={libraryName} onChange={event => setLibraryName(event.target.value)} maxLength={40} placeholder="例如：客户项目" className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-700 focus:ring-2 focus:ring-zinc-100" /><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => { setIsCreatingLibrary(false); setLibraryName(''); }} className="px-3 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900">取消</button><button type="submit" disabled={!libraryName.trim()} className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400">创建</button></div></motion.form></div>}
        {isCreating && <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4"><motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-sm rounded-2xl border border-zinc-100 bg-white p-6 shadow-xl"><div className="mb-5 flex items-center justify-between"><h3 className="text-lg font-semibold">选择文档库</h3><button onClick={() => setIsCreating(false)} aria-label="关闭" className="rounded p-1 text-zinc-400 hover:bg-zinc-100"><X size={20} /></button></div><p className="mb-4 text-sm text-zinc-500">新文档将创建在你选择的文档库中。</p><div className="space-y-2">{libraries.map(lib => <button key={lib.id} onClick={() => handleCreate(lib.id)} className="flex w-full items-center gap-3 rounded-xl border border-zinc-100 p-3 text-left hover:bg-zinc-50"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Folder size={16} /></span><span className="text-sm font-medium text-zinc-800">{lib.name}</span></button>)}</div></motion.div></div>}
        {isImporting && selectedFile && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-900/20 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl shadow-xl border border-zinc-100 p-6 w-full max-w-sm"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-zinc-900">选择文档库</h3>
                <button 
                  onClick={() => setIsImporting(false)}
                  className="text-zinc-400 hover:text-zinc-600 p-1 rounded-md hover:bg-zinc-100"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="mb-6">
                <p className="text-sm text-zinc-500 mb-2">{isParsing ? '正在读取文档和图片：' : '已在本机导入：'}</p>
                <div className="flex items-center gap-2 bg-zinc-50 p-3 rounded-lg border border-zinc-100">
                  <FileText size={16} className="text-blue-500" />
                  <span className="text-sm text-zinc-700 font-medium truncate">{selectedFile.name}</span>
                </div>
                <p className="mt-3 text-xs leading-5 text-zinc-400">图片仅保存在当前浏览器，并会随文档在衍生视图中展示。</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-zinc-500 mb-2">添加到：</p>
                {libraries.map(lib => (
                  <button
                    key={lib.id}
                    onClick={() => handleConfirmImport(lib.id)}
                    disabled={isParsing}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-50 border border-zinc-100 transition-colors text-left disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                      <Folder size={16} />
                    </div>
                    <span className="text-sm font-medium text-zinc-800">{isParsing ? '正在解析…' : lib.name}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
