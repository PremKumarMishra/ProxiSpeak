import React from "react";

/**
 * SaveStatusIndicator
 * Displays a professional save-status indicator for the Virtual Office Builder.
 *
 * States:
 * - "unsaved": Shows "Unsaved changes" with a pulsing indicator dot.
 * - "saving":  Shows "Saving..." with an animated blue-purple spinner.
 * - "saved":   Shows "Saved" with a clean checkmark icon.
 *
 * Adheres to ProxiSpeak's blue-purple theme and dark toolbar aesthetic.
 */
export default function SaveStatusIndicator({
  status = "saved",
  lastSavedAt = null,
  onManualSave = null,
  disabled = false,
  compact = false,
  className = "",
}) {
  const isUnsaved = status === "unsaved";
  const isSaving = status === "saving";
  const isError = status === "error";
  const isSaved = status === "saved" || (!isUnsaved && !isSaving && !isError);

  const formatTime = (date) => {
    if (!date) return "";
    try {
      return new Date(date).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const getTooltip = () => {
    if (isSaving) return "Saving office layout to database...";
    if (isError) {
      return "Save failed. Click here or press Ctrl+S to retry.";
    }
    if (isUnsaved) {
      return "You have unsaved changes. Click here or press Ctrl+S to save.";
    }
    const timeStr = formatTime(lastSavedAt);
    return timeStr
      ? `All changes saved to database (last saved at ${timeStr})`
      : "All changes saved to database";
  };

  const handleClick = () => {
    if ((isUnsaved || isError) && onManualSave && !disabled) {
      onManualSave();
    }
  };

  return (
    <div
      className={`vo-save-status-indicator vo-save-status-${status} ${
        compact ? "compact" : ""
      } ${(isUnsaved || isError) && onManualSave ? "clickable" : ""} ${className}`.trim()}
      role="status"
      aria-live="polite"
      title={getTooltip()}
      onClick={handleClick}
    >
      {isSaving && (
        <>
          <span className="vo-save-spinner" aria-hidden="true" />
          <span className="vo-save-text">Saving...</span>
        </>
      )}

      {isError && (
        <>
          <span className="vo-save-dot error" aria-hidden="true" />
          <span className="vo-save-text">Save failed (Retry)</span>
        </>
      )}

      {isUnsaved && (
        <>
          <span className="vo-save-dot unsaved" aria-hidden="true" />
          <span className="vo-save-text">Unsaved changes</span>
        </>
      )}

      {isSaved && (
        <>
          <span className="vo-save-icon-check" aria-hidden="true">
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M13.5 4.5L6.5 11.5L3 8"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="vo-save-text">Saved</span>
        </>
      )}
    </div>
  );
}
