import { useEffect, useState } from "react";
import Dashboard from "../pages/Dashboard";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  updateProfile,
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
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  useEffect(() => {
    console.log("Inside UseEffect");
    
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        console.log(currentUser);
        
      if (currentUser) {
        const savedAvatar = localStorage.getItem(`proxispeak-avatar-${currentUser.uid}`) || currentUser.photoURL ||"🧑🏻";
        setUser({
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: savedAvatar,
            providerData: currentUser.providerData,
            metadata: currentUser.metadata,
        });

        try {
          const backendData = await sendAuthToBackend(currentUser);
          console.log(currentUser);
          
          if (backendData?.user) {
            setUser((prev) =>
              prev ? { ...prev, backendUser: backendData.user } : prev
            );
            console.log(user,"setting");
            
          }
        } 
        catch 
        {
          // Backend offline or unreachable
        }
      } 
      else 
        {
            setUser(null);
        }
    });

    return unsubscribe;
  }, []);

  async function handleSignIn(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setMessageType("error");

    try {
      if (isCreatingAccount) {
        const trimmedName = fullName.trim();
        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

        if (trimmedName) {
          await updateProfile(credential.user, {
            displayName: trimmedName,
          });
          setUser({
            uid: credential.user.uid,
            email: credential.user.email,
            displayName: trimmedName,
            photoURL: credential.user.photoURL,
            providerData: credential.user.providerData,
            metadata: credential.user.metadata,
          });
        }

        try {
          const backendData = await sendAuthToBackend(credential.user, {
            customName: trimmedName,
            isNewUser: true,
          });
          if (backendData?.user) {
            setUser((prev) =>
              prev ? { ...prev, backendUser: backendData.user } : prev
            );
          }
        } catch {
          // Backend server not running or unreachable
        }
      } else {
        const credential = await signInWithEmailAndPassword(
          auth,
          email,
          password
        );

        try {
          const backendData = await sendAuthToBackend(credential.user, {
            isNewUser: false,
          });
          if (backendData?.user) {
            setUser((prev) =>
              prev ? { ...prev, backendUser: backendData.user } : prev
            );
          }
        } catch {
          // Backend server not running or unreachable
        }
      }
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

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

  async function handleForgotPassword() {
    if (!email) {
      setMessageType("error");
      setMessage("Pehle email address enter karo.");
      return;
    }

    setMessage("");

    try {
      await sendPasswordResetEmail(auth, email);
      setMessageType("success");
      setMessage("Password reset link tumhari email par bhej diya gaya hai.");
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
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
              {isCreatingAccount ? "Create account" : "Welcome back"}
              <span>.</span>
            </h2>
            <p>
              {isCreatingAccount
                ? "Create your account to get started."
                : "Sign in to continue to ProxiSpeak."}
            </p>
          </div>

          <form onSubmit={handleSignIn}>
            {isCreatingAccount && (
              <>
                <label htmlFor="full-name">Full name</label>
                <input
                  id="full-name"
                  type="text"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                />
              </>
            )}

            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <div className="password-label">
              <label htmlFor="password">Password</label>
              <button
                type="button"
                className="text-button"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />

            {!isCreatingAccount && (
              <div className="form-options">
                <label className="remember">
                  <input type="checkbox" />
                  Remember me
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={handleForgotPassword}
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button className="sign-in" type="submit" disabled={loading}>
              {loading
                ? "Please wait..."
                : isCreatingAccount
                ? "Create account"
                : "Sign in"}{" "}
              <span>→</span>
            </button>
          </form>

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

          <p className="signup">
            {isCreatingAccount
              ? "Already have an account?"
              : "New to ProxiSpeak?"}
            <button
              type="button"
              className="text-button auth-switch"
              onClick={() => {
                setIsCreatingAccount(!isCreatingAccount);
                setMessage("");
              }}
            >
              {isCreatingAccount ? "Sign in" : "Create account"}
            </button>
          </p>

          <div className="separator">
            <span>OR</span>
          </div>

          <button
            className="google-button"
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            <span className="google-mark">G</span>
            Continue with Google
          </button>

          <p className="security-note">
            Your workspace. Your conversations. Your space.
          </p>
        </div>
      </section>
    </main>
  );
}
