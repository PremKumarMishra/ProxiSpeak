import { useState } from "react";
import { updateProfile } from "firebase/auth";
import { auth } from "../src/firebase";
import api from "../src/api";
import "./Settings.css";

export default function Settings({ user, onUserUpdate }) {
  const [name, setName] = useState(user?.displayName || "");
  const [email] = useState(user?.email || "");
  const [jobTitle, setJobTitle] = useState(
    () => localStorage.getItem(`proxispeak-title-${user?.uid}`) || ""
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  async function handleSave(event) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setMessageType("error");
      setMessage("Please enter your full name.");
      return;
    }

    setSavingProfile(true);
    setMessage("");

    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: trimmedName,
        });
      }

      if (user?.uid) {
        localStorage.setItem(`proxispeak-title-${user.uid}`, jobTitle.trim());
      }

      if (onUserUpdate) {
        onUserUpdate({ displayName: trimmedName });
      }

      try {
        await api.put("/api/profile", {
          uid: user?.uid,
          username: trimmedName,
          displayName: trimmedName,
          email: user?.email,
          jobTitle: jobTitle.trim(),
        });
      } catch {
        // Backend server not running yet — profile is already updated in Firebase
      }

      setMessageType("success");
      setMessage("Profile updated successfully!");
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
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
              placeholder="Enter your full name"
              required
            />
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
            {savingProfile ? "Saving changes..." : "Save changes"}
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
        <h3>Account</h3>
        <p>
          Your account is managed through the current authentication setup.
        </p>
      </section>
    </div>
  );
}