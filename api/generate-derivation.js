/**
 * Vercel Serverless Function
 *
 * Keeps the Kimi and Supabase secret keys on the server.  The browser only
 * calls /api/generate-derivation and never receives either key.
 */
const KIMI_API_URL = 'https://api.moonshot.cn/v1/chat/completions';

function required(value, name) {
  if (!value) throw new Error(`缺少服务器环境变量：${name}`);
  return value;
}

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body));
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
    const { sourceDocument, role, relatedDocuments = [] } = req.body || {};
    if (!sourceDocument?.id || !sourceDocument?.title || !sourceDocument?.content || !role?.id || !role?.name) {
      return json(res, 400, { error: '缺少原始文档或目标角色信息' });
    }

    const relatedContext = relatedDocuments.length
      ? relatedDocuments.map((doc) => `- ${doc.title}${doc.content ? `：${doc.content}` : ''}`).join('\n')
      : '无';
    const prompt = `你是企业产品研发协作助手。请只依据提供的资料，为「${role.name}」生成一份可执行的中文工作视图。\n\n原始文档标题：${sourceDocument.title}\n原始文档：\n${sourceDocument.content}\n\n关联资料：\n${relatedContext}\n\n请使用 Markdown，并严格按以下标题组织：\n# 角色工作视图\n## 核心目标\n## 需要关注的内容\n## 行动清单\n## 风险与待确认事项\n## 原文依据\n\n不要编造资料中不存在的事实；不确定时明确标注“待确认”。每项原文依据请简短引用或概括对应原文。`;

    const kimiResponse = await fetch(process.env.KIMI_API_URL || KIMI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${required(process.env.KIMI_API_KEY, 'KIMI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.KIMI_MODEL || 'kimi-k2.5',
        temperature: 0.3,
        messages: [
          { role: 'system', content: '你是严谨的企业文档协作助手。' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!kimiResponse.ok) throw new Error(`Kimi 调用失败：${await kimiResponse.text()}`);
    const kimiData = await kimiResponse.json();
    const content = kimiData.choices?.[0]?.message?.content;
    if (!content) throw new Error('Kimi 没有返回可用内容');

    const saved = await saveDerivation({
      source_document_id: sourceDocument.id,
      source_document_title: sourceDocument.title,
      role_id: role.id,
      role_name: role.name,
      related_document_ids: relatedDocuments.map((doc) => doc.id),
      content,
      model: process.env.KIMI_MODEL || 'kimi-k2.5',
    });
    return json(res, 200, { derivation: saved });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error instanceof Error ? error.message : '生成失败，请稍后重试' });
  }
}
