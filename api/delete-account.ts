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
 * (ON DELETE CASCADE) — messages, conversations, conversation_members,
 * stories, story_views, message_receipts, contact_notifications, etc.
 * A handful of tables were created WITHOUT an ON DELETE action on their
 * profiles-referencing columns, so a leftover row in any of them makes the
 * delete fail outright with a foreign key violation for any user who ever
 * used that feature:
 *   - call_history.caller_id / receiver_id
 *   - calls.caller_id / receiver_id            (a separate table from
 *     call_history — both exist and both needed clearing)
 *   - contacts.requester_id / responder_id     (this is the one the SQL
 *     Editor's own error message named directly)
 *   - notifications.user_id / actor_id
 *   - push_tokens.user_id
 * All five are cleared before the auth user is deleted. (organizations /
 * organization_members / audit_logs also reference profiles with no
 * cascade, but nothing in the app writes to them, so they're left alone.)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let stage = "authentication";
    try {
        const user = await verifyAuth(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const cleanupSteps: Array<{ stage: string; run: () => Promise<{ error: any }> }> = [
            {
                stage: 'clear_call_history',
                run: () => supabaseAdmin.from('call_history').delete().or(`caller_id.eq.${user.id},receiver_id.eq.${user.id}`),
            },
            {
                stage: 'clear_calls',
                run: () => supabaseAdmin.from('calls').delete().or(`caller_id.eq.${user.id},receiver_id.eq.${user.id}`),
            },
            {
                stage: 'clear_contacts',
                run: () => supabaseAdmin.from('contacts').delete().or(`requester_id.eq.${user.id},responder_id.eq.${user.id}`),
            },
            {
                stage: 'clear_notifications',
                run: () => supabaseAdmin.from('notifications').delete().or(`user_id.eq.${user.id},actor_id.eq.${user.id}`),
            },
            {
                stage: 'clear_push_tokens',
                run: () => supabaseAdmin.from('push_tokens').delete().eq('user_id', user.id),
            },
        ];

        for (const step of cleanupSteps) {
            stage = step.stage;
            const { error } = await step.run();
            if (error) {
                console.error(`delete-account: failed at ${step.stage}`, error);
                return res.status(500).json({ error: 'Failed to delete account', stage, message: error.message });
            }
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
