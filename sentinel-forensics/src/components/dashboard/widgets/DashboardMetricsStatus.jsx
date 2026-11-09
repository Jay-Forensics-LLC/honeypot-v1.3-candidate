export default function DashboardMetricsStatus({ isError, hasData }) {
  if (!isError) return null;

  return (
    <div role="status" aria-live="polite" className="mb-3 rounded bg-amber-50 p-2 text-xs text-amber-800">
      {hasData
        ? 'Showing cached dashboard data; the latest refresh failed.'
        : 'Dashboard metrics are unavailable.'}
    </div>
  );
}
