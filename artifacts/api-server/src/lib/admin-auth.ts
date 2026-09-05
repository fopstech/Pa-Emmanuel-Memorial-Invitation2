import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const ADMIN_COOKIE_NAME = "memorial_admin";
const USHER_COOKIE_NAME = "memorial_usher";
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

function encodeSession(identity: string) {
  const payload = `${identity}.${Date.now()}`;
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
  const identity = payload.slice(0, separator);
  const issuedAt = Number(payload.slice(separator + 1));
  if (!identity || !Number.isFinite(issuedAt)) return null;
  if (Date.now() - issuedAt > SESSION_TTL_SECONDS * 1000) return null;
  return identity;
}

export function adminIsConfigured() {
  return Boolean(secret());
}

export function usherIsConfigured() {
  return Boolean(secret());
}

function setSession(res: Response, cookieName: string, identity: string) {
  res.cookie(cookieName, encodeSession(identity), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: "/",
  });
}

export function setAdminSession(res: Response) {
  setSession(res, ADMIN_COOKIE_NAME, "admin");
}

export function setUsherSession(res: Response) {
  setSession(res, USHER_COOKIE_NAME, "usher");
}

export function clearAdminSession(res: Response) {
  res.clearCookie(ADMIN_COOKIE_NAME, { httpOnly: true, sameSite: "lax", path: "/" });
}

export function clearUsherSession(res: Response) {
  res.clearCookie(USHER_COOKIE_NAME, { httpOnly: true, sameSite: "lax", path: "/" });
}

export function getAdminUsername(req: Request) {
  return decodeSession(req.cookies?.[ADMIN_COOKIE_NAME]) === "admin" ? "administrator" : null;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const username = getAdminUsername(req);
  if (!username) {
    res.status(401).json({ error: "Administrator authentication required." });
    return;
  }
  next();
}

export function getUsherSession(req: Request) {
  return decodeSession(req.cookies?.[USHER_COOKIE_NAME]) === "usher";
}

export function requireUsher(req: Request, res: Response, next: NextFunction) {
  if (!getUsherSession(req)) {
    res.status(401).json({ error: "Usher authentication required." });
    return;
  }
  next();
}

export function accessCodeMatches(code: string, role: "admin" | "usher") {
  const configuredCode =
    role === "admin"
      ? process.env.ADMIN_ACCESS_CODE ?? "2011"
      : process.env.USHER_ACCESS_CODE ?? "30";
  return safeEqual(code, configuredCode);
}