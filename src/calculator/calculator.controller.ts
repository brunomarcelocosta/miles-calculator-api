import { Controller, Get, Query } from "@nestjs/common";
import { catalog } from "@/domain/diagnostic/diagnostic";
import { QUESTIONS } from "@/domain/config/questionCatalog";

@Controller("calculator")
export class CalculatorController {
  @Get("quiz")
  quiz(@Query("version") version?: string) {
    if (version === "2") return catalog;
    return {
      version: 1,
      questions: QUESTIONS,
    };
  }
}
