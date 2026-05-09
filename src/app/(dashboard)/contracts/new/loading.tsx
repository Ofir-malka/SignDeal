/**
 * Loading skeleton for /contracts/new wizard page.
 */
export default function NewContractLoading() {
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
        <div className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 shrink-0">
          <div className="h-6 w-40 bg-gray-200 rounded animate-pulse mb-1.5" />
          <div className="h-4 w-56 bg-gray-100 rounded animate-pulse" />
        </div>

        {/* Step indicator */}
        <div className="bg-white border-b border-gray-100 px-4 sm:px-8 py-3 flex items-center gap-2 shrink-0">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-7 h-7 bg-gray-200 rounded-full animate-pulse" />
              {i < 3 && <div className="w-10 h-0.5 bg-gray-100 animate-pulse" />}
            </div>
          ))}
        </div>

        {/* Wizard content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
          <div className="max-w-2xl mx-auto space-y-5">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
              <div className="h-5 w-36 bg-gray-200 rounded animate-pulse" />

              {[...Array(4)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3.5 w-24 bg-gray-100 rounded animate-pulse" />
                  <div className="h-10 w-full bg-gray-100 rounded-lg animate-pulse" />
                </div>
              ))}

              <div className="flex justify-between pt-2">
                <div className="h-10 w-24 bg-gray-100 rounded-lg animate-pulse" />
                <div className="h-10 w-28 bg-indigo-100 rounded-lg animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
