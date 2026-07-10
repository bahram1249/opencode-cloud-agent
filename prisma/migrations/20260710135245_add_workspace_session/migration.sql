-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "workDir" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WorkspaceProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gitPath" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "remoteUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkspaceProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpenCodeSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "streaming" BOOLEAN NOT NULL DEFAULT true,
    "chatId" TEXT,
    "streamMessageId" INTEGER,
    "pid" INTEGER,
    "output" TEXT NOT NULL DEFAULT '',
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OpenCodeSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "attachments" TEXT DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdBy" TEXT NOT NULL,
    "opencodeProfile" TEXT,
    "branch" TEXT,
    "commitSha" TEXT,
    "tagName" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 1,
    "parentId" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "workspaceId" TEXT,
    "repositoryId" TEXT,
    CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("attachments", "branch", "commitSha", "createdAt", "createdBy", "errorMessage", "finishedAt", "id", "maxRetries", "opencodeProfile", "parentId", "prompt", "publicId", "repositoryId", "retryCount", "startedAt", "status", "tagName", "updatedAt") SELECT "attachments", "branch", "commitSha", "createdAt", "createdBy", "errorMessage", "finishedAt", "id", "maxRetries", "opencodeProfile", "parentId", "prompt", "publicId", "repositoryId", "retryCount", "startedAt", "status", "tagName", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE UNIQUE INDEX "Task_publicId_key" ON "Task"("publicId");
CREATE INDEX "Task_status_idx" ON "Task"("status");
CREATE INDEX "Task_repositoryId_idx" ON "Task"("repositoryId");
CREATE INDEX "Task_workspaceId_idx" ON "Task"("workspaceId");
CREATE INDEX "Task_createdBy_idx" ON "Task"("createdBy");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_name_key" ON "Workspace"("name");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceProject_workspaceId_name_key" ON "WorkspaceProject"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "OpenCodeSession_publicId_key" ON "OpenCodeSession"("publicId");

-- CreateIndex
CREATE INDEX "OpenCodeSession_active_idx" ON "OpenCodeSession"("active");

-- CreateIndex
CREATE INDEX "OpenCodeSession_createdBy_idx" ON "OpenCodeSession"("createdBy");
