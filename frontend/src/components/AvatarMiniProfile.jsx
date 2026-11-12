import { useEffect, useRef } from "react";
import "./AvatarMiniProfile.css";

const isAvatarUrl = (val) =>
  typeof val === "string" &&
  (val.startsWith("http://") ||
    val.startsWith("https://") ||
    val.startsWith("data:") ||
    val.startsWith("blob:") ||
    val.startsWith("/") ||
    val.startsWith("./") ||
    val.includes(".jpg") ||
    val.includes(".png") ||
    val.includes(".jpeg") ||
    val.includes(".webp") ||
    val.includes(".svg") ||
    val.includes(".gif"));

const isEmoji = (val) =>
  typeof val === "string" &&
  val.trim().length > 0 &&
  val.trim().length <= 10 &&
  !val.includes("/") &&
  !val.includes(".") &&
  !val.includes(":") &&
  !val.startsWith("http");

export default function AvatarMiniProfile({
  member,
  position,
  onClose,
}) {
  const cardRef = useRef(null);

  // Close on Escape key, outside click or outside pointerdown
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose?.();
      }
    }

    function handlePointerDownOutside(event) {
      if (cardRef.current && !cardRef.current.contains(event.target)) {
        // If clicking an avatar, let that avatar's handler switch the profile
        if (!event.target.closest(".vo-avatar")) {
          onClose?.();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDownOutside);
    document.addEventListener("touchstart", handlePointerDownOutside);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDownOutside);
      document.removeEventListener("touchstart", handlePointerDownOutside);
    };
  }, [onClose]);

  if (!member || !position) return null;

  // Resolve member's profile photo
  const rawPhoto =
    member.photoURL ||
    member.avatar_url ||
    (isAvatarUrl(member.avatar) ? member.avatar : null) ||
    (isAvatarUrl(member.photo) ? member.photo : null) ||
    null;

  const hasPhotoUrl = isAvatarUrl(rawPhoto);
  const displayName =
    (member.name && member.name.trim()) ||
    (member.displayName && member.displayName.trim()) ||
    "Team Member";
  const displayRole =
    (member.orgRole || member.organizationRole || member.role) &&
    (member.orgRole || member.organizationRole || member.role).trim() &&
    (member.orgRole || member.organizationRole || member.role).trim().toLowerCase() !== "role not available"
      ? ((member.orgRole || member.organizationRole || member.role).trim().toLowerCase() === "owner"
          ? "Owner"
          : (member.orgRole || member.organizationRole || member.role).trim().toLowerCase() === "member"
          ? "Member"
          : (member.orgRole || member.organizationRole || member.role).trim().charAt(0).toUpperCase() +
            (member.orgRole || member.organizationRole || member.role).trim().slice(1))
      : "Member";

  return (
    <div
      ref={cardRef}
      className={`vo-mini-profile-card vo-mp-${position.placement || "above"}`}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={`${displayName} profile`}
    >
      {/* Popover Arrow pointing directly to avatar */}
      <div
        className={`vo-mp-arrow vo-mp-arrow-${position.placement || "above"}`}
        style={{ left: `${position.arrowOffset || 95}px` }}
      />

      {/* Close button */}
      <button
        type="button"
        className="vo-mp-close-btn"
        onClick={onClose}
        aria-label="Close profile card"
        title="Close (Esc)"
      >
        ✕
      </button>

      {/* Profile Card Content: ONLY Profile Photo, Name, and Role */}
      <div className="vo-mp-card-content">
        <div className="vo-mp-avatar-container" title={`${displayName}'s profile photo`}>
          {hasPhotoUrl ? (
            <img
              src={rawPhoto}
              alt=""
              className="vo-mp-avatar-img"
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
              loading="eager"
              onError={(e) => {
                e.target.style.display = "none";
                const fallback = e.target.parentElement?.querySelector(".vo-mp-avatar-fallback");
                if (fallback) fallback.style.display = "flex";
              }}
            />
          ) : null}
          <div
            className="vo-mp-avatar-fallback"
            style={{ display: hasPhotoUrl ? "none" : "flex" }}
          >
            {isEmoji(member.avatar) ? (
              <span className="vo-mp-avatar-emoji">{member.avatar}</span>
            ) : displayName && displayName !== "Team Member" ? (
              <span className="vo-mp-avatar-initials">
                {displayName.charAt(0).toUpperCase()}
              </span>
            ) : (
              <span className="vo-mp-avatar-emoji">👤</span>
            )}
          </div>
        </div>

        <h4 className="vo-mp-name" title={displayName}>
          {displayName}
        </h4>

        <span className="vo-mp-role" title={`Role: ${displayRole}`}>
          {displayRole}
        </span>
      </div>
    </div>
  );
}
