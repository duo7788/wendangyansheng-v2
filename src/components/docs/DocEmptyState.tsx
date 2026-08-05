import { useState, useRef, ChangeEvent } from 'react';
import { Plus, UploadCloud, FileText, X, Folder } from 'lucide-react';
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
}

export function DocEmptyState({ libraries, onAddDoc }: DocEmptyStateProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedHtml, setExtractedHtml] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setIsImporting(true);
      
      try {
        if (file.name.toLowerCase().endsWith('.doc')) {
          setExtractedHtml(await extractHtmlFromConfluenceDoc(file));
        } else {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer }, { styleMap: ["p[style-name='Heading 1'] => h1:fresh", "p[style-name='Heading 2'] => h2:fresh", "p[style-name='Heading 3'] => h3:fresh"] });
          setExtractedHtml(result.value);
        }
      } catch (error) {
        console.error("Error parsing docx:", error);
        setExtractedHtml("<p>无法解析文档内容或不支持的格式。请上传 .docx 文件。</p>");
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
      content: extractedHtml
    };
    
    onAddDoc(libId, newDoc);
    
    setIsImporting(false);
    setSelectedFile(null);
    setExtractedHtml('');
  };

  const handleCreate = (libId: string) => {
    onAddDoc(libId, { id: `d-new-${Date.now()}`, title: '未命名文档', isUntitled: true, isBlank: true, updatedAt: '刚刚', author: '当前用户', type: 'document' });
    setIsCreating(false);
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-white relative">
      <div className="flex flex-col items-center max-w-md text-center">
        <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-6 border border-blue-100">
          <FileText size={40} strokeWidth={1.5} />
        </div>
        <h2 className="text-2xl font-semibold text-zinc-900 mb-2">欢迎使用文档</h2>
        <p className="text-zinc-500 mb-8 leading-relaxed">
          在这里创建、管理和分享您的知识库。您可以从头开始编写，或导入已有文档。
        </p>
        
        <div className="flex items-center gap-4">
          <button onClick={() => setIsCreating(true)} className="flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors shadow-sm">
            <Plus size={18} />
            新建文档
          </button>
          
          <button 
            onClick={handleImportClick}
            className="flex items-center gap-2 px-6 py-3 bg-white text-zinc-700 border border-zinc-200 rounded-xl font-medium hover:bg-zinc-50 hover:text-zinc-900 transition-all shadow-sm"
          >
            <UploadCloud size={18} />
            导入文档
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange}
            accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden" 
          />
        </div>
      </div>

      <AnimatePresence>
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
                <p className="text-sm text-zinc-500 mb-2">正在导入文件：</p>
                <div className="flex items-center gap-2 bg-zinc-50 p-3 rounded-lg border border-zinc-100">
                  <FileText size={16} className="text-blue-500" />
                  <span className="text-sm text-zinc-700 font-medium truncate">{selectedFile.name}</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-zinc-500 mb-2">添加到：</p>
                {libraries.map(lib => (
                  <button
                    key={lib.id}
                    onClick={() => handleConfirmImport(lib.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-50 border border-zinc-100 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                      <Folder size={16} />
                    </div>
                    <span className="text-sm font-medium text-zinc-800">{lib.name}</span>
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
