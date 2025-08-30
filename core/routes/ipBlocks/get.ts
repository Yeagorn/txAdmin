const modulename = 'WebServer:IPBlocksGet';
import consoleFactory from '@lib/console';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { GenericApiErrorResp } from '@shared/genericApiTypes';
const console = consoleFactory(modulename);

export interface IPBlocksGetResp {
    entries: Array<{
        ip: string;
        reason: string;
        addedBy: string;
        timestamp: number;
        expiration?: number;
        autoBlocked: boolean;
        hitCount: number;
        lastHit: number;
    }>;
    total: number;
    pages: number;
    currentPage: number;
    stats: {
        totalBlocked: number;
        activeBlocks: number;
        autoBlocks: number;
        manualBlocks: number;
        expiredBlocks: number;
        topBlockedIps: Array<{ ip: string; hits: number; reason: string; }>;
    };
}

/**
 * API route to get blocked IPs list
 */
export default async function IPBlocksGet(ctx: AuthedCtx) {
    const sendTypedResp = (data: IPBlocksGetResp | GenericApiErrorResp) => ctx.send(data);

    // Check permissions
    if (!ctx.admin.hasPermission('txadmin.log.view')) {
        return sendTypedResp({ error: 'You don\'t have permission to view IP blocks.' });
    }

    try {
        // Parse query parameters
        const page = Math.max(parseInt(ctx.query.page as string) || 1, 1);
        const limit = Math.min(parseInt(ctx.query.limit as string) || 50, 200);
        const search = ctx.query.search as string;
        const autoBlocked = ctx.query.autoBlocked === 'true' ? true : 
                          ctx.query.autoBlocked === 'false' ? false : undefined;
        const includeExpired = ctx.query.includeExpired === 'true';

        // Get blocked IPs
        const result = txCore.ipBlockManager.getBlockedIPs(page, limit, {
            search,
            autoBlocked,
            includeExpired,
        });

        // Get statistics
        const stats = txCore.ipBlockManager.getStats();

        return sendTypedResp({
            entries: result.entries,
            total: result.total,
            pages: result.pages,
            currentPage: result.currentPage,
            stats,
        });
    } catch (error) {
        console.error(`Error getting IP blocks: ${(error as Error).message}`);
        return sendTypedResp({ error: 'Failed to retrieve IP blocks' });
    }
};