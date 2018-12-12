const express = require('express');
const docusignModel = require('./docusignModel');
const moment = require('moment');
const passport = require('passport');
const docusign = require('docusign-esign');

const {
  ensureAuthenticated,
  ensureAuthenticatedRedirect,
  updateUser,
} = require('./dsMiddleware');

const router = express.Router();

const docusignStrategy = new docusign.OAuthClient(
  {
    clientID: process.env.DOCUSIGN_CLIENT_ID,
    clientSecret: process.env.DOCUSIGN_CLIENT_SECRET,
    callbackURL:
      process.env.DOCUSIGN_CALLBACK_URL ||
      'http://localhost:9000/auth/docusign/callback',
    passReqToCallback: true,
    sandbox: true,
    state: true,
  },
  async (req, accessToken, refreshToken, params, user, done) => {
    user.accessToken = accessToken;
    user.refreshToken = refreshToken;
    user.expiresIn = params.expires_in;
    user.expires = moment().add(user.expiresIn, 's');
    await updateUser(req, user);
    return done(null, user);
  }
);

docusignStrategy.authorizationParams = () => ({ prompt: 'login' });

passport.use(docusignStrategy);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

router.get('/', ensureAuthenticatedRedirect, passport.authorize('docusign'));

router.get(
  '/callback',
  ensureAuthenticatedRedirect,
  passport.authorize('docusign', {
    failureRedirect: '/auth/docusign',
  }),
  (req, res) => res.redirect(process.env.ORIGIN || 'http://localhost:3000')
);

// Unlink a user from docusign
router.get('/logout', ensureAuthenticated, async (req, res) => {
  try {
    await docusignModel.updateInfo(req.user.account_id, {
      user_id: null,
      token_expiration: null,
      base_uri: null,
      access_token: null,
      refresh_token: null,
    });

    req.user.account_id = null;
    req.user.token_expiration = null;
    req.user.base_uri = null;
    req.user.access_token = null;
    req.user.refresh_token = null;
    req.session.save();
    return res.sendStatus(200);
  } catch (err) {
    return es.status(500).json(err);
  }
});

module.exports = router;
