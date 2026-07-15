export type View = "all" | "ready" | "sessions" | "formulas" | "graph";

interface Props {
  view: View;
  onView: (v: View) => void;
}

const navItems: { label: string; view: View; icon: string }[] = [
  { label: "All Issues",   view: "all",         icon: "⊞" },
  { label: "Ready",        view: "ready",        icon: "→" },
  { label: "Graph",        view: "graph",        icon: "◇" },
  { label: "Sessions",     view: "sessions",     icon: "▣" },
  { label: "Formulas",     view: "formulas",     icon: "⬡" },
];

export function Sidebar({ view, onView }: Props) {
  return (
    <nav className="flex h-full w-52 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] px-2 py-4">
      <div className="mb-4 px-3">
        <div className="flex items-center gap-2">
          <span className="text-base">◎</span>
          <span className="text-sm font-semibold text-[var(--text)]">Beads</span>
        </div>
      </div>

      <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Views</div>
      <div className="space-y-0.5">
        {navItems.map((item) => (
          <button
            key={item.view}
            onClick={() => onView(item.view)}
            className={`flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
              view === item.view
                ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                : "text-[var(--text-muted)] hover:bg-[var(--surface2)] hover:text-[var(--text)]"
            }`}
          >
            <span className="text-xs w-4 text-center">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
