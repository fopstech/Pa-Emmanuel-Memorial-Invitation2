import { Router, type IRouter } from "express";
import {
  AdminLoginBody,
} from "@workspace/api-zod";
import {
  accessCodeMatches,
  clearUsherSession,
  getUsherSession,
  setUsherSession,
  usherIsConfigured,
} from "../lib/admin-auth";

const router: IRouter = Router();

router.post("/usher/login", (req, res) => {
  const { accessCode } = AdminLoginBody.parse(req.body);
  if (!usherIsConfigured()) {
    res.status(503).json({ error: "Usher access is not configured." });
    return;
  }
  if (!accessCodeMatches(accessCode, "usher")) {
    res.status(401).json({ error: "Incorrect usher access code." });
    return;
  }
  setUsherSession(res);
  res.json({ authenticated: true, username: "usher" });
});

router.post("/usher/logout", (_req, res) => {
  clearUsherSession(res);
  res.status(204).send();
});

router.get("/usher/session", (req, res) => {
  if (!getUsherSession(req)) {
    res.status(401).json({ error: "Usher authentication required." });
    return;
  }
  res.json({ authenticated: true, username: "usher" });
});

export default router;