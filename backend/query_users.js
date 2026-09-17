const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log('Connected to DB');

    const orgs = await prisma.organization.findMany({ select: { id: true, name: true, plan: true, maxUsers: true, createdAt: true } });
    console.log('\n=== ORGANIZATIONS ===');
    orgs.forEach(o => console.log(JSON.stringify(o)));

    const users = await prisma.user.findMany({ select: { id: true, email: true, status: true, tenantId: true, createdAt: true, mfaSecret: true } });
    console.log('\n=== USERS ===');
    users.forEach(u => console.log(JSON.stringify(u)));

    const roles = await prisma.role.findMany({ select: { id: true, name: true } });
    console.log('\n=== ROLES ===');
    roles.forEach(r => console.log(JSON.stringify(r)));

    const userRoles = await prisma.userRole.findMany({ select: { id: true, userId: true, roleId: true } });
    console.log('\n=== USER_ROLES ===');
    userRoles.forEach(ur => console.log(JSON.stringify(ur)));

    console.log('\n=== COUNTS ===');
    console.log('organizations:', orgs.length);
    console.log('users:', users.length);
    console.log('roles:', roles.length);
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
