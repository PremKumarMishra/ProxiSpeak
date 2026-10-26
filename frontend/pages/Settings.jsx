import { useState, useEffect, useRef, useCallback } from "react";
import { updateProfile } from "firebase/auth";
import { auth } from "../src/firebase";
import api from "../src/api";
import ConfirmationModal from "../src/components/ConfirmationModal";
import { getSavedTheme, applyTheme } from "../src/utils/theme";
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

const DEFAULT_NOTIFICATIONS = {
  proximityAlerts: true,
  chatSound: true,
  mentionAlerts: true,
  desktopNotifications: false,
};

export default function Settings({ user, onUserUpdate, onShowToast, onLogout }) {
  // ---------------------------------------------------------------------------
  // Profile State
  // ---------------------------------------------------------------------------
  const [name, setName] = useState(user?.displayName || "");
  const [email] = useState(user?.email || "");
  const [jobTitle, setJobTitle] = useState(
    () => (user?.uid ? localStorage.getItem(`proxispeak-title-${user.uid}`) : "") || user?.jobTitle || ""
  );
  const [statusMessage, setStatusMessage] = useState(
    () => (user?.uid ? localStorage.getItem(`proxispeak-status-${user.uid}`) : "") || ""
  );
  const [avatar, setAvatar] = useState(() => {
    const stored = user?.uid ? localStorage.getItem(`proxispeak-avatar-${user.uid}`) : null;
    const latest = localStorage.getItem("proxispeak-avatar-latest");
    if (stored && stored !== "🧑🏻") return stored;
    if (latest && latest !== "🧑🏻") return latest;
    if (user?.photoURL && user.photoURL !== "🧑🏻") return user.photoURL;
    if (user?.backendUser?.avatar_url) return user.backendUser.avatar_url;
    return stored || latest || user?.photoURL || "🧑🏻";
  });
  const [customAvatarInput, setCustomAvatarInput] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const fileInputRef = useRef(null);

  // ---------------------------------------------------------------------------
  // Theme State
  // ---------------------------------------------------------------------------
  const [theme, setTheme] = useState(() => getSavedTheme());

  function handleThemeChange(newTheme) {
    const applied = applyTheme(newTheme);
    setTheme(applied);
    if (onShowToast) {
      onShowToast({
        type: "info",
        title: "Theme Updated",
        message: `Interface switched to ${applied === "dark" ? "Dark" : "Light"} mode.`,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Notification Preferences State
  // ---------------------------------------------------------------------------
  const notifStorageKey = user?.uid
    ? `proxispeak-notifications-${user.uid}`
    : "proxispeak-notifications-guest";

  const [notifications, setNotifications] = useState(() => {
    try {
      const saved = localStorage.getItem(notifStorageKey);
      if (saved) return { ...DEFAULT_NOTIFICATIONS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_NOTIFICATIONS;
  });

  const [browserPermission, setBrowserPermission] = useState(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission;
    }
    return "unsupported";
  });

  function handleNotificationToggle(key) {
    setNotifications((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(notifStorageKey, JSON.stringify(next));
      } catch {}
      if (onShowToast) {
        onShowToast({
          type: "success",
          title: "Preference Saved",
          message: `${key === "proximityAlerts" ? "Proximity alerts" : key === "chatSound" ? "Chat sounds" : key === "mentionAlerts" ? "Mention alerts" : "Desktop notifications"} ${next[key] ? "enabled" : "disabled"}.`,
        });
      }
      return next;
    });
  }

  async function handleRequestBrowserNotification() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      if (onShowToast) {
        onShowToast({
          type: "error",
          title: "Not Supported",
          message: "Desktop notifications are not supported in this browser.",
        });
      }
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setBrowserPermission(permission);
      if (permission === "granted") {
        setNotifications((prev) => {
          const next = { ...prev, desktopNotifications: true };
          try {
            localStorage.setItem(notifStorageKey, JSON.stringify(next));
          } catch {}
          return next;
        });
        new Notification("ProxiSpeak", {
          body: "Desktop notifications are now enabled!",
          icon: "/favicon.ico",
        });
        if (onShowToast) {
          onShowToast({
            type: "success",
            title: "Notifications Enabled",
            message: "Desktop alerts successfully enabled for ProxiSpeak.",
          });
        }
      } else {
        if (onShowToast) {
          onShowToast({
            type: "error",
            title: "Permission Denied",
            message: "Desktop notification permission was denied in your browser.",
          });
        }
      }
    } catch (err) {
      console.warn("Notification request failed:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // Audio & Device Test Controls
  // ---------------------------------------------------------------------------
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const [micDeviceName, setMicDeviceName] = useState("");
  const [micError, setMicError] = useState("");
  const micStreamRef = useRef(null);
  const micAudioContextRef = useRef(null);
  const micAnimFrameRef = useRef(null);

  const [isPlayingSpeakerTest, setIsPlayingSpeakerTest] = useState(false);
  const [speakerSuccess, setSpeakerSuccess] = useState(false);
  const [speakerError, setSpeakerError] = useState("");

  const stopMicTest = useCallback(() => {
    if (micAnimFrameRef.current) {
      cancelAnimationFrame(micAnimFrameRef.current);
      micAnimFrameRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (micAudioContextRef.current && micAudioContextRef.current.state !== "closed") {
      micAudioContextRef.current.close().catch(() => {});
      micAudioContextRef.current = null;
    }
    setIsTestingMic(false);
    setMicVolume(0);
  }, []);

  useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, [stopMicTest]);

  async function handleStartMicTest() {
    setMicError("");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicError("Microphone input is not supported in this browser environment.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const track = stream.getAudioTracks()[0];
      setMicDeviceName(track?.label || "Default Input Device");

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      micAudioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      setIsTestingMic(true);

      function checkAudioLevel() {
        if (!analyser) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        // Map average (0 - 128) to 0 - 100 percentage
        const normalized = Math.min(100, Math.round((average / 85) * 100));
        setMicVolume(normalized);
        micAnimFrameRef.current = requestAnimationFrame(checkAudioLevel);
      }

      checkAudioLevel();
    } catch (err) {
      console.warn("Microphone test error:", err);
      setIsTestingMic(false);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setMicError("Microphone access was denied. Please allow microphone permission in your browser site settings.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setMicError("No microphone hardware found on your device.");
      } else {
        setMicError(err.message || "Failed to initialize microphone device.");
      }
    }
  }

  async function handleTestSpeakers() {
    setSpeakerError("");
    setSpeakerSuccess(false);
    setIsPlayingSpeakerTest(true);

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      const now = audioCtx.currentTime;
      // Elegant 3-tone harmonic chime: C5 (523Hz), E5 (659Hz), G5 (784Hz)
      const notes = [
        { freq: 523.25, time: 0, dur: 0.2 },
        { freq: 659.25, time: 0.16, dur: 0.2 },
        { freq: 783.99, time: 0.32, dur: 0.38 },
      ];

      notes.forEach(({ freq, time, dur }) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + time);

        gain.gain.setValueAtTime(0, now + time);
        gain.gain.linearRampToValueAtTime(0.2, now + time + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + time);
        osc.stop(now + time + dur);
      });

      setTimeout(() => {
        audioCtx.close().catch(() => {});
        setIsPlayingSpeakerTest(false);
        setSpeakerSuccess(true);
        setTimeout(() => setSpeakerSuccess(false), 3500);
      }, 800);
    } catch (err) {
      console.warn("Speaker test error:", err);
      setIsPlayingSpeakerTest(false);
      setSpeakerError("Could not play audio through your output device.");
    }
  }

  // ---------------------------------------------------------------------------
  // Profile Photo Upload & Custom URL
  // ---------------------------------------------------------------------------
  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      if (onShowToast) {
        onShowToast({
          type: "error",
          title: "Invalid File",
          message: "Please select a valid image file (PNG, JPG, WebP, GIF).",
        });
      }
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      if (onShowToast) {
        onShowToast({
          type: "error",
          title: "File Too Large",
          message: "Image must be under 10MB in size.",
        });
      }
      return;
    }

    try {
      // Scale down image to 256x256 square data URL so it loads fast and fits nicely in storage
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
          const img = new Image();
          img.onerror = () => resolve(reader.result);
          img.onload = () => {
            try {
              const canvas = document.createElement("canvas");
              const size = 256;
              canvas.width = size;
              canvas.height = size;
              const ctx = canvas.getContext("2d");

              const minDim = Math.min(img.width, img.height);
              const sx = (img.width - minDim) / 2;
              const sy = (img.height - minDim) / 2;

              ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
              resolve(canvas.toDataURL("image/jpeg", 0.88));
            } catch {
              resolve(reader.result);
            }
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });

      if (typeof dataUrl === "string") {
        setAvatar(dataUrl);

        // Immediately persist so photo is available across all pages
        if (user?.uid) {
          localStorage.setItem(`proxispeak-avatar-${user.uid}`, dataUrl);
        }
        localStorage.setItem("proxispeak-avatar-latest", dataUrl);

        if (onUserUpdate) {
          onUserUpdate({ photoURL: dataUrl, avatar: dataUrl });
        }

        try {
          window.dispatchEvent(new Event("storage"));
          window.dispatchEvent(
            new CustomEvent("proxispeak-avatar-updated", {
              detail: { uid: user?.uid, avatar: dataUrl },
            })
          );
        } catch {}

        if (onShowToast) {
          onShowToast({
            type: "success",
            title: "Photo Loaded",
            message: "Profile photo preview ready. Click 'Save profile changes' to finalize.",
          });
        }
      }
    } catch {
      if (onShowToast) {
        onShowToast({
          type: "error",
          title: "Upload Failed",
          message: "Could not process image file.",
        });
      }
    }

    e.target.value = "";
  }

  function handleCustomAvatarApply() {
    const trimmed = customAvatarInput.trim();
    if (trimmed) {
      setAvatar(trimmed);
      setCustomAvatarInput("");

      if (user?.uid) {
        localStorage.setItem(`proxispeak-avatar-${user.uid}`, trimmed);
      }
      localStorage.setItem("proxispeak-avatar-latest", trimmed);

      if (onUserUpdate) {
        onUserUpdate({ photoURL: trimmed, avatar: trimmed });
      }

      try {
        window.dispatchEvent(new Event("storage"));
        window.dispatchEvent(
          new CustomEvent("proxispeak-avatar-updated", {
            detail: { uid: user?.uid, avatar: trimmed },
          })
        );
      } catch {}

      if (onShowToast) {
        onShowToast({
          type: "success",
          title: "Photo Applied",
          message: "Photo link applied to preview! Click 'Save profile changes' to finalize.",
        });
      }
    }
  }

  function handleResetAvatar() {
    const defaultAv = "🧑🏻";
    setAvatar(defaultAv);

    if (user?.uid) {
      localStorage.setItem(`proxispeak-avatar-${user.uid}`, defaultAv);
    }
    localStorage.setItem("proxispeak-avatar-latest", defaultAv);

    if (onUserUpdate) {
      onUserUpdate({ photoURL: defaultAv, avatar: defaultAv });
    }

    try {
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(
        new CustomEvent("proxispeak-avatar-updated", {
          detail: { uid: user?.uid, avatar: defaultAv },
        })
      );
    } catch {}

    if (onShowToast) {
      onShowToast({ type: "info", message: "Avatar reset to default." });
    }
  }

  function handleSelectPreset(preset) {
    setAvatar(preset);
    if (user?.uid) {
      localStorage.setItem(`proxispeak-avatar-${user.uid}`, preset);
    }
    localStorage.setItem("proxispeak-avatar-latest", preset);

    if (onUserUpdate) {
      onUserUpdate({ photoURL: preset, avatar: preset });
    }

    try {
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(
        new CustomEvent("proxispeak-avatar-updated", {
          detail: { uid: user?.uid, avatar: preset },
        })
      );
    } catch {}
  }

  // ---------------------------------------------------------------------------
  // Save Profile Handler
  // ---------------------------------------------------------------------------
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
      // 1. Safe Firebase update (only short HTTP/HTTPS URLs <= 2048 chars for photoURL to avoid Firebase exceptions)
      if (auth.currentUser) {
        try {
          const isShortHttpUrl =
            typeof avatar === "string" &&
            (avatar.startsWith("http://") || avatar.startsWith("https://")) &&
            avatar.length <= 2048;

          await updateProfile(auth.currentUser, {
            displayName: new_username,
            ...(isShortHttpUrl ? { photoURL: avatar } : {}),
          });
        } catch (firebaseErr) {
          console.warn("Firebase updateProfile non-fatal warning:", firebaseErr);
        }
      }

      // 2. Persist to localStorage
      if (user?.uid) {
        localStorage.setItem(`proxispeak-title-${user.uid}`, jobTitle.trim());
        localStorage.setItem(`proxispeak-avatar-${user.uid}`, avatar);
        localStorage.setItem(`proxispeak-status-${user.uid}`, statusMessage.trim());
      }
      localStorage.setItem("proxispeak-avatar-latest", avatar);

      // 3. Update React user state immediately
      const updatedUserPayload = {
        displayName: new_username,
        username: new_username,
        photoURL: avatar,
        avatar: avatar,
        jobTitle: jobTitle.trim(),
        statusMessage: statusMessage.trim(),
      };

      if (onUserUpdate) {
        onUserUpdate(updatedUserPayload);
      }

      // 4. Notify open tabs / components
      try {
        window.dispatchEvent(new Event("storage"));
        window.dispatchEvent(
          new CustomEvent("proxispeak-avatar-updated", {
            detail: { uid: user?.uid, avatar },
          })
        );
      } catch {}

      // 5. Send to backend in background
      try {
        await api.put("/api/profile", {
          username: new_username,
          photoURL: avatar,
          jobTitle: jobTitle.trim(),
          statusMessage: statusMessage.trim(),
        });
      } catch {
        // Backend offline or unreachable — changes already persisted in Firebase & localStorage
      }

      setMessageType("success");
      setMessage("Profile and photo updated successfully!");
      if (onShowToast) {
        onShowToast({
          type: "success",
          title: "Profile Saved",
          message: "Profile photo and details saved successfully.",
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

  // ---------------------------------------------------------------------------
  // Sign Out Confirmation Dialog
  // ---------------------------------------------------------------------------
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleConfirmSignOut() {
    setSigningOut(true);
    try {
      if (onLogout) {
        await onLogout();
      }
    } finally {
      setSigningOut(false);
      setShowSignOutDialog(false);
    }
  }

  const isAvatarUrl =
    avatar &&
    (avatar.startsWith("http://") ||
      avatar.startsWith("https://") ||
      avatar.startsWith("data:") ||
      avatar.startsWith("blob:"));

  const isEmoji =
    typeof avatar === "string" &&
    avatar.length <= 4 &&
    !avatar.includes("/") &&
    !avatar.includes(".") &&
    !avatar.includes(":") &&
    !avatar.startsWith("http");

  const accountCreated = user?.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Recent session";

  const lastActiveTime = user?.metadata?.lastSignInTime
    ? new Date(user.metadata.lastSignInTime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Active now";

  return (
    <div className="settings-page">
      {/* Page Heading */}
      <div className="settings-heading">
        <h2>Settings</h2>
        <p>Manage your profile, theme appearance, audio devices, and account preferences.</p>
      </div>

      {/* 1. Profile Settings Card */}
      <section className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-title-wrap">
            <span className="settings-card-icon">👤</span>
            <div>
              <h3>Profile Settings</h3>
              <p>Customize how teammates see and identify you across virtual offices.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave}>
          {/* Avatar Preview & Upload Controls */}
          <div className="settings-field-group">
            <span className="settings-field-label">Profile Photo & Avatar</span>

            <div className="settings-current-avatar-preview">
              <div className="settings-avatar-big">
                {isAvatarUrl ? (
                  <img src={avatar} alt="Avatar" />
                ) : (
                  <span>{isEmoji ? avatar : (name || "U").charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="settings-avatar-preview-info">
                <strong>{name || "Your Account"}</strong>
                <span className="settings-avatar-type-badge">
                  {isAvatarUrl
                    ? "Custom Photo"
                    : isEmoji
                    ? `Preset Emoji: ${avatar}`
                    : "Default Avatar"}
                </span>
                <div className="settings-avatar-actions">
                  <button
                    type="button"
                    className="settings-upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    📁 Upload Photo
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handlePhotoUpload}
                  />
                  {avatar !== "🧑🏻" && (
                    <button
                      type="button"
                      className="settings-reset-avatar-btn"
                      onClick={handleResetAvatar}
                    >
                      Reset to Default
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Emoji Presets */}
            <div style={{ marginTop: "14px" }}>
              <span className="settings-field-sublabel">Choose a preset avatar</span>
              <div className="settings-avatar-grid">
                {AVATAR_PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset}
                    className={`settings-avatar-option ${avatar === preset ? "selected" : ""}`}
                    onClick={() => handleSelectPreset(preset)}
                    title={`Select ${preset}`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Photo URL / Image Link */}
            <div style={{ marginTop: "14px" }}>
              <span className="settings-field-sublabel">Or enter an image web URL for profile photo</span>
              <div className="settings-custom-avatar-input">
                <input
                  type="url"
                  placeholder="https://example.com/profile-photo.png"
                  value={customAvatarInput}
                  onChange={(e) => setCustomAvatarInput(e.target.value)}
                />
                <button
                  type="button"
                  className="settings-secondary-btn"
                  onClick={handleCustomAvatarApply}
                >
                  Apply Photo
                </button>
              </div>
            </div>
          </div>

          {/* Username Input with Validation */}
          <label>
            Username / Display Name
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (usernameError) setUsernameError("");
              }}
              placeholder="e.g. Alex Johnson"
              className={usernameError ? "input-has-error" : ""}
              required
            />
            {usernameError && (
              <span className="settings-field-error">{usernameError}</span>
            )}
          </label>

          {/* Status Message Field (NEW - Synchronized with Virtual Office mini profile) */}
          <label>
            Status Message (optional)
            <div className="settings-input-with-counter">
              <input
                type="text"
                value={statusMessage}
                onChange={(e) => setStatusMessage(e.target.value.slice(0, 80))}
                placeholder="e.g. Working on sprint release 🚀, Available for syncs"
                maxLength={80}
              />
              <span className="settings-char-counter">{statusMessage.length}/80</span>
            </div>
            <span className="settings-field-hint">
              Visible on your virtual office avatar mini profile card.
            </span>
          </label>

          {/* Role / Job Title */}
          <label>
            Job Title / Workspace Role (optional)
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Frontend Engineer, Product Lead, Designer"
              maxLength={50}
            />
          </label>

          {/* Email Address */}
          <label>
            Account Email address
            <div className="settings-readonly-input-wrap">
              <input type="email" value={email} readOnly />
              <span className="settings-verified-pill">✓ Verified</span>
            </div>
          </label>

          <button type="submit" className="settings-primary-submit-btn" disabled={savingProfile}>
            {savingProfile ? (
              <>
                <span className="settings-spinner" /> Saving profile changes...
              </>
            ) : (
              "Save profile changes"
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

      {/* 2. Theme & Appearance Settings Card */}
      <section className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-title-wrap">
            <span className="settings-card-icon">🎨</span>
            <div>
              <h3>Appearance & Theme</h3>
              <p>Select your interface theme. Persists across the entire application.</p>
            </div>
          </div>
        </div>

        <div className="settings-theme-selector">
          <button
            type="button"
            className={`settings-theme-option ${theme === "light" ? "active" : ""}`}
            onClick={() => handleThemeChange("light")}
          >
            <div className="settings-theme-preview light-preview">
              <div className="theme-preview-topbar" />
              <div className="theme-preview-body">
                <div className="theme-preview-sidebar" />
                <div className="theme-preview-content" />
              </div>
            </div>
            <div className="settings-theme-label">
              <span className="theme-icon">☀️</span>
              <strong>Light Theme</strong>
              <small>Clean white and soft lavender background</small>
            </div>
          </button>

          <button
            type="button"
            className={`settings-theme-option ${theme === "dark" ? "active" : ""}`}
            onClick={() => handleThemeChange("dark")}
          >
            <div className="settings-theme-preview dark-preview">
              <div className="theme-preview-topbar" />
              <div className="theme-preview-body">
                <div className="theme-preview-sidebar" />
                <div className="theme-preview-content" />
              </div>
            </div>
            <div className="settings-theme-label">
              <span className="theme-icon">🌙</span>
              <strong>Dark Theme</strong>
              <small>Deep slate and vibrant purple accents</small>
            </div>
          </button>
        </div>
      </section>

      {/* 3. Audio & Device Testing Card */}
      <section className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-title-wrap">
            <span className="settings-card-icon">🎧</span>
            <div>
              <h3>Audio & Device Testing</h3>
              <p>Test your microphone and speakers before joining proximity voice discussions.</p>
            </div>
          </div>
        </div>

        <div className="settings-audio-tests-grid">
          {/* Microphone Test */}
          <div className="settings-audio-test-box">
            <div className="settings-audio-box-top">
              <div className="settings-audio-box-icon">🎙️</div>
              <div>
                <strong>Microphone Test</strong>
                <p>Verify browser permissions and input volume levels.</p>
              </div>
            </div>

            {micError && (
              <div className="settings-audio-error-box">
                <span className="error-icon">⚠️</span>
                <span>{micError}</span>
              </div>
            )}

            {isTestingMic && (
              <div className="settings-mic-active-panel">
                <div className="settings-mic-info-row">
                  <span className="device-label">Device: {micDeviceName}</span>
                  <span className="volume-label">{micVolume}%</span>
                </div>
                <div className="settings-mic-level-meter" role="progressbar" aria-valuenow={micVolume} aria-valuemin="0" aria-valuemax="100">
                  <div
                    className="settings-mic-level-fill"
                    style={{
                      width: `${micVolume}%`,
                      backgroundColor:
                        micVolume > 75
                          ? "#ef4444"
                          : micVolume > 35
                          ? "#10b981"
                          : "#6366f1",
                    }}
                  />
                </div>
                <small className="settings-mic-hint">
                  Speak into your microphone to test volume sensitivity.
                </small>
              </div>
            )}

            <div className="settings-audio-box-action">
              {!isTestingMic ? (
                <button
                  type="button"
                  className="settings-audio-btn start-mic"
                  onClick={handleStartMicTest}
                >
                  🎙️ Test Microphone
                </button>
              ) : (
                <button
                  type="button"
                  className="settings-audio-btn stop-mic"
                  onClick={stopMicTest}
                >
                  ⏹️ Stop Microphone Test
                </button>
              )}
            </div>
          </div>

          {/* Speaker Test */}
          <div className="settings-audio-test-box">
            <div className="settings-audio-box-top">
              <div className="settings-audio-box-icon">🔊</div>
              <div>
                <strong>Speaker Test</strong>
                <p>Play a pleasant 3-tone harmonic test sound.</p>
              </div>
            </div>

            {speakerError && (
              <div className="settings-audio-error-box">
                <span className="error-icon">⚠️</span>
                <span>{speakerError}</span>
              </div>
            )}

            {speakerSuccess && (
              <div className="settings-audio-success-box">
                <span>✓ Sound played successfully through your output device.</span>
              </div>
            )}

            <div className="settings-audio-box-action">
              <button
                type="button"
                className={`settings-audio-btn test-speaker ${isPlayingSpeakerTest ? "playing" : ""}`}
                onClick={handleTestSpeakers}
                disabled={isPlayingSpeakerTest}
              >
                {isPlayingSpeakerTest ? (
                  <>
                    <span className="speaker-wave-pulse">🔊</span> Playing test sound...
                  </>
                ) : (
                  "🔊 Play Speaker Test Chime"
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Notification Preferences Card */}
      <section className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-title-wrap">
            <span className="settings-card-icon">🔔</span>
            <div>
              <h3>Notification Preferences</h3>
              <p>Configure audio cues and notifications for virtual office interactions.</p>
            </div>
          </div>
        </div>

        <div className="settings-toggles-list">
          {/* Proximity Sound Alert */}
          <div className="settings-toggle-row">
            <div className="settings-toggle-info">
              <strong>Proximity Audio Alerts</strong>
              <p>Play a subtle chime when teammates enter or leave your proximity voice radius.</p>
            </div>
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={notifications.proximityAlerts}
                onChange={() => handleNotificationToggle("proximityAlerts")}
              />
              <span className="settings-slider" />
            </label>
          </div>

          {/* Chat Messages Alert */}
          <div className="settings-toggle-row">
            <div className="settings-toggle-info">
              <strong>Office Chat Sound Effects</strong>
              <p>Play an audio notification when new messages arrive in the office chat room.</p>
            </div>
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={notifications.chatSound}
                onChange={() => handleNotificationToggle("chatSound")}
              />
              <span className="settings-slider" />
            </label>
          </div>

          {/* Mention Alert */}
          <div className="settings-toggle-row">
            <div className="settings-toggle-info">
              <strong>Direct Mentions Alert</strong>
              <p>Receive highlighted alerts when a colleague mentions your name in conversations.</p>
            </div>
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={notifications.mentionAlerts}
                onChange={() => handleNotificationToggle("mentionAlerts")}
              />
              <span className="settings-slider" />
            </label>
          </div>

          {/* Desktop Push Notifications */}
          <div className="settings-toggle-row">
            <div className="settings-toggle-info">
              <strong>Browser Desktop Notifications</strong>
              <p>Show notifications when ProxiSpeak is running in the background.</p>
              <div className="settings-permission-status">
                Status:{" "}
                <span className={`status-tag ${browserPermission}`}>
                  {browserPermission === "granted"
                    ? "✓ Granted"
                    : browserPermission === "denied"
                    ? "✕ Blocked in Browser"
                    : "Not Requested"}
                </span>
              </div>
            </div>
            {browserPermission !== "granted" ? (
              <button
                type="button"
                className="settings-permission-btn"
                onClick={handleRequestBrowserNotification}
              >
                Enable in Browser
              </button>
            ) : (
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={notifications.desktopNotifications}
                  onChange={() => handleNotificationToggle("desktopNotifications")}
                />
                <span className="settings-slider" />
              </label>
            )}
          </div>
        </div>
      </section>

      {/* 5. Account Details & Danger Zone */}
      <section className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-title-wrap">
            <span className="settings-card-icon">🛡️</span>
            <div>
              <h3>Account & Authentication</h3>
              <p>Session metadata, authentication provider, and sign-out controls.</p>
            </div>
          </div>
        </div>

        <div className="settings-account-meta">
          <div className="settings-meta-item">
            <span>User Identifier (UID)</span>
            <code>{user?.uid || "Local user session"}</code>
          </div>
          <div className="settings-meta-item">
            <span>Authentication Provider</span>
            <strong>{user?.providerData?.[0]?.providerId === "google.com" ? "Google OAuth" : "ProxiSpeak Account"}</strong>
          </div>
          <div className="settings-meta-item">
            <span>Account Created</span>
            <strong>{accountCreated}</strong>
          </div>
          <div className="settings-meta-item">
            <span>Current Session Active</span>
            <strong>{lastActiveTime}</strong>
          </div>
        </div>

        {/* Danger Zone: Sign Out */}
        <div className="settings-danger-zone">
          <div className="settings-danger-info">
            <strong>Sign Out of ProxiSpeak</strong>
            <p>End your session on this browser device. You can sign back in anytime.</p>
          </div>
          <button
            type="button"
            className="settings-signout-btn"
            onClick={() => setShowSignOutDialog(true)}
          >
            🚪 Sign Out
          </button>
        </div>
      </section>

      {/* Sign Out Confirmation Dialog */}
      <ConfirmationModal
        isOpen={showSignOutDialog}
        title="Sign out of your account?"
        message="Are you sure you want to end your current ProxiSpeak session? You will need to sign back in to access your organizations and virtual office."
        confirmText="Yes, Sign Out"
        cancelText="Stay Signed In"
        isDestructive={true}
        icon="🚪"
        isLoading={signingOut}
        onConfirm={handleConfirmSignOut}
        onCancel={() => setShowSignOutDialog(false)}
      />
    </div>
  );
}
