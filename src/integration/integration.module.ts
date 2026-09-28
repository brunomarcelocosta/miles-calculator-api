import { Module } from '@nestjs/common';
import { IntegrationController, IntegrationGuard } from './integration.controller';

@Module({
  controllers: [IntegrationController],
  providers: [IntegrationGuard],
})
export class IntegrationModule {}
