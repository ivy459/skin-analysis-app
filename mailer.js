// Part 1: print the reset link in the terminal. Part 2 sends real emails.
async function sendResetEmail(to, link) {
  console.log(`\nPassword reset for ${to}:\n${link}\n`);
}

module.exports = { sendResetEmail };