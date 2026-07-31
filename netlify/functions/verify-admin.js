// netlify/functions/verify-admin.js
//
// Confirms whether the currently-signed-in Netlify Identity user is
// allowed into the admin dashboard.
//
// The browser sends its Netlify Identity access token in the
// Authorization header. Netlify itself verifies that token and, if
// it's genuine, populates `context.clientContext.user` before this
// function ever runs — the browser has no way to fake that object,
// so this is a real server-side check, not a client-side one.
//
// The allowed email is read from the ADMIN_EMAIL environment variable
// so it's easy to change without touching code. If it's not set, it
// falls back to the address the site was set up for.

const DEFAULT_ADMIN_EMAIL = "dndflush@gmail.com";

exports.handler = async (event, context) => {
  const user = context.clientContext && context.clientContext.user;

  if (!user || !user.email) {
    // No token, or an invalid/expired one — Netlify would not have
    // populated clientContext.user in that case.
    return respond(200, { authorized: false });
  }

  const adminEmail = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const authorized = user.email.trim().toLowerCase() === adminEmail;

  return respond(200, { authorized });
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
