import { parseTeachingPreferences, resolveTeachingPreferences } from "@/src/core";
import { getChat, isTurnRunning, compactionInFlight, stores } from "@/src/server";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const chat = getChat(id);
	return chat ? Response.json({ teaching: resolveTeachingPreferences(chat.settings?.teaching) }) : Response.json({ error: "Not found" }, { status: 404 });
}
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const parsed = parseTeachingPreferences(await req.json().catch(() => null));
	if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
	if (isTurnRunning(id) || compactionInFlight(id)) return Response.json({ error: "Wait for the current lesson turn to finish" }, { status: 409 });
	const chat = getChat(id);
	if (!chat) return Response.json({ error: "Not found" }, { status: 404 });
	const teaching = resolveTeachingPreferences(parsed.settings);
	stores.chatStore.saveSettings(id, { ...chat.settings, teaching });
	return Response.json({ teaching });
}
