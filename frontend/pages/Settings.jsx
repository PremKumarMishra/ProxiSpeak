import { useState } from "react";
import "./Settings.css";

export default function Settings({ user }) {
  const [name, setName] = useState(
    user?.displayName || ""
  );

  const [email] = useState(user?.email || "");

  const [message, setMessage] = useState("");

  function handleSave(event) {
    event.preventDefault();
    setMessage(
      "Profile form updated locally. Backend saving is not connected yet."
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-heading">
        <h2>Settings</h2>
        <p>Manage your profile and account preferences.</p>
      </div>

      <section className="settings-card">
        <h3>Profile information</h3>
        <p>View and update your profile details.</p>

        <form onSubmit={handleSave}>
          <label>
            Full name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              required
            />
          </label>

          <label>
            Email address
            <input
              type="email"
              value={email}
              readOnly
            />
          </label>

          <button type="submit">Save changes</button>
        </form>

        {message && (
          <p className="settings-message" role="status">
            {message}
          </p>
        )}
      </section>

      <section className="settings-card">
        <h3>Account</h3>
        <p>Your account is managed through the current authentication setup.</p>
      </section>
    </div>
  );
}