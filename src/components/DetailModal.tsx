import { openUrl } from "@tauri-apps/plugin-opener";
import type { IssueSolution } from "../lib/issueSolutions";

interface DetailModalProps {
  title: string;
  fields: Array<{ label: string; value: string | number | boolean | null | undefined; isError?: boolean }>;
  issues?: IssueSolution[];
  onClose: () => void;
}

export function DetailModal({ title, fields, issues, onClose }: DetailModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 title={title}>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          {issues && issues.length > 0 && (
            <div className="modal-recommendations">
              <div className="modal-recommendations-title">
                Recommendations ({issues.length})
              </div>
              {issues.map((issue) => (
                <div key={issue.title} className="recommendation">
                  <div className="recommendation-title">{issue.title}</div>
                  <div className="recommendation-problem">{issue.problem}</div>
                  <div className="recommendation-fix">{issue.fix}</div>
                  <button
                    type="button"
                    className="recommendation-source"
                    onClick={() => openUrl(issue.source.url)}
                  >
                    {issue.source.label} ↗
                  </button>
                </div>
              ))}
            </div>
          )}
          {fields.map((f) => {
            const isEmpty = f.value === null || f.value === undefined || f.value === "";
            return (
              <div key={f.label} className={`modal-field${f.isError && !isEmpty ? " modal-field-error" : ""}`}>
                <div className="modal-field-label">{f.label}</div>
                <div className="modal-field-value">{isEmpty ? "—" : String(f.value)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
