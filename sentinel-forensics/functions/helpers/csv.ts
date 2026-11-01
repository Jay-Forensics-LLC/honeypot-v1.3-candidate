export function encodeCsvRow(values: unknown[]): string {
  return values.map(value => {
    const field = String(value ?? '');
    return /[",\r\n]/.test(field)
      ? `"${field.replace(/"/g, '""')}"`
      : field;
  }).join(',');
}
