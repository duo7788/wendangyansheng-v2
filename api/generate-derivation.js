/**
 * Vercel Serverless Function
 *
 * Keeps the Kimi and Supabase secret keys on the server.  The browser only
 * calls /api/generate-derivation and never receives either key.
 */
import { createHash } from 'node:crypto';

const KIMI_API_URL = 'https://api.moonshot.cn/v1/chat/completions';

function required(value, name) {
  if (!value) throw new Error(`缺少服务器环境变量：${name}`);
  return value;
}

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body));
}

// Kimi uses SSE when stream=true. We keep the upstream connection active while
// collecting the final text, then preserve this API's existing JSON response.
function contentFromStream(payload) {
  let content = '';
  for (const line of payload.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      const chunk = JSON.parse(data);
      content += chunk.choices?.[0]?.delta?.content || '';
    } catch {
      // Ignore malformed non-content SSE messages. The final content check
      // below still makes a failed stream visible to the caller.
    }
  }
  return content;
}

function sourceDocumentsForCitation(sourceDocument, relatedDocuments) {
  return [sourceDocument, ...relatedDocuments]
    .filter(document => document?.id && document?.title && document?.content)
    .map(document => ({ id: String(document.id), title: String(document.title), content: String(document.content) }));
}

function buildCitationBlocks(sourceDocuments) {
  return sourceDocuments.flatMap((document, documentIndex) => {
    const lines = document.content.replace(/\r\n/g, '\n').split('\n').map(line => line.trim()).filter(Boolean);
    let sequence = 0;
    const prefix = documentIndex === 0 ? 'S' : `R${documentIndex}-`;
    return lines.flatMap(line => {
      const chunks = line.match(/.{1,100}/g) || [];
      return chunks.filter(chunk => chunk.length >= 12).map(text => ({
        id: `${prefix}${++sequence}`,
        documentId: document.id,
        text,
      }));
    });
  });
}

function resolveBlockCitations(content, blocks) {
  const blockById = new Map(blocks.map(block => [block.id, block]));
  const resolved = content.replace(/\[\[cite:([^\]]*)\]\]/g, (marker, rawReference) => {
    // A model can occasionally append an old-style quote after the block id.
    // The leading id remains enough to produce a grounded, exact citation.
    const blockId = rawReference.split('|', 1)[0].trim();
    const block = blockById.get(blockId);
    // Citation formatting should never make an otherwise useful role view
    // disappear. Drop an unknown marker rather than inventing a source.
    if (!block) return '';
    return `[[cite:${block.documentId}|${block.text}]]`;
  });
  // Recover from a stream ending halfway through a marker. Removing only the
  // marker keeps the generated statement while avoiding raw syntax in the UI.
  return resolved.replace(/\[\[cite:[^\s\]]*/g, '');
}

