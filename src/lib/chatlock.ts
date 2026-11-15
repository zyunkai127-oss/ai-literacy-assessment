// One assistant reply per session at a time, shared by the chat and scripted routes.
const g = globalThis as unknown as { __alcChats?: Set<string> };
export const activeChats: Set<string> = (g.__alcChats ??= new Set<string>());
