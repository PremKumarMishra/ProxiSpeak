
import { useEffect, useState } from "react";
import "./MyOrganization.css";

const STORAGE_KEY = "proxispeak_organizations_v1";

function getSavedOrganizations() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveOrganizations(organizations) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(organizations));
}

function generateInviteCode() {
  return Math.random().toString(36).substring(2, 9).toUpperCase();
}

export default function MyOrganization({ user }) {
  const [organizations, setOrganizations] = useState(getSavedOrganizations);
  const [selectedOrganization, setSelectedOrganization] = useState(null);

  const [guestId] = useState(() => {
    let id = localStorage.getItem("proxispeak_local_user_id");

    if (!id) {
      id = "guest-" + Math.random().toString(36).substring(2, 12);
      localStorage.setItem("proxispeak_local_user_id", id);
    }

    return id;
  });

  const [guestName, setGuestName] = useState(
    () => localStorage.getItem("proxispeak_local_user_name") || ""
  );

  const [organizationName, setOrganizationName] = useState("");
  const [description, setDescription] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [message, setMessage] = useState("");

  const currentUser = {
    id: user?.uid || user?.email || guestId,
    name:
      user?.displayName ||
      user?.name ||
      user?.email?.split("@")[0] ||
      guestName.trim() ||
      "Guest User",
    email: user?.email || "",
  };

  const myOrganizations = organizations.filter((org) =>
    org.members.some((member) => member.id === currentUser.id)
  );

  useEffect(() => {
    if (selectedOrganization) {
      const updated = organizations.find(
        (org) => org.id === selectedOrganization.id
      );
      setSelectedOrganization(updated || null);
    }
  }, [organizations]);

  function updateOrganizations(updatedOrganizations) {
    saveOrganizations(updatedOrganizations);
    setOrganizations(updatedOrganizations);
  }

  function handleCreateOrganization(e) {
    e.preventDefault();
    setMessage("");

    if (!organizationName.trim()) {
      setMessage("Please enter an organization name.");
      return;
    }

    if (!user && !guestName.trim()) {
      setMessage("Please enter your name first.");
      return;
    }

    const newOrganization = {
      id: "org-" + Date.now(),
      name: organizationName.trim(),
      description: description.trim(),
      inviteCode: generateInviteCode(),
      createdAt: new Date().toISOString(),
      members: [
        {
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
          role: "Owner",
        },
      ],
    };

    const updatedOrganizations = [...organizations, newOrganization];

    updateOrganizations(updatedOrganizations);
    setOrganizationName("");
    setDescription("");
    setSelectedOrganization(newOrganization);
    setMessage("Organization created successfully!");
  }

  function handleJoinOrganization(e) {
    e.preventDefault();
    setMessage("");

    if (!user && !guestName.trim()) {
      setMessage("Please enter your name first.");
      return;
    }

    if (!inviteCode.trim()) {
      setMessage("Please enter an invitation code.");
      return;
    }

    const organization = organizations.find(
      (org) =>
        org.inviteCode.toUpperCase() === inviteCode.trim().toUpperCase()
    );

    if (!organization) {
      setMessage(
        "Organization not found. Check the code or use the same browser."
      );
      return;
    }

    const alreadyMember = organization.members.some(
      (member) => member.id === currentUser.id
    );

    if (alreadyMember) {
      setSelectedOrganization(organization);
      setMessage("You are already a member of this organization.");
      return;
    }

    const updatedOrganizations = organizations.map((org) => {
      if (org.id !== organization.id) return org;

      return {
        ...org,
        members: [
          ...org.members,
          {
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email,
            role: "Member",
          },
        ],
      };
    });

    updateOrganizations(updatedOrganizations);

    const joinedOrganization = updatedOrganizations.find(
      (org) => org.id === organization.id
    );

    setSelectedOrganization(joinedOrganization);
    setInviteCode("");
    setMessage("You joined the organization successfully!");
  }

  function copyInviteCode(code) {
    navigator.clipboard
      .writeText(code)
      .then(() => setMessage("Invitation code copied!"))
      .catch(() => setMessage("Invitation code: " + code));
  }

  return (
    <div className="my-organization">
      <div className="my-organization-header">
        <div>
          <h1>My Organizations</h1>
          <p>Create an organization or join one using an invitation code.</p>
        </div>
      </div>

      {!user && (
        <div className="my-organization-panel">
          <label htmlFor="guest-name">Your name</label>
          <input
            id="guest-name"
            type="text"
            placeholder="Enter your name"
            value={guestName}
            onChange={(e) => {
              setGuestName(e.target.value);
              localStorage.setItem(
                "proxispeak_local_user_name",
                e.target.value
              );
            }}
          />
          <p className="local-note">
            Temporary local mode: organizations are stored in this browser.
          </p>
        </div>
      )}

      {message && (
        <div className="organization-message" role="status">
          {message}
        </div>
      )}

      {selectedOrganization ? (
        <div className="my-organization-panel">
          <button
            className="organization-back-button"
            onClick={() => {
              setSelectedOrganization(null);
              setMessage("");
            }}
          >
            ← Back to Organizations
          </button>

          <h2>{selectedOrganization.name}</h2>
          <p>{selectedOrganization.description || "No description provided."}</p>

          <div className="organization-invite">
            <div>
              <span>Invitation Code</span>
              <strong>{selectedOrganization.inviteCode}</strong>
            </div>
            <button
              type="button"
              onClick={() => copyInviteCode(selectedOrganization.inviteCode)}
            >
              Copy Code
            </button>
          </div>

          <h3>Members ({selectedOrganization.members.length})</h3>

          <div className="organization-members">
            {selectedOrganization.members.map((member) => (
              <div className="organization-member" key={member.id}>
                <div className="member-avatar">
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <div className="member-info">
                  <strong>{member.name}</strong>
                  <span>{member.email || "Local user"}</span>
                </div>
                <span className="member-role">{member.role}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="my-organization-actions">
            <form
              className="my-organization-panel my-organization-form"
              onSubmit={handleCreateOrganization}
            >
              <h2>Create Organization</h2>
              <p>Start a new workspace and invite your team.</p>

              <label htmlFor="organization-name">Organization Name</label>
              <input
                id="organization-name"
                type="text"
                placeholder="e.g. Development Team"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
              />

              <label htmlFor="organization-description">
                Description (optional)
              </label>
              <textarea
                id="organization-description"
                placeholder="What is this organization for?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />

              <button type="submit" className="organization-primary-button">
                Create Organization
              </button>
            </form>

            <form
              className="my-organization-panel my-organization-form"
              onSubmit={handleJoinOrganization}
            >
              <h2>Join Organization</h2>
              <p>Enter the invitation code shared by an organization member.</p>

              <label htmlFor="invite-code">Invitation Code</label>
              <input
                id="invite-code"
                type="text"
                placeholder="e.g. A1B2C3D"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              />

              <button type="submit" className="organization-primary-button">
                Join Organization
              </button>
            </form>
          </div>

          <div className="my-organization-panel">
            <h2>Your Organizations</h2>

            {myOrganizations.length === 0 ? (
              <p className="organization-empty">
                You haven't joined any organizations yet.
              </p>
            ) : (
              <div className="organization-list">
                {myOrganizations.map((org) => (
                  <button
                    type="button"
                    className="organization-list-item"
                    key={org.id}
                    onClick={() => {
                      setSelectedOrganization(org);
                      setMessage("");
                    }}
                  >
                    <div>
                      <strong>{org.name}</strong>
                      <span>
                        {org.members.length} member
                        {org.members.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span>View Members →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