function normalizeCitationText(value) {
  return value
    .normalize('NFKC')
    .replace(/[\s\u00a0]+/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

function normalizeSingleDocumentCitations(content, sourceDocument) {
  let foundCitation = false;
  const normalized = content.replace(/\[\[cite:([\s\S]*?)(?:\]\]|】)/g, (marker, rawQuote) => {
    foundCitation = true;
    const quote = rawQuote.trim();
    if (quote.length < 12 || quote.length > 120 || !normalizeCitationText(sourceDocument.content).includes(normalizeCitationText(quote))) {
      throw new Error('AI 返回的单篇文档引用无法在原文中定位，请重试');
    }
    return `[[cite:${quote}]]`;
  });
  if (!foundCitation) throw new Error('AI 未返回单篇文档引用，请重试');
  if (/\[\[cite:/.test(normalized)) throw new Error('AI 返回了不完整的单篇文档引用，请重试');
  return normalized;
}

function validateCitations(content, sourceDocuments) {
  const sourceById = new Map(sourceDocuments.map(document => [document.id, document]));
  const citations = [...content.matchAll(/\[\[cite:([^|\]]+)\|([\s\S]*?)\]\]/g)];
  for (const citation of citations) {
    const documentId = citation[1].trim();
    const quote = citation[2].trim();
    const source = sourceById.get(documentId);
    if (!source) throw new Error('AI 返回了未知来源文档的引用，请重试');
    if (quote.length < 12 || quote.length > 120) throw new Error('AI 返回的引用长度不正确，请重试');
    if (!normalizeCitationText(source.content).includes(normalizeCitationText(quote))) {
      throw new Error('AI 返回的引用在对应文档中找不到，请重试');
    }
  }
}

async function saveDerivation(record) {
  const url = required(process.env.SUPABASE_URL, 'SUPABASE_URL');
  const key = required(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY');
  // New Supabase secret keys (`sb_secret_...`) are API keys, not JWTs.
  // Legacy service_role keys are JWTs and still need the Bearer header.
  const headers = {
    apikey: key,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=representation',
  };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`${url}/rest/v1/document_derivations?on_conflict=source_document_id,role_id`, {
    method: 'POST',
    headers,
    body: JSON.stringify(record),
  });
  if (!response.ok) throw new Error(`保存到 Supabase 失败：${await response.text()}`);
  const rows = await response.json();
  return rows[0];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: '只支持 POST 请求' });

  try {
    const { sourceDocument, role, relatedDocuments = [], understanding = null, existingContent = null } = req.body || {};
    if (!sourceDocument?.id || !sourceDocument?.title || !sourceDocument?.content || !role?.id || !role?.name) {
      return json(res, 400, { error: '缺少原始文档或目标角色信息' });
    }

    const citationSources = sourceDocumentsForCitation(sourceDocument, relatedDocuments);
    const hasRelatedSource = citationSources.length > 1;
    const isCitationRepair = typeof existingContent === 'string' && existingContent.trim().length > 0;
    const useBlockCitations = hasRelatedSource || isCitationRepair;
    const citationBlocks = useBlockCitations ? buildCitationBlocks(citationSources) : [];
    if (useBlockCitations && !citationBlocks.length) throw new Error('来源文档中没有可用于引用的文本');
    const sourceMaterial = useBlockCitations
      ? citationSources.map(document => {
        const blocks = citationBlocks.filter(block => block.documentId === document.id);
        return `【文档：${document.title}】\n${blocks.map(block => `[${block.id}] ${block.text}`).join('\n')}`;
      }).join('\n\n')
      : sourceDocument.content;
    const factContext = Array.isArray(understanding?.facts) && understanding.facts.length
      ? understanding.facts.map((fact) => `- ${fact.statement}\n  依据：${fact.evidence.map(item => item.quote).join('；')}`).join('\n')
      : null;
    const sourceContext = factContext
      ? `已完成的文档理解底稿（只能依据以下事实和依据生成）：\n${factContext}\n\n引用来源文档：\n${sourceMaterial}`
      : useBlockCitations ? `来源文档：\n${sourceMaterial}` : `原始文档：\n${sourceMaterial}\n\n关联资料：\n无`;
    const headingRequirements = hasRelatedSource
      ? `请使用 Markdown，并严格按以下标题组织：\n# 联合工作标题\n## ${role.name}工作视图\n## 核心目标\n## 需要关注的内容\n## 行动清单\n## 风险与待确认事项\n\n标题规则：\n- “联合工作标题”必须是 6–18 个中文字符的主题概括，提炼多篇文档共同要解决的业务或研发事项。\n- 不得把文档标题直接拼接、不得使用加号、不得照抄任一文档标题、不得包含角色名称。`
      : `请使用 Markdown，并严格按以下标题组织：\n# 角色工作视图\n## 核心目标\n## 需要关注的内容\n## 行动清单\n## 风险与待确认事项`;
    const citationRequirements = useBlockCitations
      ? `- 对每个关键结论或行动项，在对应句子末尾嵌入 1 个引用，格式必须是 [[cite:原文块ID]]。示例：[[cite:S1]]；关联文档的块会是 [[cite:R1-1]]。\n- 原文块ID 必须从资料中方括号标出的短 ID 原样复制。S 开头代表主文档，R 开头代表关联文档。\n- 不要填写文档标题或文档 ID，不要复制原文短句，不要编造或省略引用标记。`
      : `- 对每个关键结论或行动项，在对应句子末尾嵌入 1 个引用，格式必须是 [[cite:原文中连续出现的精确短句]]。\n- cite 内只能复制上方原始文档中连续出现的 12–60 个字符，不能概括、改写或编造；不要在 cite 外展示原文摘录。`;
    const taskInstruction = isCitationRepair
      ? `下面是已有的角色工作视图。请修复其中的引用：保留标题、段落、表格、行动项和正文措辞，不要重新总结或增删业务内容；删除其中残缺的 ]] 或旧引用标记，并为每个关键结论或行动项补上正确引用。\n\n已有角色工作视图：\n${existingContent}`
      : `请生成一份可执行的中文工作视图。\n\n${headingRequirements}`;
    const prompt = `你是企业产品研发协作助手。请只依据提供的资料，为「${role.name}」完成以下工作：\n\n${taskInstruction}\n\n原始文档标题：${sourceDocument.title}\n${sourceContext}\n\n引用规则：\n- 不要输出“原文依据”章节、附录或参考文献列表。\n${citationRequirements}\n- 无法在任一来源文档中找到准确依据时，写“待确认”，不要添加引用。\n\n不要编造资料中不存在的事实；不确定时明确标注“待确认”。`;

    const model = process.env.KIMI_MODEL || 'kimi-k2.5';
    // The production Kimi endpoint currently requires temperature 0.6 for
    // kimi-k2.6 as well as the older/turbo K2 variants. Keep an explicit
    // environment override for future model-specific changes.
    const supportsThinkingControl = /^kimi-k2\.(5|6)(?:-|$)/.test(model);
    const temperature = Number(process.env.KIMI_TEMPERATURE || 0.6);
    const kimiResponse = await fetch(process.env.KIMI_API_URL || KIMI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${required(process.env.KIMI_API_KEY, 'KIMI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature,
        // Role views are grounded transformations, not long-horizon reasoning
        // tasks. Disabling K2.5 thinking avoids spending minutes on hidden
        // reasoning before returning the first visible content.
        ...(supportsThinkingControl ? { thinking: { type: 'disabled' } } : {}),
        stream: true,
        messages: [
          { role: 'system', content: '你是严谨的企业文档协作助手。' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!kimiResponse.ok) throw new Error(`Kimi 调用失败：${await kimiResponse.text()}`);
    const responseContent = contentFromStream(await kimiResponse.text());
    if (!responseContent) throw new Error('Kimi 没有返回可用内容');
    const content = useBlockCitations
      ? resolveBlockCitations(responseContent, citationBlocks)
      : normalizeSingleDocumentCitations(responseContent, sourceDocument);
    if (useBlockCitations) validateCitations(content, citationSources);
    if (isCitationRepair && !content.includes('[[cite:')) throw new Error('AI 未能修复出有效引用，请重试');

    const saved = await saveDerivation({
      source_document_id: sourceDocument.id,
      source_document_title: sourceDocument.title,
      role_id: role.id,
      role_name: role.name,
      related_document_ids: relatedDocuments.map((doc) => doc.id),
      content,
      model,
      // This is the exact plain-text source sent to the model.  Saving its
      // hash lets the client later tell which role views are affected by an
      // original-document edit, without storing another copy of the source.
      source_content_hash: createHash('sha256').update(sourceDocument.content).digest('hex'),
    });
    return json(res, 200, { derivation: saved });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error instanceof Error ? error.message : '生成失败，请稍后重试' });
  }
}
