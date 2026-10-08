import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signup } from "../services/api";

function Signup() {
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
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
        setFormData({
            name: "",
            email: "",
            password: "",
            confirmPassword: "",
        });
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
        const { name, email, password, confirmPassword } = formData;

        if (!name.trim() || !email.trim() || !password || !confirmPassword) {
            return "Please fill in all fields.";
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            return "Please enter a valid email address.";
        }

        if (password.length < 6) {
            return "Password must be at least 6 characters long.";
        }

        if (password !== confirmPassword) {
            return "Passwords do not match.";
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

        // Always clear previous session before attempting signup
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setExistingSession(null);

        try {
            setLoading(true);
            setError("");

            const data = await signup({
                name: formData.name.trim(),
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
            setError(err.message || "Failed to create account. Please try again.");
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
                                Logout & Create New Account
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="auth-heading">
                            <h2>Create your account</h2>
                            <p>Start learning vocabulary while you read.</p>
                        </div>

                        {error && (
                            <div className="auth-error" role="alert">
                                <span className="auth-error-icon">⚠️</span>
                                <span>{error}</span>
                            </div>
                        )}

                <form onSubmit={handleSubmit} noValidate>
                    <div className="form-group">
                        <label htmlFor="name">Full Name</label>
                        <input
                            id="name"
                            type="text"
                            placeholder="e.g. Jane Doe"
                            autoComplete="name"
                            value={formData.name}
                            onChange={handleChange}
                            disabled={loading}
                            required
                        />
                    </div>

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
                        <label htmlFor="password">Password (min 6 characters)</label>
                        <input
                            id="password"
                            type="password"
                            placeholder="Create a secure password"
                            autoComplete="new-password"
                            value={formData.password}
                            onChange={handleChange}
                            disabled={loading}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="confirmPassword">
                            Confirm Password
                        </label>
                        <input
                            id="confirmPassword"
                            type="password"
                            placeholder="Repeat password"
                            autoComplete="new-password"
                            value={formData.confirmPassword}
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
                                <span>Creating Account...</span>
                            </span>
                        ) : (
                            "Create Account"
                        )}
                    </button>
                </form>

                        <p className="auth-footer">
                            Already have an account?{" "}
                            <Link to="/login">Log In</Link>
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}

export default Signup;