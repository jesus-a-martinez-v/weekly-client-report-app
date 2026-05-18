import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error("Usage: npx tsx scripts/hash-password.ts <password>");
  process.exit(1);
}

bcrypt.hash(password, 12).then((hash) => {
  console.log(hash);
  console.log("\nPaste the hash above into ADMIN_PASSWORD_HASH in your .env.local");
});
