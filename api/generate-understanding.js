import { createHash } from 'node:crypto';

const KIMI_API_URL = 'https://api.moonshot.cn/v1/chat/completions';

function required(value, name) {
  if (!value) throw new Error(`缺少服务器环境变量：${name}`);
  return value;
}

function supabaseHeaders() {
  const key = required(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY');
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function contentHash(value) {
  return createHash('sha256').update(value).digest('hex');
}

// Block ids come from the application, never from the model. Paragraph ids are
// deterministic for this prototype; the editor can later persist them directly.
function buildBlocks(content, prefix = 'source') {
  const lines = content.replace(/\r\n/g, '\n').split('\n').map(line => line.trim()).filter(Boolean);
  return lines.map((text, index) => ({ id: `${prefix}-${index + 1}`, text }));
}

function parseModelJson(content) {
  const candidate = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(candidate);
  if (!Array.isArray(parsed.facts)) throw new Error('AI 返回的理解底稿格式不正确');
  return parsed;
}

function validateFacts(facts, blocks) {
  const blockById = new Map(blocks.map(block => [block.id, block.text]));
  return facts.slice(0, 40).flatMap((fact, index) => {
    if (typeof fact?.statement !== 'string' || !fact.statement.trim() || !Array.isArray(fact.evidence)) return [];
    const evidence = fact.evidence.slice(0, 3).flatMap(item => {
      const text = blockById.get(item?.block_id);
      const quote = typeof item?.quote === 'string' ? item.quote.trim() : '';
      if (!text || quote.length < 12 || quote.length > 120 || !text.includes(quote)) return [];
      return [{ block_id: item.block_id, quote }];
    });
    if (!evidence.length) return [];
    return [{ id: `fact-${index + 1}`, statement: fact.statement.trim(), evidence }];
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: '只支持 POST 请求' });
  try {
    const { sourceDocument, relatedDocuments = [] } = req.body || {};
    if (!sourceDocument?.id || !sourceDocument?.title || !sourceDocument?.content) {
      return res.status(400).json({ error: '缺少原始文档信息' });
    }

    const sourceBlocks = buildBlocks(sourceDocument.content);
    const relatedBlocks = relatedDocuments.flatMap(doc => buildBlocks(doc.content || '', `related-${doc.id}`));
    const allBlocks = [...sourceBlocks, ...relatedBlocks];
    const sourceContentHash = contentHash(sourceDocument.content);
    const relatedContentHash = contentHash(relatedDocuments.map(doc => `${doc.id}:${doc.content || ''}`).join('\n'));
    const url = required(process.env.SUPABASE_URL, 'SUPABASE_URL');
    const headers = supabaseHeaders();
    const existing = await fetch(`${url}/rest/v1/document_understandings?source_document_id=eq.${encodeURIComponent(sourceDocument.id)}&source_content_hash=eq.${sourceContentHash}&related_content_hash=eq.${relatedContentHash}&select=id,source_blocks,facts,created_at&limit=1`, { headers });
    if (!existing.ok) throw new Error(`读取理解底稿失败：${await existing.text()}`);
    const cached = await existing.json();
    if (cached[0]) return res.status(200).json({ understanding: { ...cached[0], cached: true } });

    const blockText = allBlocks.map(block => `[${block.id}] ${block.text}`).join('\n');
    const prompt = `你是企业产品研发协作助手。请只依据下面带编号的文档内容，提取一份可复用、可追溯的中文理解底稿。\n\n文档内容：\n${blockText}\n\n只返回合法 JSON，不要使用 Markdown 或代码块。格式必须为：\n{"facts":[{"statement":"可验证的完整事实或流程说明","evidence":[{"block_id":"source-1","quote":"该内容块中连续出现的 12-120 个字符"}]}]}\n\n规则：\n- facts 覆盖目标、范围、流程、交付物、约束、明确的待确认事项；最多 40 条。\n- 每条 fact 至少有一个 evidence。\n- block_id 必须来自输入，quote 必须逐字连续出现于该 block。\n- 没有依据不要推断，不要给出业务风险判断。`;
    const kimiResponse = await fetch(process.env.KIMI_API_URL || KIMI_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${required(process.env.KIMI_API_KEY, 'KIMI_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.KIMI_MODEL || 'kimi-k2.5', temperature: 1, messages: [{ role: 'system', content: '你是严谨的企业文档理解助手。' }, { role: 'user', content: prompt }] }),
    });
    if (!kimiResponse.ok) throw new Error(`Kimi 调用失败：${await kimiResponse.text()}`);
    const result = await kimiResponse.json();
    const facts = validateFacts(parseModelJson(result.choices?.[0]?.message?.content || '').facts, allBlocks);
    if (!facts.length) throw new Error('AI 未能生成可验证的理解底稿，请重试');

    const save = await fetch(`${url}/rest/v1/document_understandings?on_conflict=source_document_id,source_content_hash,related_content_hash`, {
      method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ source_document_id: sourceDocument.id, source_content_hash: sourceContentHash, related_content_hash: relatedContentHash, source_blocks: allBlocks, facts, model: process.env.KIMI_MODEL || 'kimi-k2.5' }),
    });
    if (!save.ok) throw new Error(`保存理解底稿失败：${await save.text()}`);
    const [understanding] = await save.json();
    return res.status(200).json({ understanding: { ...understanding, cached: false } });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : '生成理解底稿失败' });
  }
}
