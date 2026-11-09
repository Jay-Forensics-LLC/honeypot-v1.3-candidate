export async function findApiKeyInOrganization(base44, apiKeyId, organizationId) {
  if (!apiKeyId || !organizationId) return null;

  const keys = await base44.asServiceRole.entities.ApiKey.filter({
    id: apiKeyId,
    organization_id: organizationId
  });
  return keys[0] || null;
}

export function getApiKeyToggleStatus(apiKey, enable) {
  if (
    typeof enable !== 'boolean'
    || !apiKey
    || !['active', 'disabled'].includes(apiKey.status)
  ) {
    return null;
  }

  return enable ? 'active' : 'disabled';
}
