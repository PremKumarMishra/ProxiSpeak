import { useState } from "react";
import api from "../src/api";
import "./MyOrganization.css";

export default function MyOrganization({
  user,
  organizations = [],
  onOrganizationsChange,
  onGoToOverview,
}) {
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [copiedId, setCopiedId] = useState(null);
  const [expandedMembersId, setExpandedMembersId] = useState(null);

  const currentUserName =
    user?.displayName || user?.email?.split("@")[0] || "Team Member";

  async function removeOrganization(org) {
    const shouldRemove = window.confirm(
      `Are you sure you want to remove "${org.name}"?`
    );

    if (!shouldRemove) return;

    const orgId = org._id || org.id;

    try {
      await api.delete(`/api/organization/${orgId}`);
    } catch {
      // Ignore if backend is offline
    }

    const updatedOrganizations = organizations.filter(
      (item) => (item._id || item.id) !== orgId
    );

    onOrganizationsChange(updatedOrganizations);
    setMessageType("success");
    setMessage(`Organization "${org.name}" removed.`);
  }

  function handleCopyCode(org) {
    const orgId = org._id || org.id;
    navigator.clipboard.writeText(org.code);
    setCopiedId(orgId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="organization-page">
      <section className="organization-intro">
        <div>
          <p className="organization-eyebrow">YOUR WORKSPACE</p>
          <h2>My Organizations</h2>
          <p>
            View and manage all organizations you have created or joined, along
            with invite codes and team members.
          </p>
        </div>

        <div className="organization-count">
          <span>{organizations.length}</span>
          <small>Organizations</small>
        </div>
      </section>

      {message && (
        <div
          className={`organization-message ${
            messageType === "error" ? "message-error" : ""
          }`}
          role="status"
        >
          {message}
        </div>
      )}

      <section className="organization-list-section">
        <div className="organization-list-heading">
          <div>
            <h3>Organization Details</h3>
            <p>Your active organizations, invite codes, roles, and members.</p>
          </div>

          <span>{organizations.length} total</span>
        </div>

        {organizations.length === 0 ? (
          <div className="organization-empty">
            <div className="organization-empty-icon">▦</div>
            <h3>No organizations yet</h3>
            <p>
              You haven&apos;t created or joined any organization yet. Head over
              to Overview to create or join one.
            </p>
            {onGoToOverview && (
              <button
                type="button"
                className="organization-empty-btn"
                onClick={onGoToOverview}
              >
                Go to Overview <span>→</span>
              </button>
            )}
          </div>
        ) : (
          <div className="organization-list">
            {organizations.map((org) => {
              const orgId = org._id || org.id;
              const membersList = Array.isArray(org.members)
                ? org.members
                : [
                    {
                      uid: user?.uid || "owner",
                      name: currentUserName,
                      email: user?.email || "",
                      role: org.role || "Admin",
                    },
                  ];
              const isExpanded = expandedMembersId === orgId;
              const userRole =
                org.ownerId === user?.uid ? "Admin" : org.role || "Admin";

              return (
                <article className="organization-card-wrapper" key={orgId}>
                  <div className="organization-item">
                    <div className="organization-item-icon">
                      {org.type === "College / Education"
                        ? "🎓"
                        : org.type === "Startup"
                        ? "🚀"
                        : org.type === "Community / Other"
                        ? "👥"
                        : "◖))"}
                    </div>

                    <div className="organization-item-details">
                      <div className="organization-title-row">
                        <h4>{org.name}</h4>
                        <span className="organization-type-badge">
                          {org.type || "Company / Business"}
                        </span>
                        <span
                          className={`organization-role-badge ${
                            userRole === "Admin" ? "role-admin" : "role-member"
                          }`}
                        >
                          Role: {userRole}
                        </span>
                      </div>

                      <div className="organization-meta-row">
                        <div className="organization-code-box">
                          <span>Invite code:</span>
                          <strong>{org.code}</strong>
                          <button
                            type="button"
                            className="organization-copy-btn"
                            onClick={() => handleCopyCode(org)}
                          >
                            {copiedId === orgId ? "Copied ✓" : "Copy"}
                          </button>
                        </div>

                        <button
                          type="button"
                          className="organization-members-toggle"
                          onClick={() =>
                            setExpandedMembersId(isExpanded ? null : orgId)
                          }
                        >
                          👥 {membersList.length}{" "}
                          {membersList.length === 1 ? "Member" : "Members"}{" "}
                          {isExpanded ? "▲" : "▼"}
                        </button>
                      </div>
                    </div>

                    <div className="organization-item-actions">
                      <button
                        type="button"
                        className="organization-delete-btn"
                        onClick={() => removeOrganization(org)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="organization-members-drawer">
                      <h5>Organization Members ({membersList.length})</h5>
                      <div className="organization-members-grid">
                        {membersList.map((member, index) => (
                          <div
                            className="organization-member-chip"
                            key={member.uid || member.user_id || index}
                          >
                            <div className="member-chip-avatar">
                              {(member.name || member.email || "U")
                                .charAt(0)
                                .toUpperCase()}
                            </div>
                            <div className="member-chip-info">
                              <strong>
                                {member.name || "Team Member"}
                                {member.uid === user?.uid ? " (You)" : ""}
                              </strong>
                              <small>{member.email || "Workspace member"}</small>
                            </div>
                            <span className="member-chip-role">
                              {member.role || "Member"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}