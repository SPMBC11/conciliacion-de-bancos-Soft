import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  AcceptInvitationRequest,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  LoginRequest,
  ResetPasswordRequest,
} from '@finagent/contracts';
import type { z } from 'zod';
import { config } from '../../config.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { AuthService, type IssuedSession } from './auth.service.js';
import {
  clearSessionCookies,
  ensureCsrfCookie,
  REFRESH_COOKIE,
  setSessionCookies,
} from './cookies.js';
import { type AuthUser, CurrentUser, Public } from './decorators.js';

/** Límite estricto por IP en rutas sensibles a fuerza bruta. */
const Strict = () => Throttle({ default: { limit: config.AUTH_RATE_LIMIT, ttl: 60_000 } });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private async startSession(res: Response, session: IssuedSession) {
    setSessionCookies(res, session.accessToken, session.refreshToken);
    return this.auth.me(session.userId);
  }

  /** La web lo llama al iniciar: entrega la cookie CSRF necesaria para cualquier escritura. */
  @Public()
  @Get('csrf')
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return { csrfToken: ensureCsrfCookie(res, req.cookies?.fa_csrf) };
  }

  @Public()
  @Strict()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(LoginRequest)) body: LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.startSession(res, await this.auth.login(body.email, body.password));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const session = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]);
      setSessionCookies(res, session.accessToken, session.refreshToken);
      return { ok: true };
    } catch (err) {
      if ((err as { response?: { code?: string } }).response?.code !== 'REFRESH_RACE')
        clearSessionCookies(res);
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.id, user.sessionFamilyId);
    clearSessionCookies(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Public()
  @Strict()
  @Post('forgot-password')
  @HttpCode(202)
  async forgot(
    @Body(new ZodPipe(ForgotPasswordRequest)) body: z.infer<typeof ForgotPasswordRequest>,
  ) {
    await this.auth.forgotPassword(body.email);
    return {
      message: 'Si el correo está registrado, recibirá un enlace para restablecer la contraseña.',
    };
  }

  @Public()
  @Strict()
  @Post('reset-password')
  @HttpCode(204)
  async reset(@Body(new ZodPipe(ResetPasswordRequest)) body: z.infer<typeof ResetPasswordRequest>) {
    await this.auth.resetPassword(body.token, body.password);
  }

  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(ChangePasswordRequest)) body: z.infer<typeof ChangePasswordRequest>,
  ) {
    await this.auth.changePassword(
      user.id,
      user.sessionFamilyId,
      body.currentPassword,
      body.newPassword,
    );
  }

  @Public()
  @Strict()
  @Get('invitations/:token')
  previewInvitation(@Param('token') token: string) {
    return this.auth.previewInvitation(token);
  }

  @Public()
  @Strict()
  @Post('accept-invitation')
  @HttpCode(200)
  async acceptInvitation(
    @Body(new ZodPipe(AcceptInvitationRequest)) body: z.infer<typeof AcceptInvitationRequest>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.startSession(
      res,
      await this.auth.acceptInvitation(body.token, body.fullName, body.password),
    );
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.listSessions(user.id, user.sessionFamilyId);
  }

  @Delete('sessions/:familyId')
  @HttpCode(204)
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('familyId', ParseUUIDPipe) familyId: string,
  ) {
    await this.auth.revokeSession(user.id, familyId);
  }
}
