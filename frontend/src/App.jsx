import { useEffect, useState } from "react";
import Dashboard from "../pages/Dashboard";
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";

import { auth } from "./firebase";
import api from "./api";
import "./index.css";

const googleProvider = new GoogleAuthProvider();

async function sendAuthToBackend(firebaseUser) 
{
    if (!firebaseUser) return null;
    const idToken = await firebaseUser.getIdToken();

    //axios.post(url,data,config)
    const response = await api.post(
        "/api/profile",
        {},
        {
            headers: {
                Authorization: `Bearer ${idToken}`,
            },
        }
    );

    const data = response.data;
    console.log(data);
    
    localStorage.setItem("proxispeak-token", idToken);
    return data;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");

  useEffect(() => {
    console.log("Inside UseEffect");
    
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        console.log(currentUser);
        
      if (currentUser) {
        const storedAvatar =
          localStorage.getItem(`proxispeak-avatar-${currentUser.uid}`) ||
          localStorage.getItem("proxispeak-avatar-latest");
        const resolvedAvatar =
          (storedAvatar && storedAvatar !== "🧑🏻" ? storedAvatar : null) ||
          (currentUser.photoURL && currentUser.photoURL !== "🧑🏻" ? currentUser.photoURL : null) ||
          storedAvatar ||
          currentUser.photoURL ||
          "🧑🏻";

        setUser({
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: resolvedAvatar,
            providerData: currentUser.providerData,
            metadata: currentUser.metadata,
        });

        try {
          const backendData = await sendAuthToBackend(currentUser);
          if (backendData?.user) {
            setUser((prev) => {
              if (!prev) return prev;
              const backendAvatar = backendData.user.avatar_url;
              const finalAvatar =
                prev.photoURL && prev.photoURL !== "🧑🏻"
                  ? prev.photoURL
                  : backendAvatar || prev.photoURL || "🧑🏻";
              const finalName = prev.displayName || backendData.user.username;
              return {
                ...prev,
                displayName: finalName,
                photoURL: finalAvatar,
                backendUser: backendData.user,
              };
            });
          }
        } 
        catch 
        {
          // Backend offline or unreachable
        }
      } 
      else 
        {
            try {
              const testUser = localStorage.getItem("proxispeak-test-user");
              if (testUser) {
                setUser(JSON.parse(testUser));
                return;
              }
            } catch {}
            setUser(null);
        }
    });

    const handleAvatarEvent = (e) => {
      if (e.detail?.avatar) {
        setUser((prev) =>
          prev ? { ...prev, photoURL: e.detail.avatar, avatar: e.detail.avatar } : prev
        );
      }
    };
    window.addEventListener("proxispeak-avatar-updated", handleAvatarEvent);

    return () => {
      unsubscribe();
      window.removeEventListener("proxispeak-avatar-updated", handleAvatarEvent);
    };
  }, []);

  async function handleGoogleSignIn() {
    setLoading(true);
    setMessage("");
    setMessageType("error");

    try {
      const credential = await signInWithPopup(auth, googleProvider);

      try {
        const backendData = await sendAuthToBackend(credential.user);
        console.log(backendData);
        
        if (backendData?.user) {
          setUser((prev) =>
            prev ? { ...prev, backendUser: backendData.user } : prev
          );
        }
      } catch {
        // Backend server not running or unreachable
      }
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // Ignore if backend is offline
    }
    localStorage.removeItem("proxispeak-token");
    await signOut(auth);
    setMessage("");
  }

  function handleUserUpdate(updatedFields) {
    setUser((prev) => (prev ? { ...prev, ...updatedFields } : prev));
  }
  
  if (user) {
    return (
      <Dashboard
        user={user}
        onLogout={handleLogout}
        onUserUpdate={handleUserUpdate}
      />
    );
  }

  return (
    <main className="page">
      <section className="intro">
        <a className="brand" href="#home">
          <span className="brand-icon">◖))</span>
          <span>
            <strong>ProxiSpeak</strong>
            <small>Be Near. Be Heard.</small>
          </span>
        </a>

        <div className="intro-content" id="home">
          <span className="eyebrow">A NEW WAY TO CONNECT</span>
          <h1>
            Work feels better
            <br />
            when we're <span>closer.</span>
          </h1>
          <p className="description">
            A virtual office where conversations happen naturally. Move around,
            meet your team, and let proximity bring people together.
          </p>

          <div className="features">
            <article className="feature">
              <span className="feature-icon">⌖</span>
              <div>
                <h3>Move freely</h3>
                <p>Explore your virtual workspace.</p>
              </div>
            </article>
            <article className="feature">
              <span className="feature-icon">♫</span>
              <div>
                <h3>Talk naturally</h3>
                <p>Hear teammates who are nearby.</p>
              </div>
            </article>
            <article className="feature">
              <span className="feature-icon">♧</span>
              <div>
                <h3>Work together</h3>
                <p>Make teamwork feel more human.</p>
              </div>
            </article>
          </div>

          <div className="office-card">
            <div className="office-top">
              <span>YOUR VIRTUAL OFFICE</span>
              <span className="live-dot">● Live preview</span>
            </div>
            <div className="office">
              <div className="desk desk-one">
                ▤<small>Team desk</small>
              </div>
              <div className="desk desk-two">
                ▤<small>Meeting room</small>
              </div>
              <div className="plant">🌿</div>
              <div className="avatar avatar-one">
                <span>👩🏻</span>
                <small>Sarah</small>
              </div>
              <div className="avatar avatar-two">
                <span>🧑🏻</span>
                <small>You</small>
              </div>
              <div className="avatar avatar-three">
                <span>👨🏽</span>
                <small>Alex</small>
              </div>
              <div className="sound-wave">)))</div>
            </div>
            <p className="office-note">
              Move closer to hear. Move away to reduce.
            </p>
          </div>
        </div>

        <footer>Made for teams that feel connected.</footer>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-brand">
            <span className="brand-icon">◖))</span>
            <strong>ProxiSpeak</strong>
          </div>

          <div className="welcome">
            <span className="eyebrow">WELCOME TO YOUR WORKSPACE</span>
            <h2>
              Sign in to ProxiSpeak<span>.</span>
            </h2>
            <p>
              Continue with your Google account to access your organizations and virtual offices.
            </p>
          </div>

          {message && (
            <p
              className={`auth-message ${
                messageType === "success" ? "auth-message-success" : ""
              }`}
              role="alert"
            >
              {message}
            </p>
          )}

          <div className="google-auth-container">
            <button
              className="google-button"
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              title="Sign in with your Google account"
            >
              <span className="google-mark">G</span>
              <span>{loading ? "Connecting to Google..." : "Continue with Google"}</span>
            </button>
          </div>

          <p className="security-note">
            Your workspace. Your conversations. Your space.
          </p>
        </div>
      </section>
    </main>
  );
}
