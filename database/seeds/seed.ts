import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding two independent fake tenants + demo account...');

  const passwordHash = await bcrypt.hash('password123', 10);
  const demoHash = await bcrypt.hash('Demo123!', 10);

  // TENANT A
  const orgA = await prisma.organization.create({
    data: { name: 'Acme Corp', plan: 'professional' },
  });

  const userA = await prisma.user.create({
    data: {
      email: 'admin@acme.com',
      passwordHash,
      tenantId: orgA.id,
      status: 'active',
    },
  });

  // TENANT B
  const orgB = await prisma.organization.create({
    data: { name: 'Globex Inc', plan: 'professional' },
  });

  const userB = await prisma.user.create({
    data: {
      email: 'admin@globex.com',
      passwordHash,
      tenantId: orgB.id,
      status: 'active',
    },
  });

  // DEMO tenant — for Stitch design handoff
  const orgDemo = await prisma.organization.create({
    data: { name: 'Galle Face Hotel Group', plan: 'professional' },
  });

  await prisma.user.create({
    data: {
      email: 'demo@procureflow.io',
      passwordHash: demoHash,
      tenantId: orgDemo.id,
      status: 'active',
    },
  });

  console.log(`✅ Seed complete.`);
  console.log(`Tenant A: ${orgA.id} | User: admin@acme.com / password123`);
  console.log(`Tenant B: ${orgB.id} | User: admin@globex.com / password123`);
  console.log(`Demo: ${orgDemo.id} | User: demo@procureflow.io / Demo123!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
