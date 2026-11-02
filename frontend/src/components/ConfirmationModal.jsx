import { useEffect, useRef } from "react";
import "./ConfirmationModal.css";

export default function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = false,
  icon,
  isLoading = false,
  onConfirm,
  onCancel,
}) {
  const cardRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="confirm-modal-backdrop"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        ref={cardRef}
        className={`confirm-modal-card ${isDestructive ? "destructive" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-modal-header">
          <div className={`confirm-modal-icon-badge ${isDestructive ? "danger" : "info"}`}>
            {icon || (isDestructive ? "⚠️" : "❓")}
          </div>
          <div className="confirm-modal-title-wrap">
            <h3 id="confirm-modal-title" className="confirm-modal-title">
              {title}
            </h3>
            {message && <p className="confirm-modal-message">{message}</p>}
          </div>
          <button
            type="button"
            className="confirm-modal-close-btn"
            onClick={onCancel}
            aria-label="Close dialog"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="confirm-modal-actions">
          <button
            type="button"
            className="confirm-modal-btn cancel-btn"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`confirm-modal-btn ${isDestructive ? "danger-btn" : "primary-btn"}`}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
