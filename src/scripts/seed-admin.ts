import { connectDatabase } from '../config/database';
import { config } from '../config';
import { AdminUser } from '../models/AdminUser';
import { hashPassword } from '../utils/crypto';

async function seed(): Promise<void> {
  await connectDatabase();

  const existing = await AdminUser.findOne({ email: config.admin.defaultEmail });
  if (existing) {
    console.log(`[Seed] Admin user ${config.admin.defaultEmail} already exists, skipping.`);
    process.exit(0);
  }

  const passwordHash = await hashPassword(config.admin.defaultPassword);

  await AdminUser.create({
    email: config.admin.defaultEmail,
    passwordHash,
    role: 'superadmin',
    isActive: true,
  });

  console.log(`[Seed] Created admin user: ${config.admin.defaultEmail}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('[Seed] Failed:', err);
  process.exit(1);
});
