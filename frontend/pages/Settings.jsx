import { useState } from "react";
import { updateProfile } from "firebase/auth";
import { auth } from "../src/firebase";
import api from "../src/api";
import "./Settings.css";

const AVATAR_PRESETS = [
  "👩🏻‍💻",
  "👨🏽‍💻",
  "👩🏼‍🎨",
  "🧑🏾‍🚀",
  "🧑🏻‍💼",
  "🦊",
  "⚡",
  "🚀",
  "🎧",
  "🌿",
];

export default function Settings({ user, onUserUpdate, onShowToast }) {
  const [name, setName] = useState(user?.displayName || "");
  const [email] = useState(user?.email || "");
  const [jobTitle, setJobTitle] = useState(
    () => localStorage.getItem(`proxispeak-title-${user?.uid}`) || ""
  );
  const [avatar, setAvatar] = useState(
    () => user?.photoURL || localStorage.getItem(`proxispeak-avatar-${user?.uid}`) || "🧑🏻"
  );
  const [customAvatarInput, setCustomAvatarInput] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  function handleCustomAvatarApply() {
    const trimmed = customAvatarInput.trim();
    if (trimmed) {
      setAvatar(trimmed);
      setCustomAvatarInput("");
      if (onShowToast) {
        onShowToast({ type: "info", message: "Custom avatar applied to preview!" });
      }
    }
  }

  async function handleSave(event) {
    event.preventDefault();
    const new_username = name.trim();
    if (!new_username) {
      setUsernameError("Please enter your username.");
      setMessageType("error");
      setMessage("Please enter your username.");
      return;
    }
    setUsernameError("");

    setSavingProfile(true);
    setMessage("");

    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: new_username,
          photoURL: avatar,
        });
      }

      if (user?.uid) {
        localStorage.setItem(`proxispeak-title-${user.uid}`, jobTitle.trim());
        localStorage.setItem(`proxispeak-avatar-${user.uid}`, avatar);
      }

      const updatedUserPayload = {
        displayName: new_username,
        username: new_username,
        photoURL: avatar,
        jobTitle: jobTitle.trim(),
      };

      if (onUserUpdate) {
        onUserUpdate(updatedUserPayload);
      }

      // Send backend request to /api/profile
      await api.put("/api/profile", {
        username: new_username,
        avatar_url: avatar,
        photoURL: avatar,
      });

      setMessageType("success");
      setMessage("Profile updated successfully!");
      if (onShowToast) {
        onShowToast({
          type: "success",
          title: "Profile Updated",
          message: "Username and avatar saved successfully.",
        });
      }
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Failed to update profile.");
      if (onShowToast) {
        onShowToast({
          type: "error",
          title: "Update Failed",
          message: error.message || "Could not save profile changes.",
        });
      }
    } finally {
      setSavingProfile(false);
    }
  }

  const isAvatarUrl = avatar && (avatar.startsWith("http://") || avatar.startsWith("https://") || avatar.startsWith("data:"));

  return (
    <div className="settings-page">
      <div className="settings-heading">
        <h2>Settings</h2>
        <p>Manage your profile, avatar, and account preferences.</p>
      </div>

      <section className="settings-card">
        <h3>Profile Settings</h3>
        <p>Customize how teammates see you across virtual workspaces.</p>

        <form onSubmit={handleSave}>
          {/* Avatar Preview & Selection */}
          <div>
            <span className="settings-field-label">Profile Avatar</span>
            <div className="settings-current-avatar-preview">
              <div className="settings-avatar-big">
                {isAvatarUrl ? (
                  <img src={avatar} alt="Avatar" />
                ) : (
                  <span>{avatar || (name || "U").charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div>
                <strong>{name || "Your Account"}</strong>
                <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#77758e" }}>
                  Selected: {isAvatarUrl ? "Custom Image" : avatar}
                </p>
              </div>
            </div>

            <div style={{ marginTop: "12px" }}>
              <span className="settings-field-label">Choose preset avatar</span>
              <div className="settings-avatar-grid">
                {AVATAR_PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset}
                    className={`settings-avatar-option ${avatar === preset ? "selected" : ""}`}
                    onClick={() => setAvatar(preset)}
                    title={`Select ${preset}`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: "10px" }}>
              <span className="settings-field-label">Or use custom image URL</span>
              <div className="settings-custom-avatar-input">
                <input
                  type="url"
                  placeholder="https://example.com/my-avatar.png"
                  value={customAvatarInput}
                  onChange={(e) => setCustomAvatarInput(e.target.value)}
                />
                <button
                  type="button"
                  className="settings-secondary-btn"
                  onClick={handleCustomAvatarApply}
                >
                  Use URL
                </button>
              </div>
            </div>
          </div>

          {/* Username Input with Validation */}
          <label>
            Username
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (usernameError) setUsernameError("");
              }}
              placeholder="Enter your username"
              className={usernameError ? "input-has-error" : ""}
              required
            />
            {usernameError && (
              <span className="settings-field-error">{usernameError}</span>
            )}
          </label>

          <label>
            Role / Title (optional)
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Frontend Developer, Product Designer"
              maxLength={50}
            />
          </label>

          <label>
            Email address
            <input type="email" value={email} readOnly />
          </label>

          <button type="submit" disabled={savingProfile}>
            {savingProfile ? (
              <>
                <span className="settings-spinner" /> Saving changes...
              </>
            ) : (
              "Save changes"
            )}
          </button>
        </form>

        {message && (
          <p
            className={`settings-message ${
              messageType === "error" ? "settings-message-error" : ""
            }`}
            role="status"
          >
            {message}
          </p>
        )}
      </section>

      <section className="settings-card">
        <h3>Account Info</h3>
        <p>Current session metadata and authentication details.</p>
        <div className="settings-account-meta">
          <div className="settings-meta-item">
            <span>User ID</span>
            <code>{user?.uid || "Local user"}</code>
          </div>
          <div className="settings-meta-item">
            <span>Email</span>
            <strong>{email || "Not linked"}</strong>
          </div>
          <div className="settings-meta-item">
            <span>Workspace Role</span>
            <strong>{jobTitle || "Team Member"}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}