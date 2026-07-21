import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { SessionService } from '../session/session.service';
import { TelegramInitDataGuard } from 'src/common/guards/telegram-init-data.guard';

interface ConnectedClient {
  socketId: string;
  userId: string;
  sessionPublicId: string;
}

interface ClientData {
  cleanup?: () => void;
}

@WebSocketGateway({
  namespace: '/gateway',
  cors: { origin: '*', credentials: true },
})
export class SessionGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SessionGateway.name);
  private readonly clients = new Map<string, ConnectedClient>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly sessionService: SessionService,
    private readonly initDataGuard: TelegramInitDataGuard,
  ) {}

  handleConnection(client: Socket): void {
    const initData = client.handshake.query.initData as string | undefined;
    const sessionId = client.handshake.query.session as string | undefined;

    if (!initData || !sessionId) {
      client.emit('error', 'Missing initData or session parameter');
      client.disconnect();
      return;
    }

    let userId: number;
    try {
      const user = this.initDataGuard.validateInitData(initData);
      userId = user.id;
    } catch {
      client.emit('error', 'Authentication failed');
      client.disconnect();
      return;
    }

    const session = this.sessionService.getActiveSession(sessionId);
    if (!session) {
      const userIdStr = String(userId);
      const userSessions = this.sessionService.getUserSessions(userIdStr);
      const found = userSessions.find((s) => s.id === sessionId || s.publicId === sessionId);
      if (!found) {
        client.emit('error', 'Session not found');
        client.disconnect();
        return;
      }
    }

    const sessionPublicId = session?.publicId ?? sessionId;

    this.clients.set(client.id, {
      socketId: client.id,
      userId: String(userId),
      sessionPublicId,
    });

    void client.join(sessionPublicId);

    const activeSession = session ?? this.sessionService.getUserSession(String(userId));
    if (activeSession && activeSession.publicId === sessionPublicId) {
      const buf = activeSession.terminal.buffer.active;
      const totalLines = buf.length;
      const lines: string[] = [];
      for (let y = 0; y < totalLines; y++) {
        const line = buf.getLine(y);
        if (line) lines.push(line.translateToString());
      }
      if (lines.length > 0) {
        client.emit('terminal:data', lines.join('\n'));
      }

      const outputHandler = (data: string) => {
        client.emit('terminal:data', data);
      };
      const exitHandler = (code: number | null, durationMs: number) => {
        client.emit('terminal:exit', { code, durationMs });
        void client.leave(sessionPublicId);
      };

      activeSession.emitter.on('output', outputHandler);
      activeSession.emitter.on('exit', exitHandler);

      const cd: ClientData = { cleanup: () => {
        activeSession.emitter.off('output', outputHandler);
        activeSession.emitter.off('exit', exitHandler);
      } };
      client.data = cd;
    }

    this.logger.log(`WebSocket client ${client.id} connected to session ${sessionPublicId}`);
  }

  handleDisconnect(client: Socket): void {
    const data = client.data as ClientData | undefined;
    if (typeof data?.cleanup === 'function') {
      data.cleanup();
    }
    this.clients.delete(client.id);
    this.logger.log(`WebSocket client ${client.id} disconnected`);
  }

  @SubscribeMessage('terminal:input')
  handleInput(client: Socket, payload: { type?: string; data: string }): void {
    const conn = this.clients.get(client.id);
    if (!conn) return;

    const session = this.sessionService.findByPublicId(conn.sessionPublicId);
    if (!session) {
      client.emit('error', 'Session not found for this connection');
      return;
    }

    try {
      if (payload.type === 'key') {
        this.sessionService.sendKey(session.id, payload.data);
      } else {
        this.sessionService.sendToSession(session.id, payload.data).catch((err: unknown) => {
          client.emit('error', (err instanceof Error ? err.message : '') || 'Failed to send input');
        });
      }
    } catch {
      client.emit('error', 'Failed to send input');
    }
  }
}
