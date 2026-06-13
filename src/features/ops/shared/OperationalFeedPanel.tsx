type OperationalFeedPanelProps = {
  title: string;
  items: Array<{ id: string; at: string; kind: string; summary: string }>;
  emptyLabel: string;
};

export function OperationalFeedPanel({ title, items, emptyLabel }: OperationalFeedPanelProps) {
  return (
    <section className="rounded-xl border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2 max-h-80 overflow-y-auto">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-medium text-foreground">{item.kind}</span>
                <span className="text-muted-foreground">{new Date(item.at).toLocaleString()}</span>
              </div>
              <p className="text-muted-foreground">{item.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
