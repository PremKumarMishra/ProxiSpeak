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
  val.length <= 4 &&
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

  // Close on Escape key and outside click
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose?.();
      }
    }

    function handleMouseDown(event) {
      if (cardRef.current && !cardRef.current.contains(event.target)) {
        // If clicking another avatar, let the avatar's onClick handle switching
        if (!event.target.closest(".vo-avatar")) {
          onClose?.();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
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
      aria-label={`${member.name} profile`}
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

      {/* Profile Card Content: ONLY Profile Photo and Member Name */}
      <div className="vo-mp-card-content">
        <div className="vo-mp-avatar-container" title={`${member.name}'s profile photo`}>
          {hasPhotoUrl ? (
            <img
              src={rawPhoto}
              alt={member.name || "Profile Photo"}
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
            ) : (
              <span className="vo-mp-avatar-initials">
                {(member.name || "U").charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        </div>

        <h4 className="vo-mp-name" title={member.name || "Team Member"}>
          {member.name || "Team Member"}
        </h4>
      </div>
    </div>
  );
}
