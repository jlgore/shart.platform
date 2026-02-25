import { Container } from '@cloudflare/containers';
import type { Env } from './types';

// One container instance per lab session, keyed by containerKey = sessionId.
// ttyd runs on port 7681 and serves bash over WebSocket.
// mock-apiserver runs on port 6443 and serves the scenario's K8s resources.
// The Worker validates auth then proxies WebSocket traffic to this DO.
export class LabContainer extends Container<Env> {
  defaultPort = 7681; // ttyd WebSocket port
  sleepAfter = '20m'; // aggressive sleep to control cost

  // Inject per-instance environment variables into the container process.
  // LAB_ID, SESSION_ID, and USER_ID come from DO storage set during __lab/setup.
  // COMPLETION_WEBHOOK_SECRET is the shared HMAC key forwarded from worker env.
  // @ts-expect-error — getContainerOptions is part of the Containers beta API,
  // not yet in @cloudflare/workers-types. Verify signature against CF docs.
  override async getContainerOptions() {
    const labId = (await this.ctx.storage.get<string>('labId')) ?? '';
    const sessionId = (await this.ctx.storage.get<string>('sessionId')) ?? '';
    const userId = (await this.ctx.storage.get<string>('userId')) ?? '';
    return {
      env: {
        LAB_ID: labId,
        SESSION_ID: sessionId,
        USER_ID: userId,
        COMPLETION_WEBHOOK_SECRET: this.env.COMPLETION_WEBHOOK_SECRET,
      },
    };
  }

  override async containerStarted(): Promise<void> {
    const sessionId = await this.ctx.storage.get<string>('sessionId');
    if (!sessionId) return;

    await this.env.DB.prepare(
      `INSERT INTO usage_events (event_id, session_id, event_type, occurred_at, instance_type)
       VALUES (?, ?, 'started', ?, 'standard')`
    )
      .bind(crypto.randomUUID(), sessionId, Math.floor(Date.now() / 1000))
      .run();
  }

  override async containerStopped(): Promise<void> {
    const sessionId = await this.ctx.storage.get<string>('sessionId');
    if (!sessionId) return;

    await this.env.DB.prepare(
      `INSERT INTO usage_events (event_id, session_id, event_type, occurred_at, instance_type)
       VALUES (?, ?, 'sleeping', ?, 'standard')`
    )
      .bind(crypto.randomUUID(), sessionId, Math.floor(Date.now() / 1000))
      .run();

    await this.env.DB.prepare(
      `UPDATE lab_sessions SET status = 'sleeping' WHERE session_id = ? AND status = 'active'`
    )
      .bind(sessionId)
      .run();
  }

  // Internal setup endpoint — called by the Worker before the first WS proxy.
  // Stores sessionId and labId so lifecycle hooks and env injection have context.
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/__lab/setup' && request.method === 'POST') {
      const { sessionId, labId, userId } = (await request.json()) as {
        sessionId: string;
        labId: string;
        userId: string;
      };
      await this.ctx.storage.put('sessionId', sessionId);
      await this.ctx.storage.put('labId', labId);
      await this.ctx.storage.put('userId', userId);
      return new Response('OK');
    }

    return super.fetch(request);
  }
}
