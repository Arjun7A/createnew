// src/components/Login.jsx
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import './Login.css';
import iimBuilding from '../assets/iim-building.jpg';
import ForgotPassword from './ForgotPassword';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showForgotPassword, setShowForgotPassword] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
        } catch (err) {
            setError(err.message || "An unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    };

    if (showForgotPassword) {
        return <ForgotPassword onBack={() => setShowForgotPassword(false)} />;
    }

    return (
        <div className="login-container">
            <div className="login-image-section">
                <img src={iimBuilding} alt="IIM Campus" />
            </div>
            <div className="login-form-section">
                <div className="login-form-card">
                    <div className="login-header">
                        <h1>IIM Admin Portal</h1>
                        <p>Room Booking System</p>
                    </div>
                    {error && <div className="login-error">{error}</div>}
                    <form onSubmit={handleLogin}>
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
                        <div className="form-group">
                            <label>Password</label>
                            <div className="password-input-container">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    className="form-input"
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                                            <line x1="1" y1="1" x2="23" y2="23"></line>
                                        </svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                            <circle cx="12" cy="12" r="3"></circle>
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>
                        <div className="forgot-password-link">
                            <button
                                type="button"
                                className="btn-link"
                                onClick={() => setShowForgotPassword(true)}
                            >
                                Forgot Password?
                            </button>
                        </div>
                        <button
                            type="submit"
                            className="btn btn-primary btn-full-width"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <div className="spinner"></div>
                                    Authenticating...
                                </>
                            ) : (
                                'Access System'
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Login;
