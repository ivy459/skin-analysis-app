require("dotenv").config();
const { createClient } = require("@libsql/client");

const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;

console.log("TURSO_DATABASE_URL:", url ? "set" : "MISSING");
console.log("TURSO_AUTH_TOKEN:", token ? `set, ${token.length} characters` : "MISSING");
if (!url || !token) process.exit(1);

createClient({ url, authToken: token })
  .execute("SELECT 1 AS ok")
  .then(() => console.log("Connected to Turso: OK"))
  .catch((e) => {
    console.log("Could not connect:", e.message);
    process.exit(1);
  });