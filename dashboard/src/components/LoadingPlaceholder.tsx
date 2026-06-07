export default function LoadingPlaceholder() {
  const SkeletonBar = ({ width = 'w-3/4' }: { width?: string }) => (
    <div className={`${width} h-3 bg-gray-200 rounded-full animate-pulse`} />
  );

  const SkeletonCard = ({ emoji }: { emoji: string }) => (
    <div className="bg-white rounded-lg border border-gray-200 p-6 bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          <SkeletonBar width="w-1/2" />
          <SkeletonBar width="w-2/3" />
          <SkeletonBar width="w-1/3" />
        </div>
        <div className="text-3xl opacity-30">{emoji}</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="h-10 bg-gray-200 rounded-lg w-96 animate-pulse mb-2" />
          <div className="h-5 bg-gray-100 rounded w-80 animate-pulse" />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-l-4 border-l-blue-500 border-gray-200 p-6">
        <div className="space-y-3">
          <SkeletonBar width="w-1/4" />
          <SkeletonBar width="w-1/3" />
          <div className="pt-2">
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div className="h-3 rounded-full bg-gray-200 animate-pulse w-1/3" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SkeletonCard emoji="💰" />
        <SkeletonCard emoji="⚡" />
        <SkeletonCard emoji="📊" />
        <SkeletonCard emoji="🔗" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost Timeline</h3>
          <div className="mt-4 h-64 bg-gradient-to-br from-gray-100 to-gray-50 rounded-lg animate-pulse" />
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Models by Cost</h3>
          <div className="mt-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <SkeletonBar width="w-1/3" />
                <SkeletonBar width="w-1/4" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Model Performance</h3>
          <div className="mt-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 bg-gray-50 rounded-lg space-y-2">
                <SkeletonBar width="w-1/2" />
                <SkeletonBar width="w-2/3" />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Token Efficiency</h3>
          <div className="mt-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 bg-gray-50 rounded-lg space-y-2">
                <SkeletonBar width="w-1/2" />
                <SkeletonBar width="w-2/3" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost Breakdown</h3>
          <div className="mt-4 h-48 bg-gradient-to-br from-gray-100 to-gray-50 rounded-lg animate-pulse" />
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Rate Limit Status</h3>
          <div className="mt-4 space-y-4">
            <SkeletonBar width="w-1/2" />
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className="h-2 rounded-full bg-gray-200 animate-pulse w-1/2" />
            </div>
            <SkeletonBar width="w-3/4" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Rate Limit Timeline</h3>
          <div className="mt-4 h-48 bg-gradient-to-br from-gray-100 to-gray-50 rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  );
}
