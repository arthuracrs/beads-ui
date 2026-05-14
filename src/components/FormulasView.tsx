import { useState, useEffect } from "react";
import { api } from "../api";
import type { Formula } from "../types";

export function FormulasView() {
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Formula | null>(null);
  const [detail, setDetail] = useState<Formula | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.formulas
      .list()
      .then(setFormulas)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSelect(formula: Formula) {
    setSelected(formula);
    setDetail(null);
    setDetailLoading(true);
    try {
      const d = await api.formulas.get(formula.name);
      setDetail(d);
    } catch {
      setDetail(formula);
    } finally {
      setDetailLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[var(--text-muted)] text-sm">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-5 rounded-lg border border-[var(--red)]/30 bg-[var(--red)]/10 p-4 text-sm text-[var(--red)]">
        {error}
      </div>
    );
  }

  if (formulas.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--text-muted)] px-8 text-center">
        <span className="text-3xl">⬡</span>
        <span className="text-sm font-medium text-[var(--text)]">No formulas found</span>
        <p className="text-xs max-w-sm leading-relaxed">
          Formulas are YAML workflow templates stored in{" "}
          <code className="bg-[var(--surface2)] px-1 py-0.5 rounded font-mono">.beads/formulas/</code>
          {" "}or{" "}
          <code className="bg-[var(--surface2)] px-1 py-0.5 rounded font-mono">~/.beads/formulas/</code>.
          Create a <code className="bg-[var(--surface2)] px-1 py-0.5 rounded font-mono">.yaml</code> file
          there, then run{" "}
          <code className="bg-[var(--surface2)] px-1 py-0.5 rounded font-mono">bd mol pour &lt;name&gt;</code>
          {" "}to start a workflow.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* List */}
      <div className="w-72 shrink-0 border-r border-[var(--border)] overflow-y-auto py-3 px-2">
        <div className="mb-2 px-3 text-xs text-[var(--text-muted)]">
          {formulas.length} formula{formulas.length !== 1 ? "s" : ""}
        </div>
        <div className="space-y-0.5">
          {formulas.map((f) => (
            <button
              key={f.name}
              onClick={() => handleSelect(f)}
              className={`w-full text-left rounded-md px-3 py-2.5 transition-colors ${
                selected?.name === f.name
                  ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "text-[var(--text)] hover:bg-[var(--surface2)]"
              }`}
            >
              <div className="text-sm font-medium">{f.name}</div>
              {f.description && (
                <div className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{f.description}</div>
              )}
              {f.source && (
                <div className="text-[10px] text-[var(--text-muted)] mt-1 opacity-60">{f.source}</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selected && (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
            Select a formula to view details
          </div>
        )}

        {selected && detailLoading && (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
            Loading…
          </div>
        )}

        {selected && !detailLoading && detail && (
          <FormulaDetail formula={detail} />
        )}
      </div>
    </div>
  );
}

function FormulaDetail({ formula }: { formula: Formula }) {
  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-base font-semibold text-[var(--text)]">{formula.name}</h2>
        {formula.type && (
          <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-[var(--surface2)] text-[var(--text-muted)]">
            {formula.type}
          </span>
        )}
        {formula.description && (
          <p className="mt-2 text-sm text-[var(--text-muted)]">{formula.description}</p>
        )}
      </div>

      {formula.source && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">Source</div>
          <code className="text-xs text-[var(--text-muted)] bg-[var(--surface2)] px-2 py-1 rounded">{formula.source}</code>
        </div>
      )}

      {formula.variables && Object.keys(formula.variables).length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Variables</div>
          <div className="space-y-1.5">
            {Object.entries(formula.variables).map(([key, val]) => (
              <div key={key} className="flex items-start gap-3 text-sm">
                <code className="text-[var(--accent)] font-mono text-xs shrink-0">{key}</code>
                <span className="text-[var(--text-muted)] text-xs">{JSON.stringify(val)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {Array.isArray(formula.steps) && formula.steps.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Steps</div>
          <div className="space-y-2">
            {formula.steps.map((step, i) => (
              <StepCard key={i} index={i} step={step as Record<string, unknown>} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StepCard({ index, step }: { index: number; step: Record<string, unknown> }) {
  const title = (step.title ?? step.name ?? step.id ?? `Step ${index + 1}`) as string;
  const description = step.description as string | undefined;
  const type = step.type as string | undefined;

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-muted)] w-5 shrink-0">{index + 1}.</span>
        <span className="text-sm font-medium text-[var(--text)]">{title}</span>
        {type && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface2)] text-[var(--text-muted)]">
            {type}
          </span>
        )}
      </div>
      {description && (
        <p className="mt-1.5 ml-7 text-xs text-[var(--text-muted)]">{description}</p>
      )}
    </div>
  );
}
