'use strict';

// Catalyst custom user validation. This Procurement installation is strictly
// invitation-only: identities are created by the administrator through
// procurement_api, never through a public registration or approval workflow.
//
// The platform may expose its generic signup endpoint, so this function is the
// enforcement point. It fails closed for every request and always writes an
// explicit response before completing.
const { deny } = require('./signup');

module.exports = async (context, basicIO) => {
  try {
    basicIO.write(JSON.stringify(deny()));
  } catch (err) {
    console.error('[SignupGate] could not deny public signup:', err?.message);
  } finally {
    try {
      context.close();
    } catch (err) {
      console.error('[SignupGate] context.close() failed:', err?.message);
    }
  }
};
