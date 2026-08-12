/**
 * Vercel Serverless Function
 *
 * Keeps the Kimi and Supabase secret keys on the server.  The browser only
 * calls /api/generate-derivation and never receives either key.
 */
import { createHash } from 'node:crypto';

const KIMI_API_URL = 'https://api.moonshot.cn/v1/chat/completions';

// Keep source-version semantics consistent with the browser: punctuation and
// whitespace alone do not require role documents to be regenerated.
function meaningfulSourceVersion(value) {
  return String(value || '').normalize('NFKC').replace(/[\s\p{P}\p{S}]+/gu, '');
}

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

function keepCompleteHistoryMarkers(content) {
  const markers = [...content.matchAll(/\[\[history:([^\]]+)\]\]/g)].map(match => match[1].trim());
  const isComplete = markers.length === 2 && markers.every(marker => /^legacy\/[a-z0-9_./-]+\.(?:ts|tsx|js)$/i.test(marker));
  // Historical logic is optional UI context. It must never prevent the
  // grounded role document from being generated; show both markers or none.
  return isComplete ? content : content.replace(/\[\[history:[^\]]*(?:\]\]|$)/g, '');
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
    const { sourceDocument, role, relatedDocuments = [], sourceImages = [], understanding = null, existingContent = null, partialContent = null, resolveSmallPatch = false } = req.body || {};
    if (!sourceDocument?.id || !sourceDocument?.title || !sourceDocument?.content || !role?.id || !role?.name) {
      return json(res, 400, { error: '缺少原始文档或目标角色信息' });
    }

    // Small source edits (such as 0–1000 → 0–2000) are synchronised by the
    // client as an exact, local replacement. Persist that already-scoped
    // patch directly so this path never spends time regenerating a whole role
    // document or changes any of its unaffected wording.
    if (typeof partialContent === 'string') {
      const saved = await saveDerivation({
        source_document_id: sourceDocument.id,
        source_document_title: sourceDocument.title,
        role_id: role.id,
        role_name: role.name,
        related_document_ids: relatedDocuments.map((doc) => doc.id),
        content: partialContent,
        model: process.env.KIMI_MODEL || 'kimi-k2.5',
        source_content_hash: createHash('sha256').update(meaningfulSourceVersion(sourceDocument.content)).digest('hex'),
      });
      return json(res, 200, { derivation: saved });
    }

    if (resolveSmallPatch && typeof existingContent === 'string') {
      const patchResponse = await fetch(process.env.KIMI_API_URL || KIMI_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${required(process.env.KIMI_API_KEY, 'KIMI_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // This model family only accepts temperature 1 for non-streaming
          // calls. The prompt still constrains the response to one JSON patch.
          model: process.env.KIMI_MODEL || 'kimi-k2.5', temperature: 1,
          messages: [{ role: 'system', content: '你是严谨的文本差异助手。' }, { role: 'user', content: `只比较当前原文与旧衍生文档，找出唯一一处已经过时的短文字或数值。只返回 JSON：{"old_text":"旧衍生文档中逐字存在的文本","new_text":"应替换的新文本"}。若无法唯一确定，返回 {"old_text":"","new_text":""}。不得输出其他内容。\n\n当前原文：\n${sourceDocument.content}\n\n旧衍生文档：\n${existingContent}` }],
        }),
      });
      if (!patchResponse.ok) throw new Error(`AI 修改点识别失败：${await patchResponse.text()}`);
      const patchContent = (await patchResponse.json()).choices?.[0]?.message?.content || '';
      const patchMatch = patchContent.match(/\{[\s\S]*\}/);
      const patch = patchMatch ? JSON.parse(patchMatch[0]) : {};
      if (typeof patch.old_text !== 'string' || typeof patch.new_text !== 'string' || !patch.old_text || !patch.new_text || patch.old_text === patch.new_text || !existingContent.includes(patch.old_text) || patch.old_text.length > 80 || patch.new_text.length > 80) throw new Error('未能唯一识别修改点，请重新编辑该数值后再同步');
      return json(res, 200, { patch: { old_text: patch.old_text, new_text: patch.new_text } });
    }

    const citationSources = sourceDocumentsForCitation(sourceDocument, relatedDocuments);
    const images = Array.isArray(sourceImages) ? sourceImages.slice(0, 12).flatMap((image, index) => {
      if (!image?.id || typeof image.alt !== 'string') return [];
      return [{ id: typeof image.id === 'string' ? image.id : `source-image-${index + 1}`, alt: image.alt.trim() || `原文图片 ${index + 1}` }];
    }) : [];
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
    const headingRequirements = role.id === 'backend'
      ? `请使用 Markdown，但不要套用固定的四段式模板。根据资料中的实际改动自然组织标题与内容，让后端开发能快速判断实施范围。`
      : hasRelatedSource
      ? `请使用 Markdown，并严格按以下标题组织：\n# 联合工作标题\n## ${role.name}工作视图\n## 核心目标\n## 需要关注的内容\n## 行动清单\n## 风险与待确认事项\n\n标题规则：\n- “联合工作标题”必须是 6–18 个中文字符的主题概括，提炼多篇文档共同要解决的业务或研发事项。\n- 不得把文档标题直接拼接、不得使用加号、不得照抄任一文档标题、不得包含角色名称。`
      : `请使用 Markdown，并严格按以下标题组织：\n# 角色工作视图\n## 核心目标\n## 需要关注的内容\n## 行动清单\n## 风险与待确认事项`;
    const citationRequirements = useBlockCitations
      ? `- 对每个关键结论或行动项，在对应句子末尾嵌入 1 个引用，格式必须是 [[cite:原文块ID]]。示例：[[cite:S1]]；关联文档的块会是 [[cite:R1-1]]。\n- 原文块ID 必须从资料中方括号标出的短 ID 原样复制。S 开头代表主文档，R 开头代表关联文档。\n- 不要填写文档标题或文档 ID，不要复制原文短句，不要编造或省略引用标记。`
      : `- 对每个关键结论或行动项，在对应句子末尾嵌入 1 个引用，格式必须是 [[cite:原文中连续出现的精确短句]]。\n- cite 内只能复制上方原始文档中连续出现的 12–60 个字符，不能概括、改写或编造；不要在 cite 外展示原文摘录。`;
    const taskInstruction = isCitationRepair
      ? `下面是已有的角色工作视图。请修复其中的引用：保留标题、段落、表格、行动项和正文措辞，不要重新总结或增删业务内容；删除其中残缺的 ]] 或旧引用标记，并为每个关键结论或行动项补上正确引用。\n\n已有角色工作视图：\n${existingContent}`
      : `请生成一份可执行的中文工作视图。\n\n${headingRequirements}`;
    const historyLogicInstruction = isCitationRepair
      ? `- 保留已有的 [[history:...]] 历史逻辑标记，不要增加、删除或改写它们。`
      : `- 在全文中恰好插入 2 个 [[history:代码路径]] 标记。它们必须附在 ${role.name} 需要额外关注的独立提醒句末尾，不能附在任何原文结论、行动项或原文引用后；这两句用于模拟该角色从历史代码库发现的既有处理约束，不是原文信息，也不需要 cite 引用。代码路径必须是看起来真实的 legacy/ 模块路径，例如 [[history:legacy/entitlements/priority-policy.ts]]。不要解释标记，也不要在同一句放置 cite 和 history 标记。`;
    const imageInstruction = isCitationRepair
      ? `- 保留已有的 [[image:...]] 图片标记，不要增加、删除或改写它们。`
      : images.length ? `- 原文图片必须全部保留在衍生文档中。图片清单：\n${images.map(image => `  - ${image.id}：${image.alt}`).join('\n')}\n- 为每张图片各输出一次独占一行的 [[image:图片ID]] 标记，放在与图片含义最相关的段落之后；图片标记不是引用，不要添加 cite，也不要解释它。` : `- 原文没有图片，不要输出 [[image:...]] 标记。`;
    const backendInstruction = role.id === 'backend' ? `\n后端工作视图要求：\n- 优先说清改动点：新增、修改或删除哪些业务对象、接口能力、状态或数据。\n- 必须展开判断逻辑：输入和权限校验、状态流转、优先级、互斥与去重规则、异常路径，以及需要幂等或并发保护的位置。\n- 必须说明回显数据怎么拿：列表、详情或操作完成后分别需要哪些数据；推荐的查询口径、筛选/分页、聚合或空数据处理。\n- 当资料足以支撑时，直接给出推荐的数据表/字段设计，包括字段用途、类型、必填性、默认值、关联关系、唯一约束、索引、状态与时间字段；这些是“推荐设计”，必须用资料中的业务约束解释原因。\n- 当资料不足以支撑具体字段或存量方案时，不得虚构表名、字段或现网行为；清楚写出“待确认”，并指出缺少的口径。\n- 不需要机械地为以上四项设置标题，但输出必须让后端能找到这些信息。\n- 对资料明确的事实、规则和约束，在对应句后保留原文引用；推荐设计可引用其业务依据，但不要把推荐设计伪装成原文事实。\n` : '';
    const prompt = `你是企业产品研发协作助手。请只依据提供的资料，为「${role.name}」完成以下工作：\n\n${taskInstruction}${backendInstruction}\n\n原始文档标题：${sourceDocument.title}\n${sourceContext}\n\n引用规则：\n- 不要输出“原文依据”章节、附录或参考文献列表。\n${citationRequirements}\n- 无法在任一来源文档中找到准确依据时，写“待确认”，不要添加引用。\n\n图片规则：\n${imageInstruction}\n\n历史逻辑规则：\n${historyLogicInstruction}\n\n不要编造资料中不存在的事实；不确定时明确标注“待确认”。`;

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
    // Preserve the original single-document pipeline exactly. All citation
    // rewriting and validation belongs exclusively to the related-document
    // path, where a source identifier is required for cross-document lookup.
    const citedContent = useBlockCitations ? resolveBlockCitations(responseContent, citationBlocks) : responseContent;
    const content = isCitationRepair ? citedContent : keepCompleteHistoryMarkers(citedContent);
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
      // A semantic source version lets the client ignore punctuation-only
      // edits while still detecting every meaningful content change.
      source_content_hash: createHash('sha256').update(meaningfulSourceVersion(sourceDocument.content)).digest('hex'),
    });
    return json(res, 200, { derivation: saved });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error instanceof Error ? error.message : '生成失败，请稍后重试' });
  }
}
