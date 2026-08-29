import "./config";

import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { logger, LogContext } from "./logger";
import { inviteRegisterSchema, registerSchema } from "@shared/validation";
import { sanitizeUser } from "@shared/utils";
import { TRUSTED_PROXY_HOPS } from "@shared/constants";
import { issueCsrfToken } from "./csrf";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret && process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET environment variable is required in production');
  }
  
  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret || 'dev-secret-only-for-development',
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000,
    },
  };

  // Доверяем ровно TRUSTED_PROXY_HOPS ближайшим прокси при вычислении req.ip
  // (на Render — один балансировщик). То же число используется в
  // server/client-ip.ts для WS-лимитера, чтобы IP клиента считался одинаково.
  app.set("trust proxy", TRUSTED_PROXY_HOPS);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // CSRF-токен выдаётся лениво и только по явному запросу — БЕЗ обращения к
  // сессии (см. server/csrf.ts). Раньше здесь стоял глобальный middleware,
  // который писал req.session.csrfToken на КАЖДЫЙ запрос и тем самым заводил
  // сессию для любого анонимного/статического/ботового обращения, обесценивая
  // saveUninitialized:false. Теперь сессия создаётся только при логине.
  app.get("/api/csrf-token", (req, res) => {
    const csrfToken = issueCsrfToken(req, res);
    res.json({ csrfToken });
  });

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      const user = await storage.getUserByUsername(username);
      if (!user || !(await comparePasswords(password, user.password))) {
        return done(null, false);
      } else {
        return done(null, user);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const validationResult = registerSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "validation_failed",
          details: validationResult.error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }

      const { email, username, password } = validationResult.data;
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({
          error: "already_exists",
          message: "Пользователь с таким именем уже существует"
        });
      }

      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({
          error: "email_already_exists",
          message: "Пользователь с таким email уже существует"
        });
      }

      const user = await storage.createUser({
        email,
        username,
        password: await hashPassword(password),
      });

      // Создаём пару для нового пользователя (main_admin)
      const couple = await storage.createCouple(user.id);
      const updatedUser = await storage.updateUser(user.id, {
        coupleId: couple.id,
        role: "main_admin",
      });

      req.login(updatedUser, (err) => {
        if (err) return next(err);
        res.status(201).json(sanitizeUser(updatedUser));
      });
    } catch (error) {
      logger.error(LogContext.AUTH, "Error registering user", error);
      res.status(500).json({ error: "Failed to register user" });
    }
  });

  const registerWithInvite = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validationResult = inviteRegisterSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "validation_failed",
          details: validationResult.error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }

      const { email, username, password, inviteCode } = validationResult.data;

      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }

      const couple = await storage.getCoupleByInviteCode(inviteCode);
      if (!couple) {
        return res.status(400).json({ error: "Invalid invite code" });
      }

      // Создаём пользователя без пары — joinCouple сам назначит coupleId и роль
      const user = await storage.createUser({
        email,
        username,
        password: await hashPassword(password),
      });

      await storage.joinCouple(user.id, inviteCode);
      const updatedUser = await storage.getUser(user.id);
      if (!updatedUser) {
        throw new Error("User not found after invite registration");
      }

      req.login(updatedUser, (err) => {
        if (err) return next(err);
        res.status(201).json(sanitizeUser(updatedUser));
      });
    } catch (error) {
      logger.error(LogContext.AUTH, "Error registering with invite", error);
      res.status(500).json({ error: "Failed to register with invite code" });
    }
  };

  app.post("/api/register-with-invite", registerWithInvite);
  app.post("/api/invite/register", registerWithInvite);

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.status(200).json(sanitizeUser(req.user!));
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(sanitizeUser(req.user!));
  });
}
