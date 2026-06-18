const fs = require("fs");
const path = require("path");

let cachedCatalog;

function readCatalog() {
  if (cachedCatalog) {
    return cachedCatalog;
  }

  const catalogPath = path.join(process.cwd(), "data", "courses.json");
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

  cachedCatalog = {
    ...catalog,
    coursesById: new Map(catalog.courses.map((course) => [course.id, course]))
  };

  return cachedCatalog;
}

function getCourse(courseId) {
  const catalog = readCatalog();
  return catalog.coursesById.get(courseId);
}

function toPayPalAmount(course) {
  if (!course || !/^\d+\.\d{2}$/.test(course.price)) {
    throw new Error(`Invalid course price for ${course && course.id}`);
  }

  return {
    currency_code: readCatalog().currency,
    value: course.price
  };
}

module.exports = {
  getCourse,
  readCatalog,
  toPayPalAmount
};
