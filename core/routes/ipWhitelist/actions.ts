const modulename = 'WebServer:IPWhitelistActions';
import consoleFactory from '@lib/console';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { GenericApiErrorResp, GenericApiOkResp } from '@shared/genericApiTypes';
import { z } from 'zod';
const console = consoleFactory(modulename);

// Request schemas
const whitelistIpSchema = z.object({
    ip: z.string().min(1),
    reason: z.string().min(1).max(255),
    durationMinutes: z.number().int().min(1).max(525600).optional(), // Max 1 year
    adminUser: z.string().optional(),
});

const removeFromWhitelistSchema = z.object({
    ip: z.string().min(1),
});

const clearAdminWhitelistSchema = z.object({
    adminUser: z.string().min(1),
});

type WhitelistIpReq = z.infer<typeof whitelistIpSchema>;
type RemoveFromWhitelistReq = z.infer<typeof removeFromWhitelistSchema>;
type ClearAdminWhitelistReq = z.infer<typeof clearAdminWhitelistSchema>;

/**
 * API route to manage IP whitelist (add/remove/clear)
 */
export default async function IPWhitelistActions(ctx: AuthedCtx) {
    const sendTypedResp = (data: GenericApiOkResp | GenericApiErrorResp) => ctx.send(data);
    const action = ctx.params.action;

    // Check permissions - require settings.write for IP whitelist actions
    if (!ctx.admin.hasPermission('settings.write')) {
        return sendTypedResp({ error: 'You don\'t have permission to manage IP whitelist.' });
    }

    try {
        if (action === 'whitelist') {
            return await handleWhitelistIP(ctx, sendTypedResp);
        } else if (action === 'remove') {
            return await handleRemoveFromWhitelist(ctx, sendTypedResp);
        } else if (action === 'clear-admin') {
            return await handleClearAdminWhitelist(ctx, sendTypedResp);
        } else if (action === 'clear-manual') {
            return await handleClearManualWhitelist(ctx, sendTypedResp);
        } else if (action === 'clear-expired') {
            return await handleClearExpired(ctx, sendTypedResp);
        } else {
            return sendTypedResp({ error: 'Invalid action' });
        }
    } catch (error) {
        console.error(`Error in IP whitelist action ${action}: ${(error as Error).message}`);
        return sendTypedResp({ error: 'Internal server error' });
    }
}

/**
 * Handle whitelisting an IP address
 */
async function handleWhitelistIP(
    ctx: AuthedCtx, 
    sendTypedResp: (data: GenericApiOkResp | GenericApiErrorResp) => void
) {
    const parseResult = whitelistIpSchema.safeParse(ctx.request.body);
    if (!parseResult.success) {
        return sendTypedResp({ error: 'Invalid request data' });
    }

    const { ip, reason, durationMinutes, adminUser } = parseResult.data;

    // If adminUser is specified, verify it exists
    if (adminUser) {
        const admin = txCore.adminStore.getAdminByName(adminUser);
        if (!admin) {
            return sendTypedResp({ error: 'Specified admin user does not exist' });
        }
    }

    const result = txCore.ipWhitelistManager.whitelistIP(ip, reason, ctx.admin.name, durationMinutes, adminUser);
    
    if (result.success) {
        const adminText = adminUser ? ` for admin ${adminUser}` : '';
        ctx.admin.logAction(`Whitelisted IP ${ip}${adminText}: ${reason}`);
        return sendTypedResp({ success: true });
    } else {
        return sendTypedResp({ error: result.message });
    }
}

/**
 * Handle removing an IP from whitelist
 */
async function handleRemoveFromWhitelist(
    ctx: AuthedCtx, 
    sendTypedResp: (data: GenericApiOkResp | GenericApiErrorResp) => void
) {
    const parseResult = removeFromWhitelistSchema.safeParse(ctx.request.body);
    if (!parseResult.success) {
        return sendTypedResp({ error: 'Invalid request data' });
    }

    const { ip } = parseResult.data;

    const result = txCore.ipWhitelistManager.removeFromWhitelist(ip, ctx.admin.name);
    
    if (result.success) {
        ctx.admin.logAction(`Removed IP ${ip} from whitelist`);
        return sendTypedResp({ success: true });
    } else {
        return sendTypedResp({ error: result.message });
    }
}

/**
 * Handle clearing admin-specific whitelist
 */
async function handleClearAdminWhitelist(
    ctx: AuthedCtx, 
    sendTypedResp: (data: GenericApiOkResp | GenericApiErrorResp) => void
) {
    const parseResult = clearAdminWhitelistSchema.safeParse(ctx.request.body);
    if (!parseResult.success) {
        return sendTypedResp({ error: 'Invalid request data' });
    }

    const { adminUser } = parseResult.data;

    // Verify admin exists
    const admin = txCore.adminStore.getAdminByName(adminUser);
    if (!admin) {
        return sendTypedResp({ error: 'Specified admin user does not exist' });
    }

    const cleared = txCore.ipWhitelistManager.clearAdminWhitelists(adminUser);
    ctx.admin.logAction(`Cleared ${cleared} whitelist entries for admin ${adminUser}`);
    return sendTypedResp({ success: true });
}

/**
 * Handle clearing manual whitelist
 */
async function handleClearManualWhitelist(
    ctx: AuthedCtx, 
    sendTypedResp: (data: GenericApiOkResp | GenericApiErrorResp) => void
) {
    const cleared = txCore.ipWhitelistManager.clearManualWhitelists();
    ctx.admin.logAction(`Cleared ${cleared} manual whitelist entries`);
    return sendTypedResp({ success: true });
}

/**
 * Handle clearing expired whitelist entries
 */
async function handleClearExpired(
    ctx: AuthedCtx, 
    sendTypedResp: (data: GenericApiOkResp | GenericApiErrorResp) => void
) {
    const cleared = txCore.ipWhitelistManager.cleanup();
    ctx.admin.logAction(`Cleared ${cleared} expired whitelist entries`);
    return sendTypedResp({ success: true });
};