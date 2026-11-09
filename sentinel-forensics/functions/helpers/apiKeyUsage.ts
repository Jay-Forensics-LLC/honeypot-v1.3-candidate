export async function readApiKeyUsageFilters(req) {
  const url = new URL(req.url);
  const query = url.searchParams;
  const body = req.method === 'GET' ? {} : await req.json();
  const filters = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const value = (name) => filters[name] ?? query.get(name);

  return {
    apiKeyId: value('apiKeyId'),
    statusCode: value('statusCode'),
    rateLimitAction: value('rateLimitAction'),
    limit: value('limit') ?? '100'
  };
}
