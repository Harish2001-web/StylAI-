import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("stylesense.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS wardrobe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_data TEXT,
    category TEXT,
    color TEXT,
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS outfits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    items TEXT, -- JSON array of wardrobe IDs
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Request Logger
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  // Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // API Routes
  app.get(["/api/wardrobe", "/api/wardrobe/"], (req, res) => {
    try {
      const items = db.prepare("SELECT * FROM wardrobe ORDER BY created_at DESC").all();
      res.json(items);
    } catch (err) {
      console.error("Fetch Wardrobe Error:", err);
      res.status(500).json({ error: "Failed to fetch wardrobe" });
    }
  });

  app.post(["/api/wardrobe", "/api/wardrobe/"], (req, res) => {
    try {
      const { image_data, category, color, tags } = req.body;
      console.log(`Adding garment: ${category}, ${color}`);
      const info = db.prepare(
        "INSERT INTO wardrobe (image_data, category, color, tags) VALUES (?, ?, ?, ?)"
      ).run(image_data, category, color, tags);
      res.json({ id: info.lastInsertRowid });
    } catch (err: any) {
      console.error("Add Wardrobe Error:", err);
      res.status(500).json({ error: err.message || "Failed to add garment" });
    }
  });

  app.delete(["/api/wardrobe/:id", "/api/wardrobe/:id/"], (req, res) => {
    db.prepare("DELETE FROM wardrobe WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.get(["/api/outfits", "/api/outfits/"], (req, res) => {
    const outfits = db.prepare("SELECT * FROM outfits ORDER BY created_at DESC").all();
    res.json(outfits);
  });

  app.post(["/api/outfits", "/api/outfits/"], (req, res) => {
    const { name, description, items, image_url } = req.body;
    const info = db.prepare(
      "INSERT INTO outfits (name, description, items, image_url) VALUES (?, ?, ?, ?)"
    ).run(name, description, JSON.stringify(items), image_url);
    res.json({ id: info.lastInsertRowid });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
