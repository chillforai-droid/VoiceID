import { createClient } from "@supabase/supabase-js";
import { VercelRequest } from "@vercel/node";

export const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const verifyAuth = async (req: VercelRequest) => {
    const authHeader = req.headers.authorization;

    // TEMPORARY DIAGNOSTIC (remove after root-causing Android /api/media 401s).
    // Logs shape only — never the token/header value itself.
    const authorizationPresent = !!authHeader;
    const bearerPrefix = !!authHeader && authHeader.startsWith("Bearer ");
    const rawToken = authHeader ? authHeader.replace("Bearer ", "") : "";
    console.log(
        `[MediaAuth] authorizationPresent=${authorizationPresent} bearerPrefix=${bearerPrefix} tokenLength=${rawToken.length}`
    );

    if (!authHeader) return null;

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(rawToken);

    // TEMPORARY DIAGNOSTIC (remove after root-causing Android /api/media 401s).
    console.log(`[MediaAuth] getUserSuccess=${!error && !!user}`);
    if (error) {
        console.log(
            `[MediaAuth] error.message=${error.message} error.status=${(error as any).status} error.code=${(error as any).code}`
        );
    }

    if (error || !user) return null;

    // TEMPORARY DIAGNOSTIC (remove after root-causing Android /api/media 401s).
    console.log(`[MediaAuth] authenticated=true`);
    return user;
};
