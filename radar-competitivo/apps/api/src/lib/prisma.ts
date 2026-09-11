import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.isProd ? ['error', 'warn'] : ['error', 'warn'],
  });

if (!config.isProd) globalForPrisma.prisma = prisma;
