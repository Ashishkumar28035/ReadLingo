import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../services/api";

function Login() {
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        email: "",
        password: "",
    });

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const [existingSession, setExistingSession] = useState(() => {
        const token = localStorage.getItem("token");
        if (!token) return null;
        try {
            return JSON.parse(localStorage.getItem("user")) || { email: "active account" };
        } catch {
            return { email: "active account" };
        }
    });

    const handleSwitchAccount = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setExistingSession(null);
        setError("");
        setFormData({ email: "", password: "" });
    };

    const handleChange = (e) => {
        const { id, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [id]: value,
        }));
        if (error) setError("");
    };

    const validate = () => {
        const { email, password } = formData;

        if (!email.trim() || !password) {
            return "Please provide both email and password.";
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            return "Please enter a valid email address.";
        }

        return null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const validationError = validate();
        if (validationError) {
            setError(validationError);
            return;
        }

        // CRITICAL: Always clear any existing token and session before attempting a new login.
        // This guarantees that if the login fails, no stale token remains in localStorage.
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setExistingSession(null);

        try {
            setLoading(true);
            setError("");

            const data = await login({
                email: formData.email.trim(),
                password: formData.password,
            });

            if (data?.token) {
                localStorage.setItem("token", data.token);
                localStorage.setItem(
                    "user",
                    JSON.stringify({
                        _id: data._id,
                        name: data.name,
                        email: data.email,
                    })
                );
            }

            navigate("/reader", { replace: true });
        } catch (err) {
            setError(err.message || "Invalid email or password. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="brand">
                    <div className="brand-icon">📖</div>
                    <h1>ReadLingo</h1>
                </div>

                {existingSession ? (
                    <div>
                        <div className="auth-heading">
                            <h2>Already Signed In</h2>
                            <p>You have an active session on this browser.</p>
                        </div>

                        <div className="auth-session-box">
                            <div className="auth-session-user-info">
                                <span className="auth-session-avatar">👤</span>
                                <div className="auth-session-details">
                                    <div className="auth-session-name">{existingSession.name || "ReadLingo User"}</div>
                                    <div className="auth-session-email">{existingSession.email}</div>
                                </div>
                            </div>
                        </div>

                        <div className="auth-session-actions">
                            <button
                                type="button"
                                className="auth-button"
                                onClick={() => navigate("/reader", { replace: true })}
                            >
                                Continue to Reader
                            </button>

                            <button
                                type="button"
                                className="auth-button auth-button-secondary"
                                onClick={handleSwitchAccount}
                            >
                                Logout & Switch Account
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="auth-heading">
                            <h2>Welcome back</h2>
                            <p>Continue your reading and vocabulary journey.</p>
                        </div>

                        {error && (
                            <div className="auth-error" role="alert">
                                <span className="auth-error-icon">⚠️</span>
                                <span>{error}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} noValidate>
                            <div className="form-group">
                                <label htmlFor="email">Email Address</label>
                                <input
                                    id="email"
                                    type="email"
                                    placeholder="you@example.com"
                                    autoComplete="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    disabled={loading}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="password">Password</label>
                                <input
                                    id="password"
                                    type="password"
                                    placeholder="Enter your password"
                                    autoComplete="current-password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    disabled={loading}
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                className="auth-button"
                                disabled={loading}
                            >
                                {loading ? (
                                    <span className="btn-loading-wrapper">
                                        <span className="btn-spinner" />
                                        <span>Logging in...</span>
                                    </span>
                                ) : (
                                    "Log In"
                                )}
                            </button>
                        </form>

                        <p className="auth-footer">
                            New to ReadLingo?{" "}
                            <Link to="/signup">Create an account</Link>
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}

export default Login;