import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const COOKIE_NAME = "memorial_admin";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function secret() {
  return process.env.SESSION_SECRET;
}

function sign(value: string) {
  return crypto.createHmac("sha256", secret() ?? "").update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function encodeSession(username: string) {
  const payload = `${username}.${Date.now()}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

function decodeSession(value: string | undefined) {
  if (!value || !secret()) return null;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  if (!safeEqual(sign(payload), signature)) return null;
  const separator = payload.lastIndexOf(".");
  if (separator < 1) return null;
  const username = payload.slice(0, separator);
  const issuedAt = Number(payload.slice(separator + 1));
  if (!username || !Number.isFinite(issuedAt)) return null;
  if (Date.now() - issuedAt > SESSION_TTL_SECONDS * 1000) return null;
  return username;
}

export function adminIsConfigured() {
  return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD && secret());
}

export function setAdminSession(res: Response, username: string) {
  res.cookie(COOKIE_NAME, encodeSession(username), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: "/",
  });
}

export function clearAdminSession(res: Response) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "lax", path: "/" });
}

export function getAdminUsername(req: Request) {
  return decodeSession(req.cookies?.[COOKIE_NAME]);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const username = getAdminUsername(req);
  if (!username) {
    res.status(401).json({ error: "Administrator authentication required." });
    return;
  }
  next();
}

export function credentialsMatch(username: string, password: string) {
  const configuredUsername = process.env.ADMIN_USERNAME;
  const configuredPassword = process.env.ADMIN_PASSWORD;
  return Boolean(
    configuredUsername &&
      configuredPassword &&
      safeEqual(username, configuredUsername) &&
      safeEqual(password, configuredPassword),
  );
}