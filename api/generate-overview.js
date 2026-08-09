const KIMI_API_URL = 'https://api.moonshot.cn/v1/chat/completions';

function required(value, name) {
  if (!value) throw new Error(`缺少服务器环境变量：${name}`);
  return value;
}

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body));
}

function supabaseHeaders() {
  const key = required(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY');
  const headers = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function parseOverview(content) {
  const parsed = JSON.parse(content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim());
  const title = typeof parsed?.title === 'string' ? parsed.title.trim() : '';
  const branches = Array.isArray(parsed?.branches) ? parsed.branches.slice(0, 4).flatMap(branch => {
    const branchTitle = typeof branch?.title === 'string' ? branch.title.trim() : '';
    const items = Array.isArray(branch?.items) ? branch.items.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0, 4) : [];
    return branchTitle && items.length ? [{ title: branchTitle, items }] : [];
  }) : [];
  if (!title || title.length > 24 || branches.length < 2) throw new Error('AI 返回的项目速览格式不正确');
  return { title, branches };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: '只支持 POST 请求' });
  try {
    const { sourceDocument, relatedDocuments = [], role } = req.body || {};
    if (!sourceDocument?.id || !sourceDocument?.title || !sourceDocument?.content || !role?.id || !role?.name) {
      return json(res, 400, { error: '缺少项目速览所需的文档或角色信息' });
    }
    const materials = [sourceDocument, ...relatedDocuments].slice(0, 4)
      .filter(document => document?.title && document?.content)
      .map(document => `【${document.title}】\n${document.content}`).join('\n\n');
    const prompt = `你是企业项目文档的可视化整理助手。请只依据以下资料，为「${role.name}」生成一张项目速览思维导图的数据结构。\n\n资料：\n${materials}\n\n只返回合法 JSON，不要 Markdown、代码块、引用或解释：\n{"title":"项目主题","branches":[{"title":"分支名称","items":["短句节点"]}]}\n\n规则：\n- 只归纳资料已有的信息，不扩写、不推测；不确定的信息放入“待确认”分支。\n- 使用 2–4 个一级分支；每个分支 1–4 个短句节点，每个节点不超过 18 个中文字符。\n- 优先覆盖：核心目标、关键流程或范围、协作对象或交付物、风险与待确认。根据资料调整，不必机械使用全部分类。\n- 不要输出任何原文引用、编号、Markdown 标记或角色名称。`;
    const model = process.env.KIMI_MODEL || 'kimi-k2.5';
    const supportsThinkingControl = /^kimi-k2\.(5|6)(?:-|$)/.test(model);
    const response = await fetch(process.env.KIMI_API_URL || KIMI_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${required(process.env.KIMI_API_KEY, 'KIMI_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: Number(process.env.KIMI_TEMPERATURE || 0.6),
        ...(supportsThinkingControl ? { thinking: { type: 'disabled' } } : {}),
        messages: [{ role: 'system', content: '你擅长将企业项目资料准确压缩为清晰、克制的思维导图。' }, { role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) throw new Error(`Kimi 调用失败：${await response.text()}`);
    const result = await response.json();
    const overview = parseOverview(result.choices?.[0]?.message?.content || '');
    const url = required(process.env.SUPABASE_URL, 'SUPABASE_URL');
    const save = await fetch(`${url}/rest/v1/document_derivations?source_document_id=eq.${encodeURIComponent(sourceDocument.id)}&role_id=eq.${encodeURIComponent(role.id)}`, {
      method: 'PATCH', headers: supabaseHeaders(), body: JSON.stringify({ visual_overview: overview }),
    });
    if (!save.ok) throw new Error(`保存项目速览失败：${await save.text()}`);
    return json(res, 200, { overview });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : '生成项目速览失败' });
  }
}
