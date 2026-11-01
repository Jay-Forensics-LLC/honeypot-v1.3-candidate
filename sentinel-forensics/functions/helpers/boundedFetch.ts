import { readBoundedResponse } from './readBoundedResponse.ts';

export async function fetchBoundedResponse(url, { maxBytes, timeoutMs, fetchImpl = fetch }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: 'error'
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { response, bytes: null };
    }
    return { response, bytes: await readBoundedResponse(response, maxBytes) };
  } finally {
    clearTimeout(timeout);
  }
}
