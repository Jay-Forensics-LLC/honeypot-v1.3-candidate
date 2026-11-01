export type GuardianTokenInput = {
  token: string;
  case_id: string;
};

export function parseGuardianTokenInput(value: unknown): GuardianTokenInput | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const { token, case_id } = value as Record<string, unknown>;
  if (typeof token !== 'string' || token.trim().length === 0
    || typeof case_id !== 'string' || case_id.trim().length === 0) {
    return null;
  }

  return { token, case_id };
}

export async function findGuardianTokens<T extends object>(
  value: unknown,
  entity: {
    filter: (filter: { token_hash: string; case_id: string; revoked: false }) => Promise<T[]>;
  }
): Promise<{ input: GuardianTokenInput; tokens: T[] } | null> {
  const input = parseGuardianTokenInput(value);
  if (!input) {
    return null;
  }

  const tokens = await entity.filter({
    token_hash: input.token,
    case_id: input.case_id,
    revoked: false
  });
  return { input, tokens };
}
