import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import './Login.css';
import iimBuilding from '../assets/iim-building.jpg';

const ForgotPassword = ({ onBack }) => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess(false);

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
            });
            
            if (error) throw error;
            setSuccess(true);
        } catch (err) {
            setError(err.message || "An unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-image-section">
                <img src={iimBuilding} alt="IIM Campus" />
            </div>
            <div className="login-form-section">
                <div className="login-form-card">
                    <div className="login-header">
                        <h1>Reset Password</h1>
                        <p>Enter your email to receive reset instructions</p>
                    </div>
                    {success ? (
                        <div className="success-message">
                            <p>Password reset instructions have been sent to your email.</p>
                            <p className="text-muted">Please check your inbox and follow the instructions to reset your password.</p>
                            <button onClick={onBack} className="btn btn-primary btn-full-width">
                                Back to Login
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleResetPassword}>
                            {error && <div className="login-error">{error}</div>}
                            <div className="form-group">
                                <label>Institutional Email</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="admin@iimcal.ac.in"
                                    required
                                    className="form-input"
                                />
                            </div>
                            <div className="button-group">
                                <button type="submit" disabled={loading} className="btn btn-primary btn-full-width">
                                    {loading ? (
                                        <>
                                            <div className="spinner"></div>
                                            Sending...
                                        </>
                                    ) : (
                                        'Send Reset Instructions'
                                    )}
                                </button>
                                <button type="button" onClick={onBack} className="btn btn-secondary btn-full-width">
                                    Back to Login
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ForgotPassword; 