import { useState } from "react";
import "./InviteModal.css";

export default function InviteModal({
  isOpen,
  onClose,
  organization,
  onInviteSuccess,
  onCopyCode,
}) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen || !organization) return null;

  const orgCode = organization.code || organization.invite_code || organization.id || "";
  const inviteLink = typeof window !== "undefined"
    ? `${window.location.origin}?join=${orgCode}`
    : `https://proxispeak.app?join=${orgCode}`;

  function handleCopy(type) {
    if (type === "code") {
      navigator.clipboard.writeText(orgCode);
      setCopiedCode(true);
      if (onCopyCode) onCopyCode(orgCode);
      setTimeout(() => setCopiedCode(false), 2000);
    } else {
      navigator.clipboard.writeText(inviteLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  }

  function validateEmail(val) {
    const trimmed = val.trim();
    if (!trimmed) {
      return "Email address is required.";
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(trimmed)) {
      return "Please enter a valid email address.";
    }
    return "";
  }

  async function handleSendInvite(e) {
    e.preventDefault();
    const error = validateEmail(email);
    if (error) {
      setEmailError(error);
      return;
    }
    setEmailError("");
    setIsSubmitting(true);

    try {
      // Simulate invite API dispatch
      await new Promise((r) => setTimeout(r, 600));

      const newMember = {
        uid: `invited_${Date.now()}`,
        name: email.split("@")[0],
        email: email.trim(),
        role: "Member",
        joinedAt: new Date().toISOString(),
        isPending: true,
      };

      if (onInviteSuccess) {
        onInviteSuccess(organization, newMember);
      }

      setEmail("");
      onClose();
    } catch {
      setEmailError("Failed to send invite. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="invite-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="invite-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="invite-modal-header">
          <div className="invite-modal-title-wrap">
            <span className="invite-modal-icon">👥</span>
            <div>
              <h3>Invite Members</h3>
              <p>Add teammates to <strong>{organization.name}</strong></p>
            </div>
          </div>
          <button
            type="button"
            className="invite-modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="invite-modal-body">
          {/* Quick Copy Section */}
          <div className="invite-quick-box">
            <label className="invite-box-label">Organization Invite Code</label>
            <div className="invite-code-row">
              <span className="invite-code-display">{orgCode}</span>
              <button
                type="button"
                className={`invite-copy-btn ${copiedCode ? "copied" : ""}`}
                onClick={() => handleCopy("code")}
              >
                {copiedCode ? "Copied ✓" : "Copy Code"}
              </button>
            </div>
          </div>

          <div className="invite-quick-box">
            <label className="invite-box-label">Shareable Workspace Link</label>
            <div className="invite-code-row">
              <input
                type="text"
                readOnly
                value={inviteLink}
                className="invite-link-input"
              />
              <button
                type="button"
                className={`invite-copy-btn ${copiedLink ? "copied" : ""}`}
                onClick={() => handleCopy("link")}
              >
                {copiedLink ? "Copied ✓" : "Copy Link"}
              </button>
            </div>
          </div>

          <div className="invite-separator">
            <span>OR INVITE BY EMAIL</span>
          </div>

          {/* Direct Email Form */}
          <form onSubmit={handleSendInvite} className="invite-email-form">
            <div className="invite-form-fields">
              <div className="invite-input-col">
                <label htmlFor="invite-member-email">Teammate Email</label>
                <input
                  id="invite-member-email"
                  type="email"
                  placeholder="colleague@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError("");
                  }}
                  className={emailError ? "input-has-error" : ""}
                />
                {emailError && <span className="invite-form-error">{emailError}</span>}
              </div>
            </div>

            <div className="invite-actions">
              <button
                type="button"
                className="invite-btn-secondary"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="invite-btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="invite-spinner" /> Sending...
                  </>
                ) : (
                  "Send Invitation →"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
