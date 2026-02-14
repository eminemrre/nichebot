const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'nichebot.db');

let db;

/**
 * Veritabanını başlat ve tabloları oluştur
 */
function initDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Nişler tablosu
  db.exec(`
    CREATE TABLE IF NOT EXISTS niches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      tone TEXT DEFAULT 'bilgilendirici',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Üretilen postlar
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      niche_id INTEGER,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'tweet',
      status TEXT DEFAULT 'draft',
      twitter_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      posted_at DATETIME,
      FOREIGN KEY (niche_id) REFERENCES niches(id)
    )
  `);

  // Profil analizi sonuçları
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      twitter_handle TEXT,
      analysis TEXT,
      topics TEXT,
      tone TEXT,
      suggestions TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Zamanlama ayarları
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      niche_id INTEGER,
      cron_expression TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      last_run DATETIME,
      FOREIGN KEY (niche_id) REFERENCES niches(id)
    )
  `);

  // Ayarlar
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  logger.info('Veritabanı hazır', { path: DB_PATH });
  return db;
}

/**
 * DB bağlantısını kapat (graceful shutdown)
 */
function closeDatabase() {
  if (db) {
    db.close();
    logger.info('Veritabanı bağlantısı kapatıldı');
  }
}

// === Niş İşlemleri ===

function addNiche(name, description = '', tone = 'bilgilendirici') {
  const stmt = db.prepare('INSERT OR IGNORE INTO niches (name, description, tone) VALUES (?, ?, ?)');
  const result = stmt.run(name.toLowerCase().trim(), description, tone);
  return result.changes > 0 ? getNicheByName(name) : null;
}

function getNicheByName(name) {
  return db.prepare('SELECT * FROM niches WHERE name = ? AND active = 1').get(name.toLowerCase().trim());
}

function getAllNiches() {
  return db.prepare('SELECT * FROM niches WHERE active = 1 ORDER BY created_at DESC').all();
}

function removeNiche(name) {
  const stmt = db.prepare('UPDATE niches SET active = 0 WHERE name = ?');
  return stmt.run(name.toLowerCase().trim()).changes > 0;
}

// === Post İşlemleri ===

function savePost(nicheId, content, type = 'tweet', status = 'draft') {
  const stmt = db.prepare('INSERT INTO posts (niche_id, content, type, status) VALUES (?, ?, ?, ?)');
  return stmt.run(nicheId, content, type, status);
}

function markPostAsPublished(postId, twitterId = null) {
  const stmt = db.prepare('UPDATE posts SET status = ?, twitter_id = ?, posted_at = CURRENT_TIMESTAMP WHERE id = ?');
  return stmt.run('published', twitterId, postId);
}

function getLastDraftPost() {
  return db.prepare('SELECT * FROM posts WHERE status = ? ORDER BY created_at DESC LIMIT 1').get('draft');
}

function getTodayPostCount() {
  return db.prepare(
    "SELECT COUNT(*) as count FROM posts WHERE status = 'published' AND date(posted_at) = date('now')"
  ).get().count;
}

function getPostStats() {
  return db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
      SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as drafts,
      SUM(CASE WHEN date(posted_at) = date('now') THEN 1 ELSE 0 END) as today
    FROM posts
  `).get();
}

/**
 * Belirli bir niş için son paylaşımları getir (tekrar önleme için)
 * BUG FIX: Önceki versiyon bozuktu, her çağrıda yeni DB açıyordu
 */
function getRecentPostsByNiche(nicheId, limit = 10) {
  try {
    return db.prepare(
      'SELECT content FROM posts WHERE niche_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(nicheId, limit);
  } catch {
    return [];
  }
}

// === Profil Analizi ===

function saveProfileAnalysis(handle, analysis, topics, tone, suggestions) {
  const stmt = db.prepare(
    'INSERT INTO profile_analysis (twitter_handle, analysis, topics, tone, suggestions) VALUES (?, ?, ?, ?, ?)'
  );
  return stmt.run(handle, analysis, JSON.stringify(topics), tone, JSON.stringify(suggestions));
}

function getLatestProfileAnalysis(handle) {
  return db.prepare(
    'SELECT * FROM profile_analysis WHERE twitter_handle = ? ORDER BY created_at DESC LIMIT 1'
  ).get(handle);
}

// === Zamanlama ===

function addSchedule(nicheId, cronExpression) {
  const stmt = db.prepare('INSERT INTO schedules (niche_id, cron_expression) VALUES (?, ?)');
  return stmt.run(nicheId, cronExpression);
}

function getActiveSchedules() {
  return db.prepare(`
    SELECT s.*, n.name as niche_name 
    FROM schedules s 
    JOIN niches n ON s.niche_id = n.id 
    WHERE s.active = 1 AND n.active = 1
  `).all();
}

function removeSchedulesByNiche(nicheId) {
  return db.prepare('UPDATE schedules SET active = 0 WHERE niche_id = ?').run(nicheId);
}

function updateScheduleLastRun(scheduleId) {
  return db.prepare('UPDATE schedules SET last_run = CURRENT_TIMESTAMP WHERE id = ?').run(scheduleId);
}

// === Ayarlar ===

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function getSetting(key, defaultValue = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

module.exports = {
  initDatabase,
  closeDatabase,
  addNiche,
  getNicheByName,
  getAllNiches,
  removeNiche,
  savePost,
  markPostAsPublished,
  getLastDraftPost,
  getTodayPostCount,
  getPostStats,
  getRecentPostsByNiche,
  saveProfileAnalysis,
  getLatestProfileAnalysis,
  addSchedule,
  getActiveSchedules,
  removeSchedulesByNiche,
  updateScheduleLastRun,
  setSetting,
  getSetting,
};
