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
    const { sourceDocument, role, relatedDocuments = [], understanding = null } = req.body || {};
    if (!sourceDocument?.id || !sourceDocument?.title || !sourceDocument?.content || !role?.id || !role?.name) {
      return json(res, 400, { error: '缺少原始文档或目标角色信息' });
    }

    const relatedContext = relatedDocuments.length
      ? relatedDocuments.map((doc) => `- ${doc.title}${doc.content ? `：${doc.content}` : ''}`).join('\n')
      : '无';
    const factContext = Array.isArray(understanding?.facts) && understanding.facts.length
      ? understanding.facts.map((fact) => `- ${fact.statement}\n  依据：${fact.evidence.map(item => item.quote).join('；')}`).join('\n')
      : null;
    const sourceContext = factContext
      ? `已完成的文档理解底稿（只能依据以下事实和依据生成）：\n${factContext}`
      : `原始文档：\n${sourceDocument.content}\n\n关联资料：\n${relatedContext}`;
    const prompt = `你是企业产品研发协作助手。请只依据提供的资料，为「${role.name}」生成一份可执行的中文工作视图。\n\n原始文档标题：${sourceDocument.title}\n${sourceContext}\n\n请使用 Markdown，并严格按以下标题组织：\n# 角色工作视图\n## 核心目标\n## 需要关注的内容\n## 行动清单\n## 风险与待确认事项\n\n引用规则：\n- 不要输出“原文依据”章节、附录或参考文献列表。\n- 对每个关键结论或行动项，在对应句子末尾嵌入 1 个引用，格式必须是 [[cite:原文中连续出现的精确短句]]。\n- cite 内只能复制上方“依据”中连续出现的 12–60 个字符，不能概括、改写或编造；不要在 cite 外展示原文摘录。\n- 无法在原文中找到准确依据时，写“待确认”，不要添加引用。\n\n不要编造资料中不存在的事实；不确定时明确标注“待确认”。`;

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
    const content = contentFromStream(await kimiResponse.text());
    if (!content) throw new Error('Kimi 没有返回可用内容');

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
