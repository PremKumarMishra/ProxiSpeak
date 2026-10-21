import { useEffect, useRef, useState } from "react";
import api from "../src/api";
import "./Dashboard.css";
import Settings from "./Settings";
import MyOrganization from "./MyOrganization";
import VirtualOffice from "./VirtualOffice";
import Toast from "../src/components/Toast";
import InviteModal from "../src/components/InviteModal";
import RecentActivity from "../src/components/RecentActivity";

function formatRelativeTime(dateString) {
  if (!dateString) return "Recently";
  const now = new Date();
  const past = new Date(dateString);
  const diffSec = Math.floor((now - past) / 1000);
  if (diffSec < 45) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return past.toLocaleDateString();
}

export default function Dashboard({ user, onLogout, onUserUpdate }) {
  const [activeTab, setActiveTab] = useState("Overview");
  const [selectedOrg, setSelectedOrg] = useState(null);

  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState("Company / Business");
  const [joinCode, setJoinCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orgNameError, setOrgNameError] = useState("");
  const [joinCodeError, setJoinCodeError] = useState("");
  const [overviewMessage, setOverviewMessage] = useState("");
  const [overviewMessageType, setOverviewMessageType] = useState("success");
  const [toasts, setToasts] = useState([]);
  const [inviteModalOrg, setInviteModalOrg] = useState(null);

  const createInputRef = useRef(null);
  const joinInputRef = useRef(null);

  const organizationTypes = [
    "Company / Business",
    "College / Education",
    "Startup",
    "Remote Team",
    "Community / Other",
  ];

  const currentUserName = user?.displayName || user?.email?.split("@")[0] || "Team Member";
  const userAvatar = user?.photoURL || localStorage.getItem(`proxispeak-avatar-${user?.uid}`) || "🧑🏻";
  const organizationJoined = user?.organizations_joined || 0;
  const organizationOwned = user?.organizations_owns || 0;

  const storageKey = user?.uid
    ? `proxispeak-organizations-${user.uid}`
    : "proxispeak-organizations";

  const activityStorageKey = user?.uid
    ? `proxispeak-activity-${user.uid}`
    : "proxispeak-activity";

  const [activities, setActivities] = useState(() => {
    try {
      const saved = localStorage.getItem(activityStorageKey);
      if (saved) return JSON.parse(saved);
      return [
        {
          id: "act-init",
          type: "profile_updated",
          title: "Session Active",
          description: "Signed into ProxiSpeak workspace.",
          createdAt: new Date().toISOString(),
          timestamp: "Just now",
        },
      ];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!user?.uid) return;
    let isMounted = true;

    async function fetchActivitiesFromBackend() {
      try {
        const response = await api.get("/api/activities", {
          params: { uid: user.uid },
        });
        const data = response.data;
        if (
          isMounted &&
          Array.isArray(data?.activities) &&
          data.activities.length > 0
        ) {
          setActivities(data.activities);
          localStorage.setItem(
            activityStorageKey,
            JSON.stringify(data.activities)
          );
        }
      } catch {
        // Fallback to localStorage data
      }
    }

    fetchActivitiesFromBackend();

    return () => {
      isMounted = false;
    };
  }, [user?.uid, activityStorageKey]);

  function showToast({ type = "info", title = "", message = "" }) {
    const id = Date.now() + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }

  function dismissToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  async function addActivity({ type, title, description }) {
    const createdAt = new Date().toISOString();
    const newEntry = {
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type,
      title,
      description,
      createdAt,
      timestamp: "Just now",
    };

    setActivities((prev) => {
      const updated = [newEntry, ...prev.filter((a) => a.id !== newEntry.id)].slice(0, 30);
      try {
        localStorage.setItem(activityStorageKey, JSON.stringify(updated));
      } catch {
        // Ignore storage error
      }
      return updated;
    });

    try {
      await api.post("/api/activities", {
        uid: user?.uid || "default_user",
        activity: newEntry,
      });
    } catch {
      // Offline fallback already stored locally
    }
  }

  async function handleClearActivity() {
    setActivities([]);
    try {
      localStorage.removeItem(activityStorageKey);
      await api.delete("/api/activities", {
        params: { uid: user?.uid || "default_user" },
      });
    } catch {
      // Ignore
    }
    showToast({ type: "info", message: "Activity history cleared." });
  }

  const formattedActivities = activities.map((item) => ({
    ...item,
    timestamp: item.createdAt
      ? formatRelativeTime(item.createdAt)
      : item.timestamp || "Recently",
  }));

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
        const response = await api.get("/api/organizations");
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
  }, [user?.uid, storageKey, activeTab]);

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

    if (!name || name.length < 2) {
      setOrgNameError("Please enter an organization name (at least 2 characters).");
      setOverviewMessageType("error");
      setOverviewMessage("Please enter a valid organization name.");
      return;
    }
    setOrgNameError("");
    setSubmitting(true);

    const initialMember = {
      uid: user?.uid || "local-user",
      name: currentUserName,
      email: user?.email || "",
      role: "Owner",
      photoURL: userAvatar,
      joinedAt: new Date().toISOString(),
    };

    const newOrgPayload = {
      name,
      type: orgType,
      ownerId: user?.uid || "local-user",
      role: "Owner",
      members: [initialMember],
      createdAt: new Date().toISOString(),
    };

    try {
      const response = await api.post("/api/organizations", newOrgPayload);
      const data = response.data;

      // Unique id returned from backend, displayed as invite_code
      const uniqueId =
        data?.id ||
        data?.organization_id ||
        data?.invite_code ||
        data?.organization?.id ||
        data?.organization?._id ||
        data?.organization?.code ||
        Math.random().toString(36).substring(2, 8).toUpperCase();

      const createdOrg = {
        id: uniqueId,
        _id: uniqueId,
        code: uniqueId,
        ...newOrgPayload,
        ...(data?.organization || {}),
      };
      createdOrg.code = uniqueId;

      saveToLocalRegistry(createdOrg);
      handleOrganizationsChange([...organizations, createdOrg]);

      setOrgName("");
      setOrgType("Company / Business");
      setOverviewMessageType("success");
      setOverviewMessage(
        `Organization "${name}" created successfully! Invite code: ${uniqueId}`
      );

      showToast({
        type: "success",
        title: "Organization Created",
        message: `"${name}" has been created! Invite code: ${uniqueId}`,
      });

      addActivity({
        type: "org_created",
        title: `Created "${name}"`,
        description: `Invite code: ${uniqueId}`,
      });
    } catch {
      const fallbackCode = Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();
      const fallbackOrg = {
        id: fallbackCode,
        _id: fallbackCode,
        code: fallbackCode,
        ...newOrgPayload,
      };
      saveToLocalRegistry(fallbackOrg);
      handleOrganizationsChange([...organizations, fallbackOrg]);

      setOrgName("");
      setOrgType("Company / Business");
      setOverviewMessageType("success");
      setOverviewMessage(
        `Organization "${name}" created successfully! Invite code: ${fallbackCode}`
      );

      showToast({
        type: "success",
        title: "Organization Created",
        message: `"${name}" created with code: ${fallbackCode}`,
      });

      addActivity({
        type: "org_created",
        title: `Created "${name}"`,
        description: `Invite code: ${fallbackCode}`,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoinOrganization(event) {
    event.preventDefault();
    setOverviewMessage("");

    const code = joinCode.trim().toUpperCase();

    if (!code || code.length < 3) {
      setJoinCodeError("Please enter a valid invite code (at least 3 characters).");
      setOverviewMessageType("error");
      setOverviewMessage("Please enter a valid invite code.");
      return;
    }
    setJoinCodeError("");

    const alreadyExists = organizations.some(
      (org) =>
        String(org.code).toUpperCase() === code ||
        String(org.id).toUpperCase() === code ||
        String(org._id).toUpperCase() === code
    );

    if (alreadyExists) {
      setOverviewMessageType("error");
      setOverviewMessage("This organization is already in your list.");
      showToast({
        type: "info",
        title: "Already Joined",
        message: "You are already a member of this organization.",
      });
      return;
    }

    setSubmitting(true);

    try {
      const response = await api.post("/api/organizations/join", {
        organization_id: code,
      });
      const data = response.data;

      if (data) {
        const joinedOrg = data.organization || data;
        const orgInviteCode =
          joinedOrg.code ||
          joinedOrg.invite_code ||
          joinedOrg.id ||
          joinedOrg._id ||
          code;
        const normalizedOrg = {
          ...joinedOrg,
          code: orgInviteCode,
        };

        saveToLocalRegistry(normalizedOrg);
        handleOrganizationsChange([...organizations, normalizedOrg]);
        setJoinCode("");
        setOverviewMessageType("success");
        setOverviewMessage(`Joined "${normalizedOrg.name || "organization"}" successfully!`);

        showToast({
          type: "success",
          title: "Joined Workspace",
          message: `Successfully joined "${normalizedOrg.name}"!`,
        });

        addActivity({
          type: "org_joined",
          title: `Joined "${normalizedOrg.name}"`,
          description: `Invite code: ${orgInviteCode}`,
        });

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
      const foundLocal = allLocal.find(
        (o) =>
          String(o.code).toUpperCase() === code ||
          String(o.id).toUpperCase() === code ||
          String(o._id).toUpperCase() === code
      );

      if (foundLocal) {
        const newMemberEntry = {
          uid: user?.uid || "local-user",
          name: currentUserName,
          email: user?.email || "",
          role: "Member",
          photoURL: userAvatar,
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
          role: foundLocal.ownerId === user?.uid ? "Owner" : "Member",
          members: updatedMembers,
        };

        saveToLocalRegistry(joinedOrg);
        handleOrganizationsChange([...organizations, joinedOrg]);
        setJoinCode("");
        setOverviewMessageType("success");
        setOverviewMessage(`Joined "${foundLocal.name}" successfully!`);

        showToast({
          type: "success",
          title: "Joined Workspace",
          message: `Successfully joined "${foundLocal.name}"!`,
        });

        addActivity({
          type: "org_joined",
          title: `Joined "${foundLocal.name}"`,
          description: `Invite code: ${code}`,
        });

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
    showToast({
      type: "error",
      title: "Join Failed",
      message: `No organization found with code "${code}".`,
    });
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

  const ownedWorkspacesCount = organizations.filter(
    (org) => org.ownerId === user?.uid || org.role === "Owner"
  ).length;


  const isUserAvatarUrl = userAvatar && (userAvatar.startsWith("http://") || userAvatar.startsWith("https://") || userAvatar.startsWith("data:"));

  return (
    <div className="dashboard">
      <Toast toasts={toasts} onDismiss={dismissToast} />

      <aside className="dashboard-sidebar">
        <a
          className="dashboard-brand"
          href="#dashboard"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab("Overview");
            setSelectedOrg(null);
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
              onClick={() => {
                setActiveTab(item.name);
                if (item.name === "My Organizations") {
                  setSelectedOrg(null);
                }
              }}
            >
              <span>{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <div className="dashboard-sidebar-bottom">
          <div className="dashboard-user">
            <div className="dashboard-avatar">
              {isUserAvatarUrl ? (
                <img src={userAvatar} alt="Avatar" />
              ) : (
                <span>{userAvatar || (user?.displayName || user?.email || "U").charAt(0).toUpperCase()}</span>
              )}
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
        {!selectedOrg && (
          <header className="dashboard-header">
            <div>
              <p className="dashboard-breadcrumb">Workspace / {activeTab}</p>
              <h1>{activeTab}</h1>
            </div>

            <div className="dashboard-online">
              <span /> You're signed in
            </div>
          </header>
        )}

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

            {/* Quick Action Buttons */}
            <section className="dashboard-quick-actions">
              <div className="dashboard-section-heading">
                <div>
                  <h2>Quick Actions</h2>
                  <p>Fast shortcuts to collaborate and manage your workspace.</p>
                </div>
                <span className="dashboard-tag">SHORTCUTS</span>
              </div>

              <div className="quick-actions-grid">
                <button
                  type="button"
                  className="quick-action-btn"
                  onClick={() => {
                    createInputRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                    createInputRef.current?.focus();
                  }}
                >
                  <span className="quick-action-icon">＋</span>
                  <div className="quick-action-text">
                    <strong>Create Org</strong>
                    <small>Set up new team</small>
                  </div>
                </button>

                <button
                  type="button"
                  className="quick-action-btn"
                  onClick={() => {
                    joinInputRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                    joinInputRef.current?.focus();
                  }}
                >
                  <span className="quick-action-icon blue">⌑</span>
                  <div className="quick-action-text">
                    <strong>Join Team</strong>
                    <small>Enter invite code</small>
                  </div>
                </button>

                <button
                  type="button"
                  className="quick-action-btn"
                  onClick={() => {
                    const targetOrg =
                      organizations.length > 0
                        ? organizations[0]
                        : { id: "default-office", name: "Virtual Office", role: "Owner" };
                    setSelectedOrg(targetOrg);
                    setActiveTab("My Organizations");
                  }}
                >
                  <span className="quick-action-icon orange">🚀</span>
                  <div className="quick-action-text">
                    <strong>Enter Office</strong>
                    <small>Live virtual space</small>
                  </div>
                </button>

                <button
                  type="button"
                  className="quick-action-btn"
                  onClick={() => {
                    if (organizations.length > 0) {
                      setInviteModalOrg(organizations[0]);
                    } else {
                      showToast({
                        type: "info",
                        title: "No Organization",
                        message: "Create an organization first before inviting members.",
                      });
                      createInputRef.current?.focus();
                    }
                  }}
                >
                  <span className="quick-action-icon green">✉</span>
                  <div className="quick-action-text">
                    <strong>Invite Member</strong>
                    <small>Share invite code</small>
                  </div>
                </button>

                <button
                  type="button"
                  className="quick-action-btn"
                  onClick={() => setActiveTab("Settings")}
                >
                  <span className="quick-action-icon">⚙</span>
                  <div className="quick-action-text">
                    <strong>Profile & Settings</strong>
                    <small>Update avatar & preferences</small>
                  </div>
                </button>
              </div>
            </section>

            <section className="dashboard-stats">
              <article className="dashboard-stat">
                <div className="stat-icon purple">▦</div>
                <p>Joined Organizations</p>
                <h3>{organizationJoined}</h3>
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
                <p>Owned Organizations</p>
                <h3>{organizationOwned}</h3>
                <small>Created and owned by you</small>
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
                      ref={createInputRef}
                      id="overview-org-name"
                      type="text"
                      placeholder="e.g. ProxiSpeak Team"
                      value={orgName}
                      onChange={(e) => {
                        setOrgName(e.target.value);
                        if (orgNameError) setOrgNameError("");
                      }}
                      className={orgNameError ? "input-has-error" : ""}
                      maxLength={60}
                      required
                    />
                    {orgNameError && (
                      <span className="dashboard-form-error">{orgNameError}</span>
                    )}

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
                      {submitting ? (
                        <>
                          <span className="dashboard-spinner" /> Creating...
                        </>
                      ) : (
                        "Create organization"
                      )}{" "}
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
                      ref={joinInputRef}
                      id="overview-join-code"
                      type="text"
                      placeholder="Enter invite code (e.g. A1B2C3)"
                      value={joinCode}
                      onChange={(e) => {
                        setJoinCode(e.target.value.toUpperCase());
                        if (joinCodeError) setJoinCodeError("");
                      }}
                      className={joinCodeError ? "input-has-error" : ""}
                      maxLength={30}
                      required
                    />
                    {joinCodeError && (
                      <span className="dashboard-form-error">{joinCodeError}</span>
                    )}

                    <button
                      type="submit"
                      className="join-org-submit-btn"
                      disabled={submitting}
                    >
                      {submitting ? (
                        <>
                          <span className="dashboard-spinner" /> Joining...
                        </>
                      ) : (
                        "Join organization"
                      )}{" "}
                      <span>→</span>
                    </button>
                  </form>
                </article>
              </div>
            </section>

            {/* Recent Activity Section */}
            <RecentActivity
              activities={formattedActivities}
              onClearActivity={handleClearActivity}
              onActivityClick={(item) => {
                if (item.type && item.type.startsWith("org_")) {
                  setActiveTab("My Organizations");
                } else if (item.type === "profile_updated") {
                  setActiveTab("Settings");
                }
              }}
            />

            <section className="dashboard-tip" style={{ marginTop: "24px" }}>
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
          selectedOrg ? (
            <VirtualOffice
              organization={selectedOrg}
              user={user}
              onBack={() => setSelectedOrg(null)}
            />
          ) : (
            <MyOrganization
              user={user}
              organizations={organizations}
              onOrganizationsChange={handleOrganizationsChange}
              onGoToOverview={() => setActiveTab("Overview")}
              onEnterOffice={(org) => setSelectedOrg(org)}
              onShowToast={showToast}
            />
          )
        )}

        {activeTab === "Settings" && (
          <Settings
            user={user}
            onUserUpdate={(updatedFields) => {
              if (onUserUpdate) onUserUpdate(updatedFields);
              if (updatedFields.displayName || updatedFields.username) {
                addActivity({
                  type: "profile_updated",
                  title: "Profile Updated",
                  description: `Username changed to ${updatedFields.displayName || updatedFields.username}.`,
                });
              }
            }}
            onShowToast={showToast}
          />
        )}
      </main>

      {/* Global Invite Modal (from Quick Actions) */}
      <InviteModal
        isOpen={Boolean(inviteModalOrg)}
        onClose={() => setInviteModalOrg(null)}
        organization={inviteModalOrg}
        onInviteSuccess={(org, newMember) => {
          const updated = organizations.map((item) => {
            if ((item._id || item.id) === (org._id || org.id)) {
              const cur = Array.isArray(item.members) ? item.members : [];
              return { ...item, members: [...cur, newMember] };
            }
            return item;
          });
          handleOrganizationsChange(updated);
          showToast({
            type: "success",
            title: "Invitation Sent",
            message: `Invited ${newMember.email} to ${org.name}!`,
          });
          addActivity({
            type: "member_invited",
            title: `Invited Member`,
            description: `Sent invitation to ${newMember.email} for "${org.name}".`,
          });
        }}
        onCopyCode={(code) => {
          showToast({
            type: "success",
            title: "Code Copied",
            message: `Invite code ${code} copied to clipboard!`,
          });
        }}
      />
    </div>
  );
}