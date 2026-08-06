/**
 * Records the author's confirmation that a changed source should prepare
 * updates for selected role views. This endpoint deliberately does not call
 * AI, change a role view, or notify a role recipient yet.
 */
function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body));
}

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !key) throw new Error('缺少 Supabase 服务器环境变量');
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

export default async function handler(req, res) {
  try {
    const url = process.env.SUPABASE_URL;
    const headers = supabaseHeaders();

    if (req.method === 'GET') {
      const sourceDocumentId = req.query.sourceDocumentId;
      if (!sourceDocumentId) return json(res, 400, { error: '缺少 sourceDocumentId' });
      const response = await fetch(`${url}/rest/v1/document_derivation_updates?source_document_id=eq.${encodeURIComponent(sourceDocumentId)}&select=role_id,target_source_content_hash,status,updated_at`, { headers });
      if (!response.ok) throw new Error(`读取更新状态失败：${await response.text()}`);
      return json(res, 200, { updates: await response.json() });
    }

    if (req.method !== 'POST') return json(res, 405, { error: '只支持 GET 或 POST 请求' });
    const { sourceDocumentId, updates } = req.body || {};
    if (!sourceDocumentId || !Array.isArray(updates) || updates.length === 0) {
      return json(res, 400, { error: '缺少待更新的衍生文档信息' });
    }
    const records = updates.map(update => ({
      source_document_id: sourceDocumentId,
      role_id: update.roleId,
      base_source_content_hash: update.baseSourceContentHash || null,
      target_source_content_hash: update.targetSourceContentHash,
      status: 'pending',
    }));
    if (records.some(record => !record.role_id || !record.target_source_content_hash)) {
      return json(res, 400, { error: '待更新信息不完整' });
    }
    const response = await fetch(`${url}/rest/v1/document_derivation_updates?on_conflict=source_document_id,role_id,target_source_content_hash`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(records),
    });
    if (!response.ok) throw new Error(`保存更新状态失败：${await response.text()}`);
    return json(res, 200, { updates: await response.json() });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : '保存更新状态失败' });
  }
}
