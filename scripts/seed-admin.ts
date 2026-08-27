/**
 * Seed do primeiro admin.
 *
 * Uso: npm run seed:admin
 *
 * Se ADMIN_SEED_PASSWORD estiver vazio no .env, gera uma senha aleatória
 * e imprime no console UMA VEZ. Copie e guarde.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

async function main() {
  const prisma = new PrismaClient();

  const email = process.env.ADMIN_SEED_EMAIL || 'admin@travion.com.br';
  let password = process.env.ADMIN_SEED_PASSWORD || '';

  if (!password) {
    password = randomBytes(16).toString('base64url');
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const existing = await prisma.adminUser.findUnique({ where: { email } });

  if (existing) {
    await prisma.adminUser.update({
      where: { email },
      data: { passwordHash },
    });
    console.log(`\n  ✓ Admin atualizado: ${email}`);
  } else {
    await prisma.adminUser.create({
      data: {
        email,
        name: 'Admin Travion',
        passwordHash,
      },
    });
    console.log(`\n  ✓ Admin criado: ${email}`);
  }

  console.log(`  ✓ Senha: ${password}`);
  console.log(`\n  ⚠ Guarde essa senha — ela não será exibida novamente.\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Erro ao criar admin:', err);
  process.exit(1);
});
