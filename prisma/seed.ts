import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { telegramUserId: 'legacy' },
    update: {},
    create: { telegramUserId: 'legacy', displayName: 'Legacy tenant' },
  });

  const workspace = await prisma.workspace.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'default' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'default',
      workDir: process.env['DEFAULT_WORKSPACE_PATH'] ?? process.cwd(),
      active: true,
    },
  });

  console.log('Seeded workspace:', workspace.name, 'at', workspace.workDir);

  const existing = await prisma.workspaceProject.count({ where: { workspaceId: workspace.id } });
  if (existing === 0) {
    const repoPath = process.env['DEFAULT_REPO_PATH'];
    if (repoPath) {
      await prisma.workspaceProject.create({
        data: { workspaceId: workspace.id, name: 'default', gitPath: repoPath },
      });
      console.log('Added default project:', repoPath);
    }
  }

  console.log('Seed completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
