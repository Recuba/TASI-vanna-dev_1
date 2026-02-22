import { LoadingSpinner } from '@/components/common/loading-spinner';

export default function ScreenerLoading() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <LoadingSpinner message="Loading screener..." />
    </div>
  );
}
