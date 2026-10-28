"use strict";

const crypto = require("node:crypto");
const nodemailer = require("nodemailer");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Set these with `firebase functions:secrets:set SECRET_NAME` before deploying.
const SMTP_HOST = defineSecret("SMTP_HOST");
const SMTP_PORT = defineSecret("SMTP_PORT");
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");
const MAIL_FROM = defineSecret("MAIL_FROM");
const OTP_HMAC_SECRET = defineSecret("OTP_HMAC_SECRET");
const mailSecrets = [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, OTP_HMAC_SECRET];

const CODE_TTL_MS = 10 * 60 * 1000;
const PROOF_TTL_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  if (typeof value !== "string") throw new HttpsError("invalid-argument", "Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new HttpsError("invalid-argument", "Enter a valid email address.");
  return email;
}
function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}
function hmac(value) {
  return crypto.createHmac("sha256", OTP_HMAC_SECRET.value()).update(String(value)).digest("hex");
}
function equalHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
async function consumeRateLimit(id, max, windowMs, cooldownMs = 0) {
  const ref = db.collection("authRateLimits").doc(id);
  const now = Date.now();
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data() : {};
    const inWindow = Number(current.windowStart || 0) && now - Number(current.windowStart) < windowMs;
    const windowStart = inWindow ? Number(current.windowStart) : now;
    const count = inWindow ? Number(current.count || 0) : 0;
    const lastAt = Number(current.lastAt || 0);
    if (count >= max) return { ok: false, reason: "limit" };
    if (cooldownMs && lastAt && now - lastAt < cooldownMs) return { ok: false, reason: "cooldown" };
    tx.set(ref, { windowStart, count: count + 1, lastAt: now, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true };
  });
}
function makeMailer() {
  const port = Number(SMTP_PORT.value() || 587);
  return nodemailer.createTransport({
    host: SMTP_HOST.value(),
    port,
    secure: port === 465,
    auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() }
  });
}

exports.sendSignupCode = onCall({ region: "us-central1", secrets: mailSecrets, timeoutSeconds: 30, maxInstances: 5 }, async request => {
  const email = normalizeEmail(request.data?.email);
  const emailKey = sha256(email);
  const ip = String(request.rawRequest?.ip || "unknown");
  const ipLimit = await consumeRateLimit("ip-" + sha256(ip), 20, DAY_MS);
  if (!ipLimit.ok) throw new HttpsError("resource-exhausted", "Too many verification attempts from this connection. Try again later.");
  const emailLimit = await consumeRateLimit("email-" + emailKey, 5, DAY_MS, 60 * 1000);
  if (!emailLimit.ok) throw new HttpsError("resource-exhausted", "A code was sent recently or the daily limit was reached. Wait before requesting another code.");

  try {
    await admin.auth().getUserByEmail(email);
    throw new HttpsError("already-exists", "An account may already exist with this email. Please log in instead.");
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error.code !== "auth/user-not-found") {
      logger.error("Unable to check account before email verification", error);
      throw new HttpsError("internal", "Could not start email verification. Try again later.");
    }
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const codeRef = db.collection("signupCodes").doc(emailKey);
  await codeRef.set({
    email,
    codeHash: hmac("code:" + email + ":" + code),
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
    verified: false,
    proofHash: null,
    proofExpiresAt: 0,
    proofUsed: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  try {
    const mailer = makeMailer();
    await mailer.sendMail({
      from: MAIL_FROM.value(),
      to: email,
      subject: "Your ALLEY Cloud verification code",
      text: `Your ALLEY Cloud verification code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#14243b"><div style="background:#081326;padding:24px;border-radius:16px 16px 0 0;color:#fff;font-size:20px;font-weight:800">ALLEY Cloud</div><div style="padding:24px;border:1px solid #e3e9f2;border-top:0;border-radius:0 0 16px 16px"><h1 style="font-size:22px">Verify your email</h1><p>Use this six-digit code to continue creating your ALLEY Cloud account:</p><div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#f2f7fd;text-align:center;padding:18px;border-radius:12px">${code}</div><p>This code expires in <strong>10 minutes</strong>. If you did not request it, you can safely ignore this email.</p></div></div>`
    });
    return { ok: true };
  } catch (error) {
    await codeRef.delete().catch(() => {});
    logger.error("Unable to send signup verification email", error);
    throw new HttpsError("internal", "The verification email could not be sent. Check the configured email provider and try again.");
  }
});

exports.verifySignupCode = onCall({ region: "us-central1", secrets: [OTP_HMAC_SECRET], timeoutSeconds: 15, maxInstances: 5 }, async request => {
  const email = normalizeEmail(request.data?.email);
  const code = String(request.data?.code || "").trim();
  if (!/^\d{6}$/.test(code)) throw new HttpsError("invalid-argument", "Enter the six-digit code from your email.");
  const emailKey = sha256(email);
  const ref = db.collection("signupCodes").doc(emailKey);
  const proof = crypto.randomBytes(32).toString("base64url");
  const proofHash = hmac("proof:" + email + ":" + proof);
  const now = Date.now();
  const result = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return "missing";
    const record = snap.data();
    if (record.email !== email) return "missing";
    if (Number(record.expiresAt || 0) < now) return "expired";
    if (Number(record.attempts || 0) >= 5) return "locked";
    const submittedHash = hmac("code:" + email + ":" + code);
    if (!equalHex(record.codeHash, submittedHash)) {
      tx.update(ref, { attempts: Number(record.attempts || 0) + 1 });
      return "invalid";
    }
    tx.update(ref, {
      verified: true,
      proofHash,
      proofExpiresAt: now + PROOF_TTL_MS,
      proofUsed: false,
      codeHash: null,
      attempts: 0
    });
    return "ok";
  });
  if (result !== "ok") {
    const messages = {
      missing: "No verification request was found. Request a new code.",
      expired: "That code expired. Request a new code.",
      locked: "Too many incorrect attempts. Request a new code.",
      invalid: "That code is incorrect. Check the email and try again."
    };
    throw new HttpsError("permission-denied", messages[result] || "Verification failed.");
  }
  return { proof, expiresInSeconds: Math.floor(PROOF_TTL_MS / 1000) };
});

