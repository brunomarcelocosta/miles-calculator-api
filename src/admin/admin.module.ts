import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { AdminController } from './admin.controller';
import { IntegrationController, IntegrationGuard } from './integration.controller';

@Module({
  imports: [AuthModule],
  controllers: [AdminController, IntegrationController],
  providers: [IntegrationGuard],
})
export class AdminModule {}
