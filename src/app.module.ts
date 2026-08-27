import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from '@/prisma/prisma.module';
import { HealthModule } from '@/health/health.module';
import { LeadsModule } from '@/leads/leads.module';
import { AuthModule } from '@/auth/auth.module';
import { AdminModule } from '@/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: 60_000,
          limit: 10,
        },
      ],
    }),
    PrismaModule,
    HealthModule,
    LeadsModule,
    AuthModule,
    AdminModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
