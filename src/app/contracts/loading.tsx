/**
 * Loading skeleton for /contracts list page.
 */
export default function ContractsLoading() {
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

        {/* Filter bar */}
        <div className="bg-white border-b border-gray-100 px-4 sm:px-8 py-3 flex gap-2 shrink-0">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-8 w-20 bg-gray-100 rounded-full animate-pulse" />
          ))}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="flex gap-4 px-6 py-3 bg-gray-50 border-b border-gray-200">
              {[40, 28, 20, 12].map((w, i) => (
                <div
                  key={i}
                  className="h-3 bg-gray-200 rounded animate-pulse"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
            {/* Rows */}
            {[...Array(7)].map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-6 py-4 border-b border-gray-50 last:border-0"
              >
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-1/3" />
                </div>
                <div className="h-4 bg-gray-100 rounded animate-pulse w-20" />
                <div className="h-6 w-24 bg-gray-100 rounded-full animate-pulse" />
                <div className="h-8 w-8 bg-gray-100 rounded-lg animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
