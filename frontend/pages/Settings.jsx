import { useState } from "react";
import {
  updateProfile,
  updatePassword,
  sendPasswordResetEmail,
} from "firebase/auth";
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

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordMessageType, setPasswordMessageType] = useState("success");

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

        try {
          await api.put("/users/profile", {
            uid: user?.uid,
            username: trimmedName,
            displayName: trimmedName,
            email: user?.email,
            jobTitle: jobTitle.trim(),
          });
        } catch {
          // Ignore if backend server is offline
        }
      }

      if (user?.uid) {
        localStorage.setItem(`proxispeak-title-${user.uid}`, jobTitle.trim());
      }

      if (onUserUpdate) {
        onUserUpdate({ displayName: trimmedName });
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

  async function handlePasswordUpdate(event) {
    event.preventDefault();
    setPasswordMessage("");

    if (newPassword.length < 6) {
      setPasswordMessageType("error");
      setPasswordMessage("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessageType("error");
      setPasswordMessage("Passwords do not match.");
      return;
    }

    setSavingPassword(true);

    try {
      if (!auth.currentUser) {
        throw new Error("No signed-in user found.");
      }
      await updatePassword(auth.currentUser, newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessageType("success");
      setPasswordMessage("Your password has been updated successfully.");
    } catch (error) {
      setPasswordMessageType("error");
      if (error.code === "auth/requires-recent-login") {
        setPasswordMessage(
          "For security, Firebase requires a recent sign-in before changing your password. Or click 'Send password reset email' below."
        );
      } else {
        setPasswordMessage(error.message || "Could not update password.");
      }
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleSendResetEmail() {
    if (!email) return;
    setPasswordMessage("");
    try {
      await sendPasswordResetEmail(auth, email);
      setPasswordMessageType("success");
      setPasswordMessage(`Password reset link sent to ${email}.`);
    } catch (error) {
      setPasswordMessageType("error");
      setPasswordMessage(error.message);
    }
  }

  const providerId =
    user?.providerData?.[0]?.providerId === "google.com"
      ? "Google Account"
      : "Email & Password";

  return (
    <div className="settings-page">
      <div className="settings-heading">
        <h2>Settings</h2>
        <p>Manage your profile and account security preferences.</p>
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
        <h3>Security & Password</h3>
        <p>Update your account password or request a password reset email.</p>

        <form onSubmit={handlePasswordUpdate}>
          <div className="settings-password-grid">
            <label>
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                minLength={6}
                required
              />
            </label>

            <label>
              Confirm new password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                minLength={6}
                required
              />
            </label>
          </div>

          <div className="settings-actions-row">
            <button type="submit" disabled={savingPassword}>
              {savingPassword ? "Updating..." : "Update password"}
            </button>

            <button
              type="button"
              className="settings-secondary-btn"
              onClick={handleSendResetEmail}
            >
              Send password reset email
            </button>
          </div>
        </form>

        {passwordMessage && (
          <p
            className={`settings-message ${
              passwordMessageType === "error" ? "settings-message-error" : ""
            }`}
            role="status"
          >
            {passwordMessage}
          </p>
        )}
      </section>

      <section className="settings-card">
        <h3>Account details</h3>
        <p>Your account is authenticated via Firebase Authentication.</p>

        <div className="settings-account-meta">
          <div className="settings-meta-item">
            <span>Sign-in method</span>
            <strong>{providerId}</strong>
          </div>
          <div className="settings-meta-item">
            <span>User ID</span>
            <code>{user?.uid || "Authenticated"}</code>
          </div>
        </div>
      </section>
    </div>
  );
}