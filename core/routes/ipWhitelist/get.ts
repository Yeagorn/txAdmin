const modulename = 'WebServer:IPWhitelistGet';
import consoleFactory from '@lib/console';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { GenericApiErrorResp } from '@shared/genericApiTypes';
const console = consoleFactory(modulename);

export interface IPWhitelistGetResp {
    entries: Array<{
        ip: string;
        reason: string;
        addedBy: string;
        timestamp: number;
        expiration?: number;
        adminUser?: string;
        hitCount: number;
        lastHit: number;
    }>;
    total: number;
    pages: number;
    currentPage: number;
    stats: {
        totalWhitelisted: number;
        activeWhitelists: number;
        adminWhitelists: number;
        manualWhitelists: number;
        expiredWhitelists: number;
        topWhitelistedIps: Array<{ ip: string; hits: number; reason: string; adminUser?: string; }>;
    };
    admins: Array<{ name: string; }>;
}

/**
 * API route to get whitelisted IPs list
 */
export default async function IPWhitelistGet(ctx: AuthedCtx) {
    const sendTypedResp = (data: IPWhitelistGetResp | GenericApiErrorResp) => ctx.send(data);

    // Check permissions
    if (!ctx.admin.hasPermission('txadmin.log.view')) {
        return sendTypedResp({ error: 'You don\'t have permission to view IP whitelist.' });
    }

    try {
        // Parse query parameters
        const page = Math.max(parseInt(ctx.query.page as string) || 1, 1);
        const limit = Math.min(parseInt(ctx.query.limit as string) || 50, 200);
        const search = ctx.query.search as string;
        const adminUser = ctx.query.adminUser as string;
        const includeExpired = ctx.query.includeExpired === 'true';

        // Get whitelisted IPs
        const result = txCore.ipWhitelistManager.getWhitelistedIPs(page, limit, {
            search,
            adminUser,
            includeExpired,
        });

        // Get statistics
        const stats = txCore.ipWhitelistManager.getStats();

        // Get list of admin users for the dropdown
        const admins = txCore.adminStore.getAdminsList().map((admin: any) => ({ name: admin.name }));

        return sendTypedResp({
            entries: result.entries,
            total: result.total,
            pages: result.pages,
            currentPage: result.currentPage,
            stats,
            admins,
        });
    } catch (error) {
        console.error(`Error getting IP whitelist: ${(error as Error).message}`);
        return sendTypedResp({ error: 'Failed to retrieve IP whitelist' });
    }
};