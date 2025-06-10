import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

const TwoFactorSetup = () => {
  const [qrCode, setQrCode] = useState(null);
  const [factorId, setFactorId] = useState(null);
  const [code, setCode] = useState('');
  const [step, setStep] = useState('init'); // init, verify, done
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const enroll2FA = async () => {
    setError('');
    setSuccess(false);
    setStep('init');
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'IIMC Room Booking',
      friendlyName: 'Authenticator App',
    });
    if (error) {
      setError(error.message);
      return;
    }
    setQrCode(data.totp.qr_code);
    setFactorId(data.id);
    setStep('verify');
  };

  const verify2FA = async (e) => {
    e.preventDefault();
    setError('');
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setSuccess(true);
    setStep('done');
  };

  return (
    <div className="login-form-card" style={{ maxWidth: 400, margin: '2rem auto' }}>
      <h2>Set up Two-Factor Authentication</h2>
      {step === 'init' && (
        <button className="btn btn-primary btn-full-width" onClick={enroll2FA}>
          Generate QR Code
        </button>
      )}
      {step === 'verify' && qrCode && (
        <div style={{ textAlign: 'center' }}>
          <p>Scan this QR code with your authenticator app:</p>
          <img src={qrCode} alt="2FA QR Code" style={{ margin: '1rem auto', width: 200, height: 200 }} />
          <form onSubmit={verify2FA} style={{ marginTop: '1.5rem' }}>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Enter code from app"
              className="form-input"
              required
              style={{ textAlign: 'center', fontSize: '1.2rem', letterSpacing: '0.2em' }}
            />
            <button type="submit" className="btn btn-primary btn-full-width" style={{ marginTop: 16 }}>
              Verify
            </button>
          </form>
        </div>
      )}
      {step === 'done' && success && (
        <div className="success-message">
          <p>2FA setup complete! Your account is now protected.</p>
        </div>
      )}
      {error && <div className="login-error">{error}</div>}
    </div>
  );
};

export default TwoFactorSetup; 