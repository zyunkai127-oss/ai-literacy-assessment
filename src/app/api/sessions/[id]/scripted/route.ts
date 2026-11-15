import { json, withSession } from '@/lib/api';
import { requireState } from '@/lib/machine';

// Live collaboration has no timed scripted messages.
export const POST = withSession((s) => {
  requireState(s.state, 'work');
  return json({ messages: [] });
});
