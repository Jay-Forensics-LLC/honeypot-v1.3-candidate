export function getOrganizationApiKeyFilter(
  user: { organization_id?: string } | null,
  apiKeyId: string
): { id: string; organization_id: string } | null {
  if (!user?.organization_id) {
    return null;
  }
  return { id: apiKeyId, organization_id: user.organization_id };
}

export function getToggleApiKeyStatus(currentStatus: string, enable: boolean): 'active' | 'disabled' | null {
  if (currentStatus !== 'active' && currentStatus !== 'disabled') {
    return null;
  }
  return enable ? 'active' : 'disabled';
}
