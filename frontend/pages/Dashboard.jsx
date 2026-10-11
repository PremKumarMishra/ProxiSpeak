import { useState } from "react";
import "./Dashboard.css";
import Settings from "./Settings";
import MyOrganization from "./MyOrganization";

export default function Dashboard({ user, onLogout }) {
const [activeTab, setActiveTab] = useState("Overview");

const menu = [
{ name: "Overview", icon: "⌂" },
{ name: "My Organizations", icon: "▦" },
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
        <p className="dashboard-breadcrumb">
          Workspace / {activeTab}
        </p>
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

            <span>
              Your team is just a little closer.
            </span>
          </div>

          <div className="dashboard-welcome-art">◖))</div>
        </section>

        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <div>
              <h2>Get started</h2>
              <p>
                Create a new organization or join an existing team.
              </p>
            </div>

            <span className="dashboard-tag">GET STARTED</span>
          </div>

          <div className="dashboard-org-grid">
            <article className="dashboard-org-card">
              <div className="org-icon">＋</div>

              <h3>Create an organization</h3>

              <p>
                Set up a virtual office for your team and bring
                everyone together in one place.
              </p>

              <button
                onClick={() => setActiveTab("My Organizations")}
              >
                Create organization <span>→</span>
              </button>
            </article>

            <article className="dashboard-org-card">
              <div className="org-icon org-icon-blue">⌑</div>

              <h3>Join an organization</h3>

              <p>
                Already have a team? Join your organization's
                virtual office and connect with its members.
              </p>

              <button
                onClick={() => setActiveTab("My Organizations")}
              >
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
              Your virtual office helps your team connect naturally.
              Create or join an organization to begin.
            </p>
          </div>
        </section>
      </>
    )}

    {activeTab === "My Organizations" && (
      <MyOrganization />
    )}

    {activeTab === "Settings" && (
      <Settings user={user} />
    )}
  </main>
</div>

);
}