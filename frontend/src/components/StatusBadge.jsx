import "./StatusBadge.css";

const STATUS_CONFIG = {
  Available: {
    label: "Available",
    color: "#10b981",
    bg: "#ecfdf5",
    desc: "Ready to collaborate",
  },
  Busy: {
    label: "Busy",
    color: "#f59e0b",
    bg: "#fffbeb",
    desc: "In focus mode",
  },
  Offline: {
    label: "Offline",
    color: "#94a3b8",
    bg: "#f1f5f9",
    desc: "Away from desk",
  },
};

export default function StatusBadge({ status = "Available", showLabel = true, size = "md" }) {
  const normalized = STATUS_CONFIG[status] ? status : "Available";
  const config = STATUS_CONFIG[normalized];

  return (
    <span
      className={`proxispeak-status-badge status-${normalized.toLowerCase()} size-${size}`}
      title={config.desc}
    >
      <span className="status-dot" style={{ backgroundColor: config.color }} />
      {showLabel && <span className="status-label">{config.label}</span>}
    </span>
  );
}
