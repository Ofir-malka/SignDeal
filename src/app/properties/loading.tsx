/**
 * Loading skeleton for /properties page.
 */
export default function PropertiesLoading() {
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
            <div className="h-6 w-20 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-36 bg-gray-100 rounded animate-pulse" />
          </div>
          <div className="h-10 w-28 bg-indigo-100 rounded-lg animate-pulse" />
        </div>

        {/* Property cards */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <div className="h-5 bg-gray-200 rounded animate-pulse w-3/4" />
                    <div className="h-4 bg-gray-100 rounded animate-pulse w-1/2" />
                  </div>
                  <div className="h-6 w-16 bg-gray-100 rounded-full animate-pulse shrink-0" />
                </div>
                <div className="flex gap-3">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="h-4 w-12 bg-gray-100 rounded animate-pulse" />
                  ))}
                </div>
                <div className="h-px bg-gray-100" />
                <div className="flex justify-between items-center">
                  <div className="h-5 w-24 bg-gray-200 rounded animate-pulse" />
                  <div className="h-8 w-8 bg-gray-100 rounded-lg animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
