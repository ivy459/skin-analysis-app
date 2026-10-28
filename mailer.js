const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
  connectionTimeout: 8000,
  socketTimeout: 8000,
});

async function sendResetEmail(to, link) {
  await transporter.sendMail({
    from: `"Skin Analysis" <${process.env.MAIL_USER}>`,
    to,
    subject: "Reset your password",
    text: `Use this link to reset your password. It expires in 30 minutes:\n\n${link}\n\nIf you didn't ask for this, ignore this email.`,
    html: `<p>Use this link to reset your password. It expires in 30 minutes:</p><p><a href="${link}">Reset password</a></p><p>If you didn't ask for this, ignore this email.</p>`,
  });
}

module.exports = { sendResetEmail };