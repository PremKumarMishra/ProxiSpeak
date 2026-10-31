import { useEffect, useState } from "react";
import api from "../src/api";
import "./MyOrganization.css";

export default function MyOrganization({
  user,
  organizations = [],
  onOrganizationsChange,
  onGoToOverview,
  onEnterOffice,
  onShowToast,
}) {
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [copiedId, setCopiedId] = useState(null);


  useEffect(() => {
    let isMounted = true;
    async function fetchOrganizations() {
      try {
        const response = await api.get("/api/organizations");
        const data = response.data;
        const orgList = Array.isArray(data?.organizations)
          ? data.organizations
          : Array.isArray(data)
          ? data
          : [];

        if (isMounted && onOrganizationsChange && orgList.length > 0) {
          onOrganizationsChange(orgList);
        }
      } catch (err) {
        console.error("Failed to fetch organizations:", err);
      }
    }

    fetchOrganizations();

    return () => {
      isMounted = false;
    };
  }, [onOrganizationsChange]);

  async function removeOrganization(org) {
    const shouldRemove = window.confirm(
      `Are you sure you want to remove "${org.name}"?`
    );

    if (!shouldRemove) return;

    const orgId = org._id || org.id || org.code;

    try {
      await api.delete("/api/organizations", {
        data: { organization_id: orgId },
      });
    } catch {
      // Ignore if backend is offline
    }

    const updatedOrganizations = organizations.filter(
      (item) => (item._id || item.id || item.code) !== orgId
    );

    onOrganizationsChange(updatedOrganizations);
    setMessageType("success");
    setMessage(`Organization "${org.name}" removed.`);

    if (onShowToast) {
      onShowToast({
        type: "info",
        title: "Organization Removed",
        message: `"${org.name}" has been removed from your workspace.`,
      });
    }
  }

  function handleCopyCode(org) {
    const orgId = org._id || org.id;
    const code = org.code || org.invite_code || org.id;
    navigator.clipboard.writeText(code);
    setCopiedId(orgId);
    setTimeout(() => setCopiedId(null), 2000);

    if (onShowToast) {
      onShowToast({
        type: "success",
        title: "Invite Code Copied",
        message: `Code "${code}" copied to clipboard!`,
      });
    }
  }

  return (
    <div className="organization-page">
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
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap", marginTop: "12px" }}>
              {onGoToOverview && (
                <button
                  type="button"
                  className="organization-empty-btn"
                  onClick={onGoToOverview}
                >
                  Go to Overview <span>→</span>
                </button>
              )}
              {onEnterOffice && (
                <button
                  type="button"
                  className="organization-empty-btn"
                  style={{ background: "#7c3aed", color: "#ffffff", borderColor: "#7c3aed" }}
                  onClick={() => onEnterOffice({ id: "default-office", name: "Virtual Office", role: "Owner" })}
                >
                  🏢 Launch Virtual Office
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="organization-list">
            {organizations.map((org) => {
              const orgId = org._id || org.id;
              const isOwner = org.ownerId === user?.uid || org.role === "Owner";
              const userRole = isOwner ? "Owner" : "Member";
              const memberCount =
                typeof org.membersCount === "number"
                  ? org.membersCount
                  : typeof org.members_count === "number"
                  ? org.members_count
                  : Array.isArray(org.members) && org.members.length > 0
                  ? org.members.length
                  : 1;
              const memberCountLabel = `${memberCount} ${
                memberCount === 1 ? "Member" : "Members"
              }`;

              return (
                <article className="organization-card-wrapper" key={orgId}>
                  <div className="organization-item">
                    <div
                      className="organization-item-icon"
                      style={{ cursor: "pointer" }}
                      onClick={() => onEnterOffice && onEnterOffice(org)}
                      title={`Open ${org.name} virtual office`}
                    >
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
                        <h4
                          style={{ cursor: "pointer" }}
                          onClick={() => onEnterOffice && onEnterOffice(org)}
                          title={`Open ${org.name} virtual office`}
                        >
                          {org.name}
                        </h4>
                        <span className="organization-type-badge">
                          {org.type || "Company / Business"}
                        </span>
                        <span
                          className={`organization-role-badge ${
                            userRole === "Owner" ? "role-owner" : "role-member"
                          }`}
                        >
                          Role: {userRole}
                        </span>
                      </div>

                      <div className="organization-meta-row">
                        <div className="organization-code-box">
                          <span>Invite code:</span>
                          <button
                            type="button"
                            className="organization-copy-btn"
                            onClick={() => handleCopyCode(org)}
                            title="Copy organization invite code"
                          >
                            {copiedId === orgId ? "Copied ✓" : "Copy Code"}
                          </button>
                        </div>

                        {/* Compact Member Count Label (No individual member list) */}
                        <div
                          className="organization-members-count"
                          title={`Total members: ${memberCount}`}
                        >
                          👥 {memberCountLabel}
                        </div>
                      </div>
                    </div>

                    <div className="organization-item-actions">
                      {/* Enter Virtual Office button */}
                      {onEnterOffice && (
                        <button
                          type="button"
                          className="organization-enter-btn"
                          onClick={() => onEnterOffice(org)}
                          title="Enter proximity virtual office"
                        >
                          🚀 Enter Office
                        </button>
                      )}

                      <button
                        type="button"
                        className="organization-delete-btn"
                        onClick={() => removeOrganization(org)}
                        title="Remove organization"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}