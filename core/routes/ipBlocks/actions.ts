const modulename = 'WebServer:IPBlocksActions';
import consoleFactory from '@lib/console';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { GenericApiErrorResp, GenericApiOkResp } from '@shared/genericApiTypes';
import { z } from 'zod';
const console = consoleFactory(modulename);

// Request schemas
const blockIpSchema = z.object({
    ip: z.string().min(1),
    reason: z.string().min(1).max(255),
    durationMinutes: z.number().int().min(1).max(10080).optional(), // Max 1 week
});

const unblockIpSchema = z.object({
    ip: z.string().min(1),
});

type BlockIpReq = z.infer<typeof blockIpSchema>;
type UnblockIpReq = z.infer<typeof unblockIpSchema>;

/**
 * API route to manage IP blocks (block/unblock)
 */
export default async function IPBlocksActions(ctx: AuthedCtx) {
    const sendTypedResp = (data: GenericApiOkResp | GenericApiErrorResp) => ctx.send(data);
    const action = ctx.params.action;

    // Check permissions - require settings.write for IP blocking actions
    if (!ctx.admin.hasPermission('settings.write')) {
        return sendTypedResp({ error: 'You don\'t have permission to manage IP blocks.' });
    }

    try {
        if (action === 'block') {
            return await handleBlockIP(ctx, sendTypedResp);
        } else if (action === 'unblock') {
            return await handleUnblockIP(ctx, sendTypedResp);
        } else if (action === 'clear-expired') {
            return await handleClearExpired(ctx, sendTypedResp);
        } else if (action === 'clear-auto') {
            return await handleClearAuto(ctx, sendTypedResp);
        } else {
            return sendTypedResp({ error: 'Invalid action' });
        }
    } catch (error) {
        console.error(`Error in IP blocks action ${action}: ${(error as Error).message}`);
        return sendTypedResp({ error: 'Internal server error' });
    }
}

/**
 * Handle blocking an IP address
 */
async function handleBlockIP(
    ctx: AuthedCtx, 
    sendTypedResp: (data: GenericApiOkResp | GenericApiErrorResp) => void
) {
    const parseResult = blockIpSchema.safeParse(ctx.request.body);
    if (!parseResult.success) {
        return sendTypedResp({ error: 'Invalid request data' });
    }

    const { ip, reason, durationMinutes } = parseResult.data;

    const result = txCore.ipBlockManager.blockIP(ip, reason, ctx.admin.name, durationMinutes);
    
    if (result.success) {
        ctx.admin.logAction(`Blocked IP ${ip}: ${reason}`);
        return sendTypedResp({ success: true });
    } else {
        return sendTypedResp({ error: result.message });
    }
}

/**
 * Handle unblocking an IP address
 */
async function handleUnblockIP(
    ctx: AuthedCtx, 
    sendTypedResp: (data: GenericApiOkResp | GenericApiErrorResp) => void
) {
    const parseResult = unblockIpSchema.safeParse(ctx.request.body);
    if (!parseResult.success) {
        return sendTypedResp({ error: 'Invalid request data' });
    }

    const { ip } = parseResult.data;

    const result = txCore.ipBlockManager.unblockIP(ip, ctx.admin.name);
    
    if (result.success) {
        ctx.admin.logAction(`Unblocked IP ${ip}`);
        return sendTypedResp({ success: true });
    } else {
        return sendTypedResp({ error: result.message });
    }
}

/**
 * Handle clearing expired blocks
 */
async function handleClearExpired(
    ctx: AuthedCtx, 
    sendTypedResp: (data: GenericApiOkResp | GenericApiErrorResp) => void
) {
    const cleared = txCore.ipBlockManager.cleanupExpiredBlocks();
    ctx.admin.logAction(`Cleared ${cleared} expired IP blocks`);
    return sendTypedResp({ success: true });
}

/**
 * Handle clearing auto blocks
 */
async function handleClearAuto(
    ctx: AuthedCtx, 
    sendTypedResp: (data: GenericApiOkResp | GenericApiErrorResp) => void
) {
    const cleared = txCore.ipBlockManager.clearAutoBlocks();
    ctx.admin.logAction(`Cleared ${cleared} auto-blocked IPs`);
    return sendTypedResp({ success: true });
};