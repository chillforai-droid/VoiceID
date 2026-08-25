import { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin, verifyAuth } from "../lib/auth.js";

/**
 * Deletes the authenticated user's account entirely.
 *
 * Why this has to be a server endpoint at all: the browser only ever holds
 * the anon key, and there is no RLS policy (nor should there be) that lets
 * a user delete their own row out of auth.users — only the service-role
 * key can do that, via supabaseAdmin.auth.admin.deleteUser. This mirrors
 * lib/auth.ts's existing supabaseAdmin/verifyAuth setup used by the other
 * api/ endpoints.
 *
 * Most of the schema cascades cleanly off profiles.id -> auth.users
 * (ON DELETE CASCADE), so deleting the auth user alone cleans up messages,
 * conversations, contacts, etc. One table doesn't: call_history.caller_id /
 * receiver_id reference profiles with no ON DELETE action, so leaving a row
 * behind for a user who ever made or received a call would make the delete
 * fail outright with a foreign key violation. That table is cleared first.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let stage = "authentication";
    try {
        const user = await verifyAuth(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        stage = "clear_call_history";
        const { error: callHistoryError } = await supabaseAdmin
            .from('call_history')
            .delete()
            .or(`caller_id.eq.${user.id},receiver_id.eq.${user.id}`);
        if (callHistoryError) {
            console.error('delete-account: failed to clear call_history', callHistoryError);
            return res.status(500).json({ error: 'Failed to delete account', stage, message: callHistoryError.message });
        }

        stage = "delete_auth_user";
        const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
        if (deleteUserError) {
            console.error('delete-account: auth.admin.deleteUser failed', deleteUserError);
            return res.status(500).json({ error: 'Failed to delete account', stage, message: deleteUserError.message });
        }

        stage = "success";
        res.json({ success: true });
    } catch (e: any) {
        console.error(`delete-account failed at stage: ${stage}`, e);
        res.status(500).json({ error: 'Failed to delete account', stage, message: e?.message });
    }
}
