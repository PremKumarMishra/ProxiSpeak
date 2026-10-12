import { useEffect, useState } from "react";
import api from "../src/api";
import "./Dashboard.css";
import Settings from "./Settings";
import MyOrganization from "./MyOrganization";

export default function Dashboard({ user, onLogout, onUserUpdate }) {
  const [activeTab, setActiveTab] = useState("Overview");

  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState("Company / Business");
  const [joinCode, setJoinCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [overviewMessage, setOverviewMessage] = useState("");
  const [overviewMessageType, setOverviewMessageType] = useState("success");

  const organizationTypes = [
    "Company / Business",
    "College / Education",
    "Startup",
    "Remote Team",
    "Community / Other",
  ];

  const currentUserName =
    user?.displayName || user?.email?.split("@")[0] || "Team Member";

  const storageKey = user?.uid
    ? `proxispeak-organizations-${user.uid}`
    : "proxispeak-organizations";

  const [organizations, setOrganizations] = useState(() => {
    try {
      const userSpecific = localStorage.getItem(storageKey);
      if (userSpecific) return JSON.parse(userSpecific);
      return JSON.parse(
        localStorage.getItem("proxispeak-organizations") || "[]"
      );
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!user?.uid) return;

    let isMounted = true;

    async function fetchOrganizationsFromBackend() {
      try {
        const response = await api.get("/organizations");
        const data = response.data;
        const backendOrgs = Array.isArray(data?.organizations)
          ? data.organizations
          : Array.isArray(data)
          ? data
          : [];

        if (isMounted && backendOrgs.length > 0) {
          setOrganizations(backendOrgs);
          localStorage.setItem(storageKey, JSON.stringify(backendOrgs));
        }
      } catch {
        // Keep localStorage organizations when backend server is offline
      }
    }

    fetchOrganizationsFromBackend();

    return () => {
      isMounted = false;
    };
  }, [user?.uid, storageKey]);

  function handleOrganizationsChange(updatedOrganizations) {
    setOrganizations(updatedOrganizations);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updatedOrganizations));
      localStorage.setItem(
        "proxispeak-organizations",
        JSON.stringify(updatedOrganizations)
      );
    } catch {
      // Ignore storage errors
    }
  }

  function saveToLocalRegistry(orgItem) {
    try {
      const all = JSON.parse(
        localStorage.getItem("proxispeak-all-organizations") || "[]"
      );
      const filtered = all.filter((o) => o.code !== orgItem.code);
      localStorage.setItem(
        "proxispeak-all-organizations",
        JSON.stringify([...filtered, orgItem])
      );
    } catch {
      // Ignore storage errors
    }
  }

  async function handleCreateOrganization(event) {
    event.preventDefault();
    setOverviewMessage("");

    const name = orgName.trim();

    if (!name) {
      setOverviewMessageType("error");
      setOverviewMessage("Please enter an organization name.");
      return;
    }

    setSubmitting(true);

    const code = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

    const initialMember = {
      uid: user?.uid || "local-user",
      name: currentUserName,
      email: user?.email || "",
      role: "Admin",
      joinedAt: new Date().toISOString(),
    };

    const newOrgPayload = {
      name,
      type: orgType,
      code,
      ownerId: user?.uid || "local-user",
      role: "Admin",
      members: [initialMember],
      createdAt: new Date().toISOString(),
    };

    try {
      const response = await api.post("/organizations", newOrgPayload);
      const data = response.data;

      const createdOrg = {
        id: data?.organization?._id || data?.organization?.id || Date.now(),
        ...newOrgPayload,
        ...(data?.organization || {}),
      };

      saveToLocalRegistry(createdOrg);
      handleOrganizationsChange([...organizations, createdOrg]);

      setOrgName("");
      setOrgType("Company / Business");
      setOverviewMessageType("success");
      setOverviewMessage(
        `Organization "${name}" created successfully! Invite code: ${createdOrg.code}`
      );
    } catch {
      const fallbackOrg = {
        id: Date.now(),
        ...newOrgPayload,
      };
      saveToLocalRegistry(fallbackOrg);
      handleOrganizationsChange([...organizations, fallbackOrg]);

      setOrgName("");
      setOrgType("Company / Business");
      setOverviewMessageType("success");
      setOverviewMessage(
        `Organization "${name}" created successfully! Invite code: ${code}`
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoinOrganization(event) {
    event.preventDefault();
    setOverviewMessage("");

    const code = joinCode.trim().toUpperCase();

    if (!code) {
      setOverviewMessageType("error");
      setOverviewMessage("Please enter an invite code.");
      return;
    }

    const alreadyExists = organizations.some((org) => org.code === code);

    if (alreadyExists) {
      setOverviewMessageType("error");
      setOverviewMessage("This organization is already in your list.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await api.post("/organizations/join", { code });
      const data = response.data;

      if (data) {
        const joinedOrg = data.organization || data;
        saveToLocalRegistry(joinedOrg);
        handleOrganizationsChange([...organizations, joinedOrg]);
        setJoinCode("");
        setOverviewMessageType("success");
        setOverviewMessage(`Joined "${joinedOrg.name}" successfully!`);
        setSubmitting(false);
        return;
      }
    } catch {
      // Fallback to local registry check if backend is offline
    }

    try {
      const allLocal = JSON.parse(
        localStorage.getItem("proxispeak-all-organizations") || "[]"
      );
      const foundLocal = allLocal.find((o) => o.code === code);

      if (foundLocal) {
        const newMemberEntry = {
          uid: user?.uid || "local-user",
          name: currentUserName,
          email: user?.email || "",
          role: "Member",
          joinedAt: new Date().toISOString(),
        };
        const existingMembers = Array.isArray(foundLocal.members)
          ? foundLocal.members
          : [];
        const updatedMembers = existingMembers.some((m) => m.uid === user?.uid)
          ? existingMembers
          : [...existingMembers, newMemberEntry];

        const joinedOrg = {
          ...foundLocal,
          role: foundLocal.ownerId === user?.uid ? "Admin" : "Member",
          members: updatedMembers,
        };

        saveToLocalRegistry(joinedOrg);
        handleOrganizationsChange([...organizations, joinedOrg]);
        setJoinCode("");
        setOverviewMessageType("success");
        setOverviewMessage(`Joined "${foundLocal.name}" successfully!`);
        setSubmitting(false);
        return;
      }
    } catch {
      // Ignore
    }

    setSubmitting(false);
    setOverviewMessageType("error");
    setOverviewMessage(
      `No organization found with invite code "${code}". Please check the code and try again.`
    );
  }

  const menu = [
    { name: "Overview", icon: "⌂" },
    { name: "My Organizations", icon: "▦" },
    { name: "Settings", icon: "⚙" },
  ];

  const totalMembersCount = organizations.reduce((sum, org) => {
    const count = Array.isArray(org.members) ? org.members.length : 1;
    return sum + count;
  }, 0);

  const adminWorkspacesCount = organizations.filter(
    (org) => org.ownerId === user?.uid || org.role === "Admin"
  ).length;

  return (
    <div className="dashboard">
      <aside className="dashboard-sidebar">
        <a
          className="dashboard-brand"
          href="#dashboard"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab("Overview");
          }}
        >
          <span className="dashboard-brand-icon">◖))</span>
          <span>
            <strong>ProxiSpeak</strong>
            <small>Be Near. Be Heard.</small>
          </span>
        </a>

        <p className="dashboard-label">WORKSPACE</p>

        <nav className="dashboard-nav">
          {menu.map((item) => (
            <button
              key={item.name}
              className={activeTab === item.name ? "active" : ""}
              onClick={() => setActiveTab(item.name)}
            >
              <span>{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <div className="dashboard-sidebar-bottom">
          <div className="dashboard-user">
            <div className="dashboard-avatar">
              {(user?.displayName || user?.email || "U")
                .charAt(0)
                .toUpperCase()}
            </div>

            <div className="dashboard-user-info">
              <strong>{user?.displayName || "Your account"}</strong>
              <small>{user?.email}</small>
            </div>
          </div>

          <button className="dashboard-logout" onClick={onLogout}>
            ↪ Sign out
          </button>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p className="dashboard-breadcrumb">Workspace / {activeTab}</p>
            <h1>{activeTab}</h1>
          </div>

          <div className="dashboard-online">
            <span></span> You're signed in
          </div>
        </header>

        {activeTab === "Overview" && (
          <>
            <section className="dashboard-welcome">
              <div>
                <p>YOUR VIRTUAL WORKSPACE</p>

                <h2>
                  Welcome back,{" "}
                  {(user?.displayName || user?.email || "there").split("@")[0]}!
                </h2>

                <span>Your team is just a little closer.</span>
              </div>

              <div className="dashboard-welcome-art">◖))</div>
            </section>

            <section className="dashboard-stats">
              <article className="dashboard-stat">
                <div className="stat-icon purple">▦</div>
                <p>Joined Organizations</p>
                <h3>{organizations.length}</h3>
                <small>Active workspaces</small>
              </article>

              <article className="dashboard-stat">
                <div className="stat-icon green">👥</div>
                <p>Organization Members</p>
                <h3>{totalMembersCount}</h3>
                <small>Across your organizations</small>
              </article>

              <article className="dashboard-stat">
                <div className="stat-icon orange">★</div>
                <p>Admin Organizations</p>
                <h3>{adminWorkspacesCount}</h3>
                <small>Created or managed by you</small>
              </article>
            </section>

            <section className="dashboard-section">
              <div className="dashboard-section-heading">
                <div>
                  <h2>Get started</h2>
                  <p>Create a new organization or join an existing team.</p>
                </div>

                <span className="dashboard-tag">GET STARTED</span>
              </div>

              {overviewMessage && (
                <div
                  className={`dashboard-alert ${
                    overviewMessageType === "error"
                      ? "dashboard-alert-error"
                      : ""
                  }`}
                  role="status"
                >
                  <span>{overviewMessage}</span>
                  {overviewMessageType === "success" && (
                    <button
                      type="button"
                      className="dashboard-alert-link"
                      onClick={() => setActiveTab("My Organizations")}
                    >
                      View in My Organizations →
                    </button>
                  )}
                </div>
              )}

              <div className="dashboard-org-grid">
                <article className="dashboard-org-card">
                  <div className="org-icon">＋</div>

                  <h3>Create an organization</h3>

                  <p>
                    Set up a virtual office for your team and bring everyone
                    together in one place.
                  </p>

                  <form
                    className="dashboard-org-form"
                    onSubmit={handleCreateOrganization}
                  >
                    <label htmlFor="overview-org-name">Organization name</label>
                    <input
                      id="overview-org-name"
                      type="text"
                      placeholder="e.g. ProxiSpeak Team"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      maxLength={60}
                      required
                    />

                    <label htmlFor="overview-org-type">Organization type</label>
                    <select
                      id="overview-org-type"
                      value={orgType}
                      onChange={(e) => setOrgType(e.target.value)}
                    >
                      {organizationTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>

                    <button type="submit" disabled={submitting}>
                      {submitting ? "Creating..." : "Create organization"}{" "}
                      <span>→</span>
                    </button>
                  </form>
                </article>

                <article className="dashboard-org-card">
                  <div className="org-icon org-icon-blue">⌑</div>

                  <h3>Join an organization</h3>

                  <p>
                    Already have a team? Enter your invitation code to join your
                    organization's workspace.
                  </p>

                  <form
                    className="dashboard-org-form"
                    onSubmit={handleJoinOrganization}
                  >
                    <label htmlFor="overview-join-code">Invitation code</label>
                    <input
                      id="overview-join-code"
                      type="text"
                      placeholder="Enter invite code (e.g. A1B2C3)"
                      value={joinCode}
                      onChange={(e) =>
                        setJoinCode(e.target.value.toUpperCase())
                      }
                      maxLength={30}
                      required
                    />

                    <button
                      type="submit"
                      className="join-org-submit-btn"
                      disabled={submitting}
                    >
                      {submitting ? "Joining..." : "Join organization"}{" "}
                      <span>→</span>
                    </button>
                  </form>
                </article>
              </div>
            </section>

            <section className="dashboard-tip">
              <span>✦</span>

              <div>
                <strong>Teamwork, without the distance</strong>
                <p>
                  Your workspace helps your team connect naturally. Create or
                  join an organization above, and view all details in My
                  Organizations.
                </p>
              </div>
            </section>
          </>
        )}

        {activeTab === "My Organizations" && (
          <MyOrganization
            user={user}
            organizations={organizations}
            onOrganizationsChange={handleOrganizationsChange}
            onGoToOverview={() => setActiveTab("Overview")}
          />
        )}

        {activeTab === "Settings" && (
          <Settings user={user} onUserUpdate={onUserUpdate} />
        )}
      </main>
    </div>
  );
}