/*
  Warnings:

  - You are about to drop the `Configuration` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Execution` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PromptTemplate` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Repository` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Task` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TaskLog` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "Configuration_scope_idx";

-- DropIndex
DROP INDEX "Configuration_key_key";

-- DropIndex
DROP INDEX "Execution_taskId_stage_idx";

-- DropIndex
DROP INDEX "PromptTemplate_category_idx";

-- DropIndex
DROP INDEX "PromptTemplate_name_key";

-- DropIndex
DROP INDEX "Repository_enabled_idx";

-- DropIndex
DROP INDEX "Repository_slug_key";

-- DropIndex
DROP INDEX "Task_createdBy_idx";

-- DropIndex
DROP INDEX "Task_workspaceId_idx";

-- DropIndex
DROP INDEX "Task_repositoryId_idx";

-- DropIndex
DROP INDEX "Task_status_idx";

-- DropIndex
DROP INDEX "Task_publicId_key";

-- DropIndex
DROP INDEX "TaskLog_taskId_createdAt_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Configuration";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Execution";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PromptTemplate";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Repository";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Task";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TaskLog";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workDir" TEXT NOT NULL,
    "containerId" TEXT,
    "providerId" TEXT,
    "model" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Workspace_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Workspace" ("active", "containerId", "createdAt", "id", "model", "name", "providerId", "tenantId", "updatedAt", "workDir") SELECT "active", "containerId", "createdAt", "id", "model", "name", "providerId", "tenantId", "updatedAt", "workDir" FROM "Workspace";
DROP TABLE "Workspace";
ALTER TABLE "new_Workspace" RENAME TO "Workspace";
CREATE INDEX "Workspace_tenantId_active_idx" ON "Workspace"("tenantId", "active");
CREATE UNIQUE INDEX "Workspace_tenantId_name_key" ON "Workspace"("tenantId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
