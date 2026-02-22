import { LoadingSpinner } from '@/components/common/loading-spinner';

export default function AlertsLoading() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <LoadingSpinner message="Loading alerts..." />
    </div>
  );
}
