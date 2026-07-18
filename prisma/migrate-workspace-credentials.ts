import { PrismaClient } from '@prisma/client';
import { relative } from 'node:path';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Running data migration for per-workspace credentials...');

  // 1.5 Copy Tenant.githubToken/githubLogin to each workspace
  const tenants = await prisma.tenant.findMany({
    where: {
      githubToken: { not: null },
    },
    include: { workspaces: true },
  });

  let wsUpdated = 0;
  for (const tenant of tenants) {
    if (!tenant.githubToken) continue;
    for (const ws of tenant.workspaces) {
      if (!ws.githubToken) {
        await prisma.workspace.update({
          where: { id: ws.id },
          data: {
            githubToken: tenant.githubToken,
            githubLogin: tenant.githubLogin,
          },
        });
        wsUpdated++;
      }
    }
  }
  console.log(`Copied GitHub credentials to ${wsUpdated} workspaces`);

  // 1.6 Convert WorkspaceProject.gitPath to relative path
  const workspaces = await prisma.workspace.findMany({
    include: { projects: true },
  });

  let projUpdated = 0;
  for (const ws of workspaces) {
    for (const proj of ws.projects) {
      if (proj.path !== '.') continue; // already migrated or explicitly set
      const relPath = proj.gitPath === ws.workDir
        ? '.'
        : relative(ws.workDir, proj.gitPath).replace(/\\/g, '/');
      await prisma.workspaceProject.update({
        where: { id: proj.id },
        data: { path: relPath },
      });
      projUpdated++;
    }
  }
  console.log(`Converted ${projUpdated} project paths to relative`);

  console.log('Data migration complete.');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
