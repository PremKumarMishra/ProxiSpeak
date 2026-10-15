import { useEffect, useState } from "react";
import api from "../src/api";
import InviteModal from "../src/components/InviteModal";
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
  const [expandedMembersId, setExpandedMembersId] = useState(null);
  const [inviteModalOrg, setInviteModalOrg] = useState(null);

  const currentUserName =
    user?.displayName || user?.email?.split("@")[0] || "Team Member";

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

  function handleInviteSuccess(org, newMember) {
    const orgId = org._id || org.id;
    const updated = organizations.map((item) => {
      if ((item._id || item.id) === orgId) {
        const currentMembers = Array.isArray(item.members) ? item.members : [];
        return {
          ...item,
          members: [...currentMembers, newMember],
        };
      }
      return item;
    });

    onOrganizationsChange(updated);
    setMessageType("success");
    setMessage(`Invitation sent to ${newMember.email} for "${org.name}".`);

    if (onShowToast) {
      onShowToast({
        type: "success",
        title: "Invitation Sent",
        message: `Teammate ${newMember.email} has been invited!`,
      });
    }
  }

  return (
    <div className="organization-page">
      <section className="organization-intro">
        <div>
          <p className="organization-eyebrow">YOUR WORKSPACE</p>
          <h2>My Organizations</h2>
          <p>
            View and manage all organizations you have created or joined, invite
            team members, copy invite codes, and enter virtual offices.
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
              const isOwner = org.ownerId === user?.uid || org.role === "Owner";
              const userRole = isOwner ? "Owner" : "Member";
              const membersList = Array.isArray(org.members) && org.members.length > 0
                ? org.members
                : [
                    {
                      uid: user?.uid || "owner",
                      name: currentUserName,
                      email: user?.email || "",
                      role: userRole,
                      photoURL: user?.photoURL || "",
                    },
                  ];
              const isExpanded = expandedMembersId === orgId;

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
                          <strong>{org.code || org.invite_code || org.id}</strong>
                          <button
                            type="button"
                            className="organization-copy-btn"
                            onClick={() => handleCopyCode(org)}
                            title="Copy organization invite code"
                          >
                            {copiedId === orgId ? "Copied ✓" : "Copy"}
                          </button>
                        </div>

                        {/* Clickable Member Count button */}
                        <button
                          type="button"
                          className="organization-members-toggle"
                          onClick={() =>
                            setExpandedMembersId(isExpanded ? null : orgId)
                          }
                          title="Click to view team members"
                        >
                          👥 {membersList.length}{" "}
                          {membersList.length === 1 ? "Member" : "Members"}{" "}
                          {isExpanded ? "▲" : "▼"}
                        </button>
                      </div>
                    </div>

                    <div className="organization-item-actions">
                      {/* Invite Members button */}
                      <button
                        type="button"
                        className="organization-invite-btn"
                        onClick={() => setInviteModalOrg(org)}
                        title="Invite teammates to this organization"
                      >
                        ✉ Invite Members
                      </button>

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

                  {/* Members list with profile avatars and roles */}
                  {isExpanded && (
                    <div className="organization-members-drawer">
                      <h5>Organization Members ({membersList.length})</h5>
                      <div className="organization-members-grid">
                        {membersList.map((member, index) => {
                          const isCurrentUser = member.uid === user?.uid;
                          const memberAvatar = isCurrentUser
                            ? (user?.photoURL || member.photoURL || member.avatar)
                            : (member.photoURL || member.avatar);
                          const isAvatarUrl =
                            memberAvatar &&
                            (memberAvatar.startsWith("http://") ||
                              memberAvatar.startsWith("https://") ||
                              memberAvatar.startsWith("data:"));

                          return (
                            <div
                              className="organization-member-chip"
                              key={member.uid || member.email || index}
                            >
                              <div className="member-chip-avatar">
                                {isAvatarUrl ? (
                                  <img
                                    src={memberAvatar}
                                    alt={member.name}
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      borderRadius: "8px",
                                      objectFit: "cover",
                                    }}
                                  />
                                ) : (
                                  <span>
                                    {memberAvatar ||
                                      (member.name || member.email || "U")
                                        .charAt(0)
                                        .toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div className="member-chip-info">
                                <strong>
                                  {member.name || "Team Member"}
                                  {isCurrentUser ? " (You)" : ""}
                                </strong>
                                <small>
                                  {member.email || "Workspace member"}
                                </small>
                              </div>
                              {(() => {
                                const isMemberOwner =
                                  member.uid === org.ownerId ||
                                  member.role === "Owner";
                                const roleLabel = isMemberOwner ? "Owner" : "Member";
                                return (
                                  <span
                                    className={`member-chip-role ${
                                      isMemberOwner ? "role-owner" : "role-member"
                                    }`}
                                  >
                                    {roleLabel}
                                  </span>
                                );
                              })()}
                            </div>
                          );
                        })}

                        {/* Quick Invite Chip */}
                        <div
                          className="organization-member-chip"
                          style={{
                            borderStyle: "dashed",
                            cursor: "pointer",
                            background: "#faf9fe",
                          }}
                          onClick={() => setInviteModalOrg(org)}
                        >
                          <div
                            className="member-chip-avatar"
                            style={{ background: "#edeaff", color: "#6b57dc" }}
                          >
                            ＋
                          </div>
                          <div className="member-chip-info">
                            <strong style={{ color: "#6b57dc" }}>
                              Invite Teammate
                            </strong>
                            <small>Add by email or share code</small>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Invite Members Modal */}
      <InviteModal
        isOpen={Boolean(inviteModalOrg)}
        onClose={() => setInviteModalOrg(null)}
        organization={inviteModalOrg}
        onInviteSuccess={handleInviteSuccess}
        onCopyCode={(code) => {
          if (onShowToast) {
            onShowToast({
              type: "success",
              title: "Code Copied",
              message: `Code "${code}" copied to clipboard!`,
            });
          }
        }}
      />
    </div>
  );
}