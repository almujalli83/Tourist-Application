import { currentUser } from "@/lib/auth/session";
import { handle, json } from "@/lib/http";
import { emergencyContext } from "@/lib/emergency/context";

export const GET = handle(async () => json(await emergencyContext(await currentUser())));
