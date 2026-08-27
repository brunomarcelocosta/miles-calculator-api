import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';

const COOKIE_NAME = 'session';
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

const loginSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Email e senha são obrigatórios.');
    }

    const { email, password } = parsed.data;
    const user = await this.authService.validateUser(email, password);

    const token = this.authService.signToken({
      sub: user.id,
      email: user.email,
    });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: EIGHT_HOURS_MS,
      path: '/',
    });

    return { user: { id: user.id, email: user.email, name: user.name } };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: Request) {
    const user = (req as any).user;
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  }
}
