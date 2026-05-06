interface StatsCardProps {
  title: string;
  value: string;
  subtitle: string;
  trend?: "up" | "down" | "neutral";
  icon: React.ReactNode;
  accentColor: "indigo" | "amber" | "orange" | "emerald";
  featured?: boolean;
}

const colorMap = {
  indigo: {
    bg: "bg-indigo-50",
    icon: "text-indigo-600",
    badge: "bg-indigo-100 text-indigo-700",
  },
  amber: {
    bg: "bg-amber-50",
    icon: "text-amber-600",
    badge: "bg-amber-100 text-amber-700",
  },
  orange: {
    bg: "bg-orange-50",
    icon: "text-orange-600",
    badge: "bg-orange-100 text-orange-700",
  },
  emerald: {
    bg: "bg-emerald-50",
    icon: "text-emerald-600",
    badge: "bg-emerald-100 text-emerald-700",
  },
};

export function StatsCard({ title, value, subtitle, trend = "neutral", icon, accentColor, featured }: StatsCardProps) {
  const colors = colorMap[accentColor];

  return (
    <div className={`bg-white rounded-xl border p-5 transition-shadow hover:shadow-md ${featured ? "border-orange-300 shadow-md ring-1 ring-orange-100" : "border-gray-200 shadow-sm"}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
          <p className={`font-bold text-gray-900 tracking-tight ${featured ? "text-3xl" : "text-2xl"}`}>{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg ${colors.bg} flex items-center justify-center shrink-0`}>
          <span className={colors.icon}>{icon}</span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        {trend === "up" && (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </span>
        )}
        {trend === "down" && (
          <span className="flex items-center gap-1 text-xs font-medium text-red-500">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        )}
        <span className="text-xs text-gray-500">{subtitle}</span>
      </div>
    </div>
  );
}
