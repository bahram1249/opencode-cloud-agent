import { PrismaClient } from '@prisma/client';
import { relative } from 'node:path';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Migration already applied — columns renamed in schema.');

  const workspaces = await prisma.workspace.findMany({
    include: { projects: true },
  });

  let projUpdated = 0;
  for (const ws of workspaces) {
    for (const proj of ws.projects) {
      if (proj.path !== '.') continue;
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
