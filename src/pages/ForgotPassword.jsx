import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../services/api";

function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleChange = (e) => {
        setEmail(e.target.value);
        if (error) setError("");
    };

    const validate = () => {
        if (!email.trim()) {
            return "Please provide your email address.";
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

        try {
            setLoading(true);
            setError("");
            await forgotPassword(email.trim());
            // Always show generic confirmation message to prevent account enumeration
            setSubmitted(true);
        } catch (err) {
            setError(err.message || "Failed to process request. Please try again later.");
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
                    <h2>Reset Password</h2>
                    <p>Enter your email address to receive password reset instructions.</p>
                </div>

                {submitted ? (
                    <div className="auth-success-box" role="status">
                        <div className="auth-success-icon">✉️</div>
                        <h3>Check your inbox</h3>
                        <p>
                            If an account exists for <strong>{email}</strong>, we have sent password reset instructions.
                            Please check your inbox and spam folder.
                        </p>
                        <div className="auth-session-actions" style={{ marginTop: "24px" }}>
                            <Link to="/login" className="auth-button">
                                Return to Log In
                            </Link>
                            <button
                                type="button"
                                className="auth-button auth-button-secondary"
                                onClick={() => {
                                    setSubmitted(false);
                                    setEmail("");
                                }}
                            >
                                Try another email
                            </button>
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
                                <label htmlFor="email">Email Address</label>
                                <input
                                    id="email"
                                    type="email"
                                    placeholder="you@example.com"
                                    autoComplete="email"
                                    value={email}
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
                                        <span>Sending Instructions...</span>
                                    </span>
                                ) : (
                                    "Send Reset Instructions"
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

export default ForgotPassword;
