/** Return the latest saved role views for one source document. */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: '只支持 GET 请求' });
    return;
  }
  const sourceDocumentId = req.query.sourceDocumentId;
  if (!sourceDocumentId) {
    res.status(400).json({ error: '缺少 sourceDocumentId' });
    return;
  }
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('缺少 Supabase 服务器环境变量');
    const headers = { apikey: key };
    // `sb_secret_...` keys are sent as apikey only; legacy service_role
    // JWTs additionally use the Authorization header.
    if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
    const response = await fetch(`${url}/rest/v1/document_derivations?source_document_id=eq.${encodeURIComponent(sourceDocumentId)}&select=role_id,content,related_document_ids,source_content_hash,visual_overview,updated_at`, {
      headers,
    });
    if (!response.ok) throw new Error(`读取 Supabase 失败：${await response.text()}`);
    res.status(200).json({ derivations: await response.json() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : '读取失败' });
  }
}
