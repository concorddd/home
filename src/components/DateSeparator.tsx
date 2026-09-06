import { useMemo } from "react";

type Props = {
  date: string | Date;
};

function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function DateSeparator({ date }: Props) {
  const label = useMemo(() => formatDate(date), [date]);

  return (
    <div className="my-4 flex items-center justify-center px-4" role="separator" aria-label={label}>
      <div className="h-px flex-grow bg-[#424549]" />
      <span className="mx-2 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
        {label}
      </span>
      <div className="h-px flex-grow bg-[#424549]" />
    </div>
  );
}
