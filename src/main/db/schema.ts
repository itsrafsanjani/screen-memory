import { sqliteTable, integer, text, real, index } from 'drizzle-orm/sqlite-core'

export const screenshots = sqliteTable(
  'screenshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: integer('timestamp').notNull(),
    displayId: text('display_id').notNull(),
    filePath: text('file_path').notNull(),
    width: integer('width'),
    height: integer('height'),
    fileSize: integer('file_size'),
    isIdle: integer('is_idle').notNull().default(0)
  },
  (t) => [index('idx_screenshots_timestamp').on(t.timestamp)]
)

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

export const gitCommits = sqliteTable(
  'git_commits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    repoPath: text('repo_path').notNull(),
    repoName: text('repo_name').notNull(),
    commitHash: text('commit_hash').notNull().unique(),
    timestamp: integer('timestamp').notNull(),
    authorName: text('author_name'),
    authorEmail: text('author_email'),
    message: text('message').notNull(),
    filesChanged: integer('files_changed').notNull().default(0),
    insertions: integer('insertions').notNull().default(0),
    deletions: integer('deletions').notNull().default(0)
  },
  (t) => [index('idx_git_commits_timestamp').on(t.timestamp)]
)

export const gitRepos = sqliteTable('git_repos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path').notNull().unique(),
  name: text('name').notNull(),
  isExcluded: integer('is_excluded').notNull().default(0),
  lastScanned: integer('last_scanned').notNull().default(0)
})

export const ocrResults = sqliteTable(
  'ocr_results',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    screenshotId: integer('screenshot_id'),
    timestamp: integer('timestamp').notNull(),
    displayId: text('display_id').notNull(),
    isIdle: integer('is_idle').notNull().default(0),
    text: text('text').notNull(),
    confidence: real('confidence').notNull().default(0)
  },
  (t) => [
    index('idx_ocr_screenshot').on(t.screenshotId),
    index('idx_ocr_timestamp').on(t.timestamp)
  ]
)

export type ScreenshotRow = typeof screenshots.$inferSelect
export type NewScreenshot = typeof screenshots.$inferInsert
export type GitCommitRow = typeof gitCommits.$inferSelect
export type NewGitCommit = typeof gitCommits.$inferInsert
export type GitRepoRow = typeof gitRepos.$inferSelect
export type OcrResultRow = typeof ocrResults.$inferSelect
export type NewOcrResult = typeof ocrResults.$inferInsert
