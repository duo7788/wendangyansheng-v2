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

async function saveChallengeRun(record) {
  const url = required(process.env.SUPABASE_URL, 'SUPABASE_URL');
  const response = await fetch(`${url}/rest/v1/document_challenge_runs`, {
    method: 'POST', headers: supabaseHeaders(), body: JSON.stringify(record),
  });
  if (!response.ok) throw new Error(`保存模拟质疑失败：${await response.text()}`);
  const [run] = await response.json();
  return run;
}

function parseModelJson(content) {
  const candidate = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(candidate);
  if (!Array.isArray(parsed.challenges)) throw new Error('AI 返回的模拟质疑格式不正确');
  return parsed.challenges;
}

function validateChallenges(challenges, roles, sentencesPerRole) {
  const roleById = new Map(roles.map(role => [role.id, role]));
  const counts = new Map();
  const valid = [];
  for (const item of challenges) {
    const role = roleById.get(item?.role_id);
    const rawContent = typeof item?.content === 'string' ? item.content.trim() : '';
    const content = rawContent.endsWith('?') ? `${rawContent.slice(0, -1)}？` : rawContent;
    const count = counts.get(item?.role_id) || 0;
    if (!role || content.length < 12 || content.length > 80 || !content.endsWith('？') || count >= sentencesPerRole) continue;
    counts.set(role.id, count + 1);
    valid.push({ role, content });
  }
  // Keep the conversation's existing round-robin presentation: each selected
  // role speaks once before any role speaks for a second time.
  const challengesByRole = new Map(roles.map(role => [role.id, valid.filter(item => item.role.id === role.id)]));
  return Array.from({ length: sentencesPerRole }, (_, round) => roles.flatMap(role => {
    const challenge = challengesByRole.get(role.id)?.[round];
    return challenge ? [challenge] : [];
  })).flat();
}

const ROLE_LENSES = {
  backend: '后端工程师：重点追问数据口径、接口契约、权限、异常、幂等、兼容与回滚。',
  frontend: '前端工程师：重点追问用户操作流程、页面状态、反馈、输入校验、加载失败与跨端表现。',
  qa: '测试工程师：重点追问可验收条件、边界场景、异常路径、权限差异、测试数据与发布验证。',
  ui: 'UI 设计师：重点追问用户路径、信息层级、空/错/加载状态、交互反馈、文案与无障碍。',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: '只支持 POST 请求' });
  try {
    const { sourceDocument, relatedDocuments = [], roles, sentencesPerRole = 2 } = req.body || {};
    if (!sourceDocument?.title || !sourceDocument?.content || !Array.isArray(roles) || roles.length === 0) {
      return json(res, 400, { error: '缺少原始文档或参与质疑的角色' });
    }
    if (!Number.isInteger(sentencesPerRole) || sentencesPerRole < 1 || sentencesPerRole > 2) {
      return json(res, 400, { error: '每个角色的质疑数量必须为 1 或 2' });
    }
    const selectedRoles = roles.filter(role => typeof role?.id === 'string' && typeof role?.name === 'string').slice(0, 6);
    if (!selectedRoles.length) return json(res, 400, { error: '参与质疑的角色格式不正确' });
    const relatedContext = relatedDocuments.length
      ? relatedDocuments.slice(0, 3).map(doc => `- ${doc.title}\n${doc.content || ''}`).join('\n\n')
      : '无';
    const prompt = `你是企业产品研发协作中的审阅伙伴。请根据资料，让每个指定角色从自己的专业视角提出能帮助作者补全文档的疑问。\n\n原始文档标题：${sourceDocument.title}\n原始文档：\n${sourceDocument.content}\n\n关联资料：\n${relatedContext}\n\n参与角色与关注点：\n${selectedRoles.map(role => `- ${role.id}：${role.name}。${ROLE_LENSES[role.id] || '从该角色的日常工作视角追问流程、边界和验收。'}`).join('\n')}\n\n只返回合法 JSON，不要使用 Markdown 或代码块：\n{"challenges":[{"role_id":"角色 id","content":"一句口语化、具体的追问"}]}\n\n规则：\n- 每个角色恰好 ${sentencesPerRole} 条，合计 ${selectedRoles.length * sentencesPerRole} 条。\n- 只提出资料尚未明确、但与该角色职责直接相关的问题；不要杜撰事实或给出答案。\n- 像同事在评审会上自然追问，使用具体的“如果……要怎么处理呢？”、“这个……由谁来确认呢？”一类句式。示例：前端角色可问“如果用户更改了手机号，要怎么处理呢？”。
- 问题必须落在资料中的功能、流程、交付物或缺口上；禁止空泛地问“验收标准是否明确”“风险是否考虑”。
- 每条限 18–60 个中文字符，以中文问号结尾，不要使用角色前缀、引号或编号。
- 角色交替输出：先每个角色各 1 条，再输出第二条。
- 若资料已经明确，请追问与该内容紧邻的异常路径、操作后的反馈、责任归属或边界条件。`;
    const model = process.env.KIMI_MODEL || 'kimi-k2.5';
    const supportsThinkingControl = /^kimi-k2\.(5|6)(?:-|$)/.test(model);
    const response = await fetch(process.env.KIMI_API_URL || KIMI_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${required(process.env.KIMI_API_KEY, 'KIMI_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: Number(process.env.KIMI_TEMPERATURE || 0.6),
        ...(supportsThinkingControl ? { thinking: { type: 'disabled' } } : {}),
        messages: [{ role: 'system', content: '你是严谨、克制的企业文档审阅助手。' }, { role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) throw new Error(`Kimi 调用失败：${await response.text()}`);
    const result = await response.json();
    const challenges = validateChallenges(parseModelJson(result.choices?.[0]?.message?.content || ''), selectedRoles, sentencesPerRole);
    if (challenges.length !== selectedRoles.length * sentencesPerRole) throw new Error('AI 未能生成完整的角色质疑，请重试');
    const run = await saveChallengeRun({
      source_document_id: sourceDocument.id || sourceDocument.title,
      source_document_title: sourceDocument.title,
      participant_roles: selectedRoles,
      challenges: challenges.map(item => ({ role_id: item.role.id, role_name: item.role.name, content: item.content })),
      model,
    });
    return json(res, 200, { challenges, model, run: { id: run.id, created_at: run.created_at } });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : '生成模拟质疑失败' });
  }
}
