const DEFAULT_FULL_ACCESS_USERS = [
  {
    email: "ronnywoods77@gmail.com",
    role: "admin",
    source: "admin"
  },
  {
    email: "matiasbermudez115@gmail.com",
    role: "professor",
    source: "professor"
  },
  {
    email: "kamilgutierrez4@gmail.com",
    role: "professor",
    source: "professor"
  }
];

function parseEmailList(value) {
  return (value || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function getFullAccessUsers() {
  const users = new Map();

  DEFAULT_FULL_ACCESS_USERS.forEach((user) => {
    users.set(user.email, user);
  });

  parseEmailList(process.env.ADMIN_EMAILS).forEach((email) => {
    users.set(email, {
      email,
      role: "admin",
      source: "admin"
    });
  });

  parseEmailList(process.env.PROFESSOR_EMAILS).forEach((email) => {
    if (!users.has(email)) {
      users.set(email, {
        email,
        role: "professor",
        source: "professor"
      });
    }
  });

  parseEmailList(process.env.FULL_ACCESS_EMAILS).forEach((email) => {
    if (!users.has(email)) {
      users.set(email, {
        email,
        role: "full_access",
        source: "full_access"
      });
    }
  });

  return users;
}

function getFullAccessUser(email) {
  if (!email) {
    return null;
  }

  return getFullAccessUsers().get(String(email).trim().toLowerCase()) || null;
}

function isAdminEmail(email) {
  const user = getFullAccessUser(email);
  return Boolean(user && user.role === "admin");
}

function hasFullCourseAccess(email) {
  return Boolean(getFullAccessUser(email));
}

module.exports = {
  getFullAccessUser,
  hasFullCourseAccess,
  isAdminEmail
};