exports.createAccountWithPassword = onCall({ region: "us-central1", secrets: [OTP_HMAC_SECRET], timeoutSeconds: 30, maxInstances: 5 }, async request => {
  const email = normalizeEmail(request.data?.email);
  const proof = String(request.data?.proof || "");
  const password = String(request.data?.password || "");
  const name = typeof request.data?.name === "string" ? request.data.name.trim().slice(0, 80) : "";
  if (!proof || proof.length > 128) throw new HttpsError("failed-precondition", "Verify your email before creating the account.");
  if (password.length < 8 || password.length > 128) throw new HttpsError("invalid-argument", "Use a password between 8 and 128 characters.");
  if (name.length < 2) throw new HttpsError("invalid-argument", "Enter your name.");

  const emailKey = sha256(email);
  const ref = db.collection("signupCodes").doc(emailKey);
  const suppliedProofHash = hmac("proof:" + email + ":" + proof);
  const now = Date.now();
  const proofValid = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const record = snap.data();
    if (record.email !== email || !record.verified || record.proofUsed) return false;
    if (Number(record.proofExpiresAt || 0) < now) return false;
    if (!equalHex(record.proofHash, suppliedProofHash)) return false;
    tx.update(ref, { proofUsed: true, proofUsedAt: now });
    return true;
  });
  if (!proofValid) throw new HttpsError("failed-precondition", "Your email verification expired or was already used. Request a new code.");

  let user;
  try {
    user = await admin.auth().createUser({ email, password, displayName: name, emailVerified: true, disabled: false });
  } catch (error) {
    if (error.code === "auth/email-already-exists") throw new HttpsError("already-exists", "An account already exists with this email. Please log in.");
    logger.error("Failed to create verified user", error);
    throw new HttpsError("internal", "The account could not be created. Try again or contact support.");
  }
  await db.collection("users").doc(user.uid).set({
    uid: user.uid,
    email,
    displayName: name,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    plan: "Free"
  }, { merge: true });
  const customToken = await admin.auth().createCustomToken(user.uid);
  await ref.delete().catch(() => {});
  return { customToken, uid: user.uid, email, displayName: name };
});
