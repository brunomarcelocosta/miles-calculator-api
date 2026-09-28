import { Controller, Get } from '@nestjs/common';
import { QUESTIONS } from '@/domain/config/questionCatalog';

@Controller('calculator')
export class CalculatorController {
  @Get('quiz')
  quiz() {
    return {
      version: 1,
      questions: QUESTIONS,
    };
  }
}
