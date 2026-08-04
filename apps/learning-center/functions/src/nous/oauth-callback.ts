import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

admin.initializeApp();

/**
 * Nous Research Inference API OAuth Callback Handler
 *
 * ESGGO-OA Dashboard OAuth flow:
 *   1. User authenticates via hermes.esggo.com/auth/callback
 *   2. Callback exchanges code for access token
 *   3. This handler wires the Nous API key for inference requests
 *
 * Client ID: agent:cmr0b7v0m000gl40dylvf40ln
 * Redirect URI: https://hermes.esggo.com/auth/callback
 */

const NOUS_API_BASE = 'https://inference-api.nousresearch.com/v1';

interface NousOAuthConfig {
  clientId: string;
  redirectUri: string;
  apiKeyEnvVar: string;
}

const config: NousOAuthConfig = {
  clientId: process.env.NOUS_OAUTH_CLIENT_ID || 'agent:cmr0b7v0m000gl40dylvf40ln',
  redirectUri: process.env.NOUS_OAUTH_REDIRECT_URI || 'https://hermes.esggo.com/auth/callback',
  apiKeyEnvVar: process.env.NOUS_API_KEY_ENV_VAR || 'NOUS_API_KEY',
};

/**
 * Validate OAuth callback state and exchange code for token
 */
export const nousOAuthCallback = functions.onRequest(async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).send({ error: 'method_not_allowed' });
    return;
  }

  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    res.status(401).send({ error: 'oauth_denied', error_description: error });
    return;
  }

  if (!code || !state) {
    res.status(400).send({ error: 'missing_parameters', required: ['code', 'state'] });
    return;
  }

  // Verify state (CSRF protection)
  const expectedState = req.cookies?.['nous_oauth_state'];
  if (state !== expectedState) {
    res.status(401).send({ error: 'invalid_state' });
    return;
  }

  try {
    // Exchange code for access token (Nous OAuth token endpoint)
    const tokenResponse = await fetch(`${NOUS_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
      }),
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      throw new Error(`token_exchange_failed: ${tokenResponse.status} ${errBody}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Store token in Firebase (user-scoped)
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    await admin.firestore().collection('users').doc(uid).set({
      nousAccessToken: accessToken,
      nousTokenExpiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Clear state cookie
    res.setHeader('Set-Cookie', 'nous_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict');

    res.status(200).json({
      success: true,
      message: 'Nous OAuth callback processed',
      uid,
      tokenStored: true,
    });
  } catch (err: any) {
    console.error('Nous OAuth callback error:', err);
    res.status(500).json({ error: 'callback_processing_failed', detail: err.message });
  }
});

/**
 * Retrieve Nous API key from Firebase user document and make inference request
 */
export const nousInference = functions.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send({ error: 'method_not_allowed' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!idToken) {
    res.status(401).send({ error: 'missing_token' });
    return;
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch {
    res.status(401).send({ error: 'invalid_token' });
    return;
  }

  const uid = decoded.uid;
  const userDoc = await admin.firestore().collection('users').doc(uid).get();
  const userData = userDoc.data();

  if (!userData?.nousAccessToken) {
    res.status(401).send({ error: 'nous_not_connected' });
    return;
  }

  const { prompt, model, max_tokens, temperature, stream } = req.body || {};

  if (!prompt) {
    res.status(400).send({ error: 'missing_prompt' });
    return;
  }

  try {
    const inferenceResponse = await fetch(`${NOUS_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userData.nousAccessToken}`,
      },
      body: JSON.stringify({
        model: model || 'Hermes-4.3-36B',
        prompt,
        max_tokens: max_tokens || 60,
        temperature: temperature ?? 0.8,
        stream: stream ?? false,
      }),
    });

    if (!inferenceResponse.ok) {
      const errBody = await inferenceResponse.text();
      throw new Error(`inference_failed: ${inferenceResponse.status} ${errBody}`);
    }

    const inferenceData = await inferenceResponse.json();
    res.status(200).json(inferenceData);
  } catch (err: any) {
    console.error('Nous inference error:', err);
    res.status(500).json({ error: 'inference_failed', detail: err.message });
  }
});
