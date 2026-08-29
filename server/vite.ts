import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { logger } from "./logger";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  logger.info(source.toUpperCase(), message);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        // Не убиваем dev-процесс на каждую ошибку Vite (в т.ч. временные
        // ошибки HMR/трансформации): Vite сам восстанавливается. Фатальные
        // ошибки всё равно видны в логах и падают на верхнем уровне.
        viteLogger.error(msg, options);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    // Несуществующий /api/* не должен отдавать index.html (SPA): клиенты
    // ждут JSON и ломаются на HTML. Отвечаем корректным 404.
    if (url.startsWith("/api/")) {
      return res.status(404).json({ error: "not_found", message: "Не найдено" });
    }

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "..", "dist", "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      // Explicitly set Content-Type based on file extension
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.css') {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
      } else if (ext === '.js' || ext === '.mjs') {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (ext === '.json') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      } else if (ext === '.svg') {
        res.setHeader('Content-Type', 'image/svg+xml');
      } else if (ext === '.woff2') {
        res.setHeader('Content-Type', 'font/woff2');
      } else if (ext === '.woff') {
        res.setHeader('Content-Type', 'font/woff');
      }
    }
  }));

  app.use("*", (req, res) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: "not_found", message: "Не найдено" });
      return;
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
