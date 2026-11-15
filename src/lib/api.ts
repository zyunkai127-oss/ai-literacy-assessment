// Shared route plumbing: session lookup, JSON errors, state errors as 409.
import { StateError } from './machine';
import { getSession } from './store';
import type { Session } from './types';

export const json = (body: unknown, status = 200) => Response.json(body, { status });
export const fail = (status: number, error: string) => json({ error }, status);

type Ctx = { params: Promise<{ id: string }> };
export function withSession(handler: (s: Session, req: Request) => Promise<Response> | Response) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const { id } = await ctx.params;
      const s = getSession(id);
      if (!s) return fail(404, 'Session not found');
      return await handler(s, req);
    } catch (e) {
      if (e instanceof StateError) return fail(409, e.message);
      if (e instanceof SyntaxError) return fail(400, 'Invalid JSON body');
      console.error(e);
      return fail(500, 'Something went wrong on our side');
    }
  };
}
