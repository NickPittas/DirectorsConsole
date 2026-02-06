/**
 * OAuth Callback Handler
 * 
 * This component handles the OAuth callback redirect from authorization servers.
 * When opened as a popup, it:
 * 1. Extracts code and state from URL parameters
 * 2. Verifies state matches what was stored
 * 3. Exchanges the code for tokens via the backend
 * 4. Posts the result back to the opener window
 * 5. Closes itself
 */

import { useEffect, useState } from 'react';
import { api } from '@/api/client';

type CallbackStatus = 'processing' | 'success' | 'error';

interface CallbackState {
  status: CallbackStatus;
  message: string;
  error?: string;
}

export default function OAuthCallback() {
  const [state, setState] = useState<CallbackState>({
    status: 'processing',
    message: 'Processing authorization...',
  });

  useEffect(() => {
    const handleCallback = async () => {
      // Get URL parameters
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const urlState = params.get('state');
      const error = params.get('error');
      const errorDescription = params.get('error_description');

      // Check for errors from the OAuth provider
      if (error) {
        setState({
          status: 'error',
          message: 'Authorization failed',
          error: errorDescription || error,
        });
        // Post error to opener
        if (window.opener) {
          window.opener.postMessage({
            type: 'oauth_callback',
            error,
            error_description: errorDescription,
          }, window.location.origin);
        }
        return;
      }

      // Validate required parameters
      if (!code) {
        setState({
          status: 'error',
          message: 'Missing authorization code',
          error: 'No authorization code received from provider',
        });
        if (window.opener) {
          window.opener.postMessage({
            type: 'oauth_callback',
            error: 'missing_code',
            error_description: 'No authorization code received',
          }, window.location.origin);
        }
        return;
      }

      // Retrieve stored state for verification
      const storedState = sessionStorage.getItem('oauth_state');
      const provider = sessionStorage.getItem('oauth_provider');

      // Verify state to prevent CSRF attacks
      if (!urlState || urlState !== storedState) {
        setState({
          status: 'error',
          message: 'Security validation failed',
          error: 'State mismatch - possible CSRF attack. Please try again.',
        });
        if (window.opener) {
          window.opener.postMessage({
            type: 'oauth_callback',
            error: 'state_mismatch',
            error_description: 'State parameter mismatch',
          }, window.location.origin);
        }
        return;
      }

      if (!provider) {
        setState({
          status: 'error',
          message: 'Session expired',
          error: 'Provider information not found. Please try again.',
        });
        if (window.opener) {
          window.opener.postMessage({
            type: 'oauth_callback',
            error: 'no_provider',
            error_description: 'Provider session data missing',
          }, window.location.origin);
        }
        return;
      }

      // Exchange code for tokens
      try {
        setState({
          status: 'processing',
          message: 'Exchanging authorization code for tokens...',
        });

        const redirectUri = `${window.location.origin}/oauth/callback`;
        const tokenResponse = await api.exchangeOAuthCode(
          provider,
          code,
          urlState,
          redirectUri
        );

        if (tokenResponse.success && tokenResponse.access_token) {
          // Clean up session storage
          sessionStorage.removeItem('oauth_state');
          sessionStorage.removeItem('oauth_provider');

          setState({
            status: 'success',
            message: 'Authorization successful! You can close this window.',
          });

          // Post success to opener
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth_callback',
              access_token: tokenResponse.access_token,
              refresh_token: tokenResponse.refresh_token,
              token_type: tokenResponse.token_type,
              expires_in: tokenResponse.expires_in,
              scope: tokenResponse.scope,
            }, window.location.origin);

            // Auto-close popup after a brief delay
            setTimeout(() => {
              window.close();
            }, 1500);
          }
        } else {
          throw new Error('Token exchange failed - no access token received');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setState({
          status: 'error',
          message: 'Token exchange failed',
          error: errorMessage,
        });

        if (window.opener) {
          window.opener.postMessage({
            type: 'oauth_callback',
            error: 'token_exchange_failed',
            error_description: errorMessage,
          }, window.location.origin);
        }
      }
    };

    handleCallback();
  }, []);

  // Styles
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '2rem',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    backgroundColor: '#1a1a2e',
    color: '#eaeaea',
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: '#16213e',
    borderRadius: '12px',
    padding: '2rem',
    maxWidth: '400px',
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
  };

  const statusIconStyle: React.CSSProperties = {
    fontSize: '3rem',
    marginBottom: '1rem',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '1.25rem',
    fontWeight: 600,
    marginBottom: '0.5rem',
  };

  const messageStyle: React.CSSProperties = {
    fontSize: '0.9rem',
    color: '#a0a0a0',
    marginBottom: '1rem',
  };

  const errorStyle: React.CSSProperties = {
    fontSize: '0.85rem',
    color: '#ff6b6b',
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    padding: '0.75rem',
    borderRadius: '6px',
    marginTop: '1rem',
  };

  const spinnerStyle: React.CSSProperties = {
    width: '40px',
    height: '40px',
    border: '3px solid #2a3a5e',
    borderTopColor: '#4a9eff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '1rem',
  };

  const closeButtonStyle: React.CSSProperties = {
    marginTop: '1.5rem',
    padding: '0.75rem 1.5rem',
    backgroundColor: '#4a9eff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 500,
  };

  return (
    <div style={containerStyle}>
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      <div style={cardStyle}>
        {state.status === 'processing' && (
          <>
            <div style={spinnerStyle} />
            <div style={titleStyle}>{state.message}</div>
            <div style={messageStyle}>Please wait...</div>
          </>
        )}

        {state.status === 'success' && (
          <>
            <div style={statusIconStyle}>✓</div>
            <div style={titleStyle}>{state.message}</div>
            <div style={messageStyle}>
              This window will close automatically.
            </div>
          </>
        )}

        {state.status === 'error' && (
          <>
            <div style={statusIconStyle}>✗</div>
            <div style={titleStyle}>{state.message}</div>
            {state.error && <div style={errorStyle}>{state.error}</div>}
            <button
              style={closeButtonStyle}
              onClick={() => window.close()}
            >
              Close Window
            </button>
          </>
        )}
      </div>
    </div>
  );
}
