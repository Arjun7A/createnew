// src/components/Toast.jsx
import React from 'react';

const Toast = ({ message, type }) => {
  return (
    <div className={`toast ${type === 'success' ? 'toast-success' : 'toast-error'}`}>
      <span className="toast-icon">
        {type === 'success' ? '✓' : '✕'}
      </span>
      <span>{message}</span>
    </div>
  );
};

export default Toast;
