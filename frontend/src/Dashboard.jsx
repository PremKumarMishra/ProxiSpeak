import { useState } from "react";
import "./Dashboard.css";

export default function Dashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState("Overview");

  const menu = [
    { name: "Overview", icon: "⌂" },
    { name: "My Office", icon: "▦" },
    { name: "Team", icon: "♧" },
    { name: "Meetings", icon: "◷" },
    { name: "Settings", icon: "⚙" },
  ];

  return (
    <div className="dashboard">
      <aside className="dashboard-sidebar">
        <a className="dashboard-brand" href="#dashboard">
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
              {(user.displayName || user.email || "U")
                .charAt(0)
                .toUpperCase()}
            </div>
            <div className="dashboard-user-info">
              <strong>{user.displayName || "Your account"}</strong>
              <small>{user.email}</small>
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
                  {(user.displayName || user.email || "there").split("@")[0]}!
                </h2>
                <span>Your team is just a little closer.</span>
              </div>
              <div className="dashboard-welcome-art">◖))</div>
            </section>

            <section className="dashboard-stats">
              <article className="dashboard-stat">
                <span className="stat-icon purple">▦</span>
                <p>My organizations</p>
                <h3>0</h3>
                <small>Organizations you belong to</small>
              </article>

              <article className="dashboard-stat">
                <span className="stat-icon green">♧</span>
                <p>Team members</p>
                <h3>0</h3>
                <small>People in your workspace</small>
              </article>

              <article className="dashboard-stat">
                <span className="stat-icon orange">◷</span>
                <p>Upcoming meetings</p>
                <h3>0</h3>
                <small>Your scheduled meetings</small>
              </article>
            </section>

            <section className="dashboard-section">
              <div className="dashboard-section-heading">
                <div>
                  <h2>Your workspace</h2>
                  <p>Create or join an organization to get started.</p>
                </div>
                <span className="dashboard-tag">GET STARTED</span>
              </div>

              <div className="dashboard-org-grid">
                <article className="dashboard-org-card">
                  <div className="org-icon">＋</div>
                  <h3>Create an organization</h3>
                  <p>
                    Set up a virtual office for your team and bring everyone
                    together in one place.
                  </p>
                  <button onClick={() => setActiveTab("My Office")}>
                    Create organization <span>→</span>
                  </button>
                </article>

                <article className="dashboard-org-card">
                  <div className="org-icon org-icon-blue">⌑</div>
                  <h3>Join an organization</h3>
                  <p>
                    Already have a team? Head to your office area to get
                    started with your organization.
                  </p>
                  <button onClick={() => setActiveTab("My Office")}>
                    Join organization <span>→</span>
                  </button>
                </article>
              </div>
            </section>

            <section className="dashboard-tip">
              <span>✦</span>
              <div>
                <strong>Teamwork, without the distance</strong>
                <p>
                  Your virtual office will help your team connect naturally.
                  Create or join an organization to begin.
                </p>
              </div>
            </section>
          </>
        )}

        {activeTab !== "Overview" && (
          <section className="dashboard-placeholder">
            <div className="placeholder-icon">
              {menu.find((item) => item.name === activeTab)?.icon}
            </div>
            <h2>{activeTab}</h2>
            <p>
              This section is ready for the next development step. Its
              functionality will be connected here.
            </p>
            <button onClick={() => setActiveTab("Overview")}>
              ← Back to overview
            </button>
          </section>
        )}
      </main>
    </div>
  );
}