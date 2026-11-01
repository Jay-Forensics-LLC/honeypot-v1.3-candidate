export class ResponseTooLargeError extends Error {}

export async function readBoundedResponse(response, maxBytes) {
  const contentLength = response.headers.get('content-length');
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    await response.body?.cancel();
    throw new ResponseTooLargeError('Response exceeds the allowed size');
  }

  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (totalBytes + value.byteLength > maxBytes) {
        await reader.cancel();
        throw new ResponseTooLargeError('Response exceeds the allowed size');
      }
      chunks.push(value);
      totalBytes += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function fetchBoundedResponse(url, { maxBytes, timeoutMs, fetchImpl = fetch }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) {
      await response.body?.cancel();
      return { response, bytes: null };
    }
    return { response, bytes: await readBoundedResponse(response, maxBytes) };
  } finally {
    clearTimeout(timeout);
  }
}
