import React, { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

const UserNotRegisteredError = () => {
  const notified = useRef(false);

  useEffect(() => {
    if (notified.current) return;
    notified.current = true;

    base44.auth.me().then(user => {
      if (!user?.email) return;

      // Only send the notification once per email address (persisted in localStorage)
      const storageKey = `approval_notified_${user.email}`;
      if (localStorage.getItem(storageKey)) return;

      base44.functions.invoke('notifyNewUserApproval', {
        user_email: user.email,
        user_name: user.full_name || '',
      }).then(() => {
        localStorage.setItem(storageKey, '1');
      }).catch(err => console.error('Failed to send approval notification:', err));
    }).catch(() => {});
  }, []);

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen px-4"
      style={{ backgroundColor: '#0B0B0F' }}
    >
      <div
        className="max-w-md w-full p-8 rounded-[20px]"
        style={{
          backgroundColor: '#14141B',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 24px 48px -24px rgba(0,0,0,0.6)',
        }}
      >
        {/* Icon */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: 'rgba(255,181,71,0.12)' }}
        >
          <svg className="w-8 h-8" fill="none" stroke="#FFB547" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <h1 className="text-2xl font-semibold text-center text-white mb-3" style={{ letterSpacing: '-0.02em' }}>
          Awaiting Approval
        </h1>

        <p className="text-center text-sm mb-6" style={{ color: '#A1A1B5', lineHeight: '1.6' }}>
          Your account is pending administrator approval. An email has been sent to the team and you'll receive access once approved.
        </p>

        <div
          className="rounded-[14px] p-4 text-sm space-y-2"
          style={{ backgroundColor: '#1C1C26', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p style={{ color: '#6C6C80' }}>In the meantime:</p>
          <ul className="space-y-1.5" style={{ color: '#A1A1B5' }}>
            <li>✓ Make sure you signed up with your work email</li>
            <li>✓ Contact <span style={{ color: '#7F5BFF' }}>Deeveshjoshi@gmail.com</span> for urgent access</li>
            <li>✓ Try logging out and back in if recently approved</li>
          </ul>
        </div>

        <button
          onClick={() => base44.auth.logout()}
          className="w-full mt-6 py-3 rounded-[14px] text-sm font-semibold transition-all duration-200"
          style={{
            backgroundColor: '#1C1C26',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#A1A1B5',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
};

export default UserNotRegisteredError;