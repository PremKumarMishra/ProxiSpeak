import "./Toast.css";

export default function Toast({ toasts = [], onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="proxispeak-toast-container" aria-live="polite">
      {toasts.map((toast) => {
        const type = toast.type || "info";
        const icon =
          type === "success" ? "✓" : type === "error" ? "✕" : "ℹ";

        return (
          <div
            key={toast.id}
            className={`proxispeak-toast proxispeak-toast-${type}`}
            role="status"
          >
            <div className="proxispeak-toast-icon-wrap">
              <span className="proxispeak-toast-icon">{icon}</span>
            </div>
            <div className="proxispeak-toast-body">
              {toast.title && (
                <strong className="proxispeak-toast-title">{toast.title}</strong>
              )}
              <p className="proxispeak-toast-msg">{toast.message}</p>
            </div>
            {onDismiss && (
              <button
                type="button"
                className="proxispeak-toast-close"
                onClick={() => onDismiss(toast.id)}
                aria-label="Dismiss notification"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
