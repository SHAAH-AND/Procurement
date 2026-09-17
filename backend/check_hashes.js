const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    const users = await prisma.user.findMany({ select: { id: true, email: true, status: true, tenantId: true, passwordHash: true } });
    console.log('Users and their password hashes:');
    for (const u of users) {
      console.log(`\n${u.email} (${u.status}) — tenant: ${u.tenantId.slice(0,8)}...`);
      console.log('  hash:', u.passwordHash);
      // Try common passwords
      const tests = ['password123', 'password', 'admin', 'Admin@123', 'pass', 'ProcureFlow', 'procureflow1', 'test123', 'demo123', 'nadhir', 'admin123'];
      for (const pw of tests) {
        const ok = await bcrypt.compare(pw, u.passwordHash);
        if (ok) console.log(`  ✅ matches: "${pw}"`);
      }
    }
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
