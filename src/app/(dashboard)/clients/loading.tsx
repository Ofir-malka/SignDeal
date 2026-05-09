/**
 * Loading skeleton for /clients page.
 */
export default function ClientsLoading() {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden" dir="rtl">
      {/* Sidebar placeholder */}
      <div className="hidden lg:flex w-64 bg-white border-l border-gray-200 shrink-0 flex-col p-4 gap-3">
        <div className="h-9 bg-gray-100 rounded-lg animate-pulse mb-4" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 h-14 flex items-center gap-3">
          <div className="w-7 h-7 bg-gray-200 rounded-lg animate-pulse" />
          <div className="w-24 h-4 bg-gray-200 rounded animate-pulse" />
        </div>

        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 flex items-center justify-between shrink-0">
          <div className="space-y-2">
            <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
          </div>
          <div className="h-10 w-32 bg-indigo-100 rounded-lg animate-pulse" />
        </div>

        {/* Search bar */}
        <div className="bg-white border-b border-gray-100 px-4 sm:px-8 py-3 shrink-0">
          <div className="h-9 w-full max-w-xs bg-gray-100 rounded-lg animate-pulse" />
        </div>

        {/* Client cards / rows */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-6 py-4 border-b border-gray-50 last:border-0"
              >
                {/* Avatar */}
                <div className="w-9 h-9 bg-indigo-100 rounded-full animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 bg-gray-200 rounded animate-pulse w-1/3" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-1/4" />
                </div>
                <div className="h-4 bg-gray-100 rounded animate-pulse w-24 hidden sm:block" />
                <div className="h-8 w-8 bg-gray-100 rounded-lg animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
