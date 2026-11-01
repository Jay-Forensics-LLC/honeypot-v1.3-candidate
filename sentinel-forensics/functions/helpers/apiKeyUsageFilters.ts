export function parseApiKeyUsageFilters(
  searchParams: URLSearchParams,
  body: Record<string, unknown>
): {
  apiKeyId?: string;
  statusCode?: number;
  rateLimitAction?: string;
  limit: number;
} | null {
  const apiKeyId = body.apiKeyId ?? searchParams.get('apiKeyId');
  const statusCode = body.statusCode ?? searchParams.get('statusCode');
  const rateLimitAction = body.rateLimitAction ?? searchParams.get('rateLimitAction');

  if ((apiKeyId !== null && apiKeyId !== undefined && typeof apiKeyId !== 'string')
    || (rateLimitAction !== null && rateLimitAction !== undefined && typeof rateLimitAction !== 'string')) {
    return null;
  }

  const parsedStatusCode = statusCode === null || statusCode === undefined || statusCode === ''
    ? undefined
    : Number.parseInt(String(statusCode), 10);
  if (parsedStatusCode !== undefined && !Number.isFinite(parsedStatusCode)) {
    return null;
  }

  return {
    ...(apiKeyId ? { apiKeyId } : {}),
    ...(parsedStatusCode !== undefined ? { statusCode: parsedStatusCode } : {}),
    ...(rateLimitAction ? { rateLimitAction } : {}),
    limit: Number.parseInt(String(body.limit ?? searchParams.get('limit') ?? '100'), 10)
  };
}
