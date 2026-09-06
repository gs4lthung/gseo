interface DetailModalProps {
  title: string;
  fields: Array<{ label: string; value: string | number | boolean | null | undefined; isError?: boolean }>;
  onClose: () => void;
}

export function DetailModal({ title, fields, onClose }: DetailModalProps) {
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
