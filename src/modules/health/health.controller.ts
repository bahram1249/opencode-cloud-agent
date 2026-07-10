import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from 'src/common/decorators/public.decorator';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  uptime: number;
  checks: Record<string, { status: 'ok' | 'degraded' | 'down'; latencyMs: number }>;
}

/**
 * Liveness/readiness probe endpoint. Used by Docker, Kubernetes, and
 * docker-compose health checks.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  check(): HealthStatus {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        app: { status: 'ok', latencyMs: 0 },
      },
    };
  }
}
