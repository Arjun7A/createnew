import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import './Login.css';
import iimBuilding from '../assets/iim-building.jpg';

const ResetPassword = () => {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [tokenChecked, setTokenChecked] = useState(false);
    const [sessionValid, setSessionValid] = useState(false);

    useEffect(() => {
        // Check if we have a session (user clicked the reset/invite link)
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                setSessionValid(true);
            } else {
                setError('Invalid or expired link. Please request a new invite or password reset.');
            }
            setTokenChecked(true);
        };
        checkSession();
    }, []);

    const handleReset = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess(false);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            setSuccess(true);
        } catch (err) {
            setError(err.message || 'An unexpected error occurred.');
        } finally {
            setLoading(false);
        }
    };

    if (!tokenChecked) {
        return <div className="login-container"><div className="login-form-section"><div className="login-form-card"><div>Loading...</div></div></div></div>;
    }

    return (
        <div className="login-container">
            <div className="login-image-section">
                <img src={iimBuilding} alt="IIM Campus" />
            </div>
            <div className="login-form-section">
                <div className="login-form-card">
                    <div className="login-header">
                        <h1>Set New Password</h1>
                        <p>Enter your new password below.</p>
                    </div>
                    {error && <div className="login-error">{error}</div>}
                    {sessionValid && !success && (
                        <form onSubmit={handleReset}>
                            <div className="form-group">
                                <label>New Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter new password"
                                    required
                                    className="form-input"
                                />
                            </div>
                            <div className="button-group">
                                <button type="submit" disabled={loading} className="btn btn-primary btn-full-width">
                                    {loading ? (
                                        <>
                                            <div className="spinner"></div>
                                            Resetting...
                                        </>
                                    ) : (
                                        'Set New Password'
                                    )}
                                </button>
                            </div>
                        </form>
                    )}
                    {success && (
                        <div className="success-message">
                            <p>Your password has been set successfully.</p>
                            <a href="/" className="btn btn-primary btn-full-width">Back to Login</a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ResetPassword;