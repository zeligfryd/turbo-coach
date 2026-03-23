interface MetricCardProps {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  subValue?: string | null;
}

export function MetricCard({ label, value, unit, subValue }: MetricCardProps) {
  const displayValue = value != null && value !== "" ? value : "—";

  return (
    <div className="rounded-lg bg-card px-3 py-2 shadow-sm">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
        {label}
      </div>
      <div className="text-lg font-bold leading-tight mt-0.5">
        {displayValue}
        {unit && value != null && (
          <span className="text-xs font-normal text-muted-foreground ml-0.5">{unit}</span>
        )}
      </div>
      {subValue && (
        <div className="text-[10px] text-muted-foreground mt-0.5">{subValue}</div>
      )}
    </div>
  );
}
