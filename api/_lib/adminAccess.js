const DEFAULT_ADMIN_EMAILS = ["ronnywoods77@gmail.com"];

function getAdminEmails() {
  const configured = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return new Set([...DEFAULT_ADMIN_EMAILS, ...configured]);
}

function isAdminEmail(email) {
  if (!email) {
    return false;
  }

  return getAdminEmails().has(String(email).trim().toLowerCase());
}

module.exports = {
  isAdminEmail
};
