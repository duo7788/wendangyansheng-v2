function required(value, name) {
  if (!value) throw new Error(`缺少服务器环境变量：${name}`);
  return value;
}

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body));
}

function supabaseHeaders() {
  const key = required(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY');
  const headers = { apikey: key, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

export default async function handler(req, res) {
  try {
    const url = required(process.env.SUPABASE_URL, 'SUPABASE_URL');
    if (req.method === 'GET') {
      const response = await fetch(`${url}/rest/v1/document_challenge_tasks?select=id,source_document_id,role_name,content,status,created_at&order=created_at.desc`, { headers: supabaseHeaders() });
      if (!response.ok) throw new Error(`读取质疑任务失败：${await response.text()}`);
      return json(res, 200, { tasks: await response.json() });
    }
    if (req.method === 'PATCH') {
      const { taskId, status } = req.body || {};
      if (!taskId || !['open', 'resolved'].includes(status)) return json(res, 400, { error: '任务状态不正确' });
      const response = await fetch(`${url}/rest/v1/document_challenge_tasks?id=eq.${encodeURIComponent(taskId)}`, {
        method: 'PATCH', headers: supabaseHeaders(), body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error(`更新质疑任务失败：${await response.text()}`);
      return json(res, 200, { success: true });
    }
    if (req.method !== 'POST') return json(res, 405, { error: '只支持 GET、POST 或 PATCH 请求' });
    const { challengeRunId, sourceDocumentId, challengeIndex, roleId, roleName, content } = req.body || {};
    if (!challengeRunId || !sourceDocumentId || !Number.isInteger(challengeIndex) || challengeIndex < 0 || !roleId || !roleName || !content?.trim()) {
      return json(res, 400, { error: '待保存的质疑任务信息不完整' });
    }
    const response = await fetch(`${url}/rest/v1/document_challenge_tasks?on_conflict=challenge_run_id,challenge_index`, {
      method: 'POST', headers: supabaseHeaders(),
      body: JSON.stringify({ challenge_run_id: challengeRunId, source_document_id: sourceDocumentId, challenge_index: challengeIndex, role_id: roleId, role_name: roleName, content: content.trim(), status: 'open' }),
    });
    if (!response.ok) throw new Error(`保存质疑任务失败：${await response.text()}`);
    const [task] = await response.json();
    return json(res, 200, { task });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : '保存质疑任务失败' });
  }
}
