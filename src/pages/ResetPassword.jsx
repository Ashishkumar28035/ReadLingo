import { useState, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { resetPassword } from "../services/api";
import PasswordInput from "../components/PasswordInput";

function ResetPassword() {
    const location = useLocation();

    // Extract token from URL query string (?token=...)
    const token = useMemo(() => {
        const params = new URLSearchParams(location.search);
        return params.get("token") || "";
    }, [location.search]);

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const validate = () => {
        if (!password || !confirmPassword) {
            return "Please provide and confirm your new password.";
        }

        if (password.length < 6) {
            return "Password must be at least 6 characters long.";
        }

        if (password.length > 128) {
            return "Password cannot exceed 128 characters.";
        }

        if (password !== confirmPassword) {
            return "Passwords do not match.";
        }

        return null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!token) {
            setError("Reset token is missing. Please request a new password reset link.");
            return;
        }

        const validationError = validate();
        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            setLoading(true);
            setError("");

            await resetPassword({
                token,
                password,
            });

            setSuccess(true);
        } catch (err) {
            setError(err.message || "Failed to reset password. The link may have expired or is invalid.");
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

                <div className="auth-heading">
                    <h2>Set New Password</h2>
                    <p>Enter your new password below.</p>
                </div>

                {!token ? (
                    <div className="auth-error-box" role="alert">
                        <div className="auth-error-icon" style={{ fontSize: "28px", marginBottom: "8px" }}>⚠️</div>
                        <h3>Invalid or Missing Reset Link</h3>
                        <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "20px" }}>
                            The password reset link is invalid or incomplete. Please request a fresh reset link.
                        </p>
                        <Link to="/forgot-password" className="auth-button">
                            Request New Reset Link
                        </Link>
                    </div>
                ) : success ? (
                    <div className="auth-success-box" role="status">
                        <div className="auth-success-icon">✅</div>
                        <h3>Password Reset Complete</h3>
                        <p>
                            Your password has been successfully updated. You can now log in with your new credentials.
                        </p>
                        <div className="auth-session-actions" style={{ marginTop: "24px" }}>
                            <Link to="/login" className="auth-button">
                                Log In Now
                            </Link>
                        </div>
                    </div>
                ) : (
                    <>
                        {error && (
                            <div className="auth-error" role="alert">
                                <span className="auth-error-icon">⚠️</span>
                                <span>{error}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} noValidate>
                            <div className="form-group">
                                <label htmlFor="password">New Password (min 6 characters)</label>
                                <PasswordInput
                                    id="password"
                                    placeholder="Enter new secure password"
                                    autoComplete="new-password"
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        if (error) setError("");
                                    }}
                                    disabled={loading}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="confirmPassword">Confirm New Password</label>
                                <PasswordInput
                                    id="confirmPassword"
                                    placeholder="Confirm new password"
                                    autoComplete="new-password"
                                    value={confirmPassword}
                                    onChange={(e) => {
                                        setConfirmPassword(e.target.value);
                                        if (error) setError("");
                                    }}
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
                                        <span>Updating Password...</span>
                                    </span>
                                ) : (
                                    "Reset Password"
                                )}
                            </button>
                        </form>

                        <p className="auth-footer">
                            Remember your password?{" "}
                            <Link to="/login">Back to Log In</Link>
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}

export default ResetPassword;
