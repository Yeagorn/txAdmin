const modulename = 'WebServer:AccessLogsGet';
import consoleFactory from '@lib/console';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { GenericApiErrorResp } from '@shared/genericApiTypes';
const console = consoleFactory(modulename);

export interface AccessLogsGetResp {
    entries: Array<{
        timestamp: number;
        ip: string;
        method: string;
        path: string;
        userAgent?: string;
        statusCode?: number;
        responseTime?: number;
        userName?: string;
        blocked?: boolean;
        reason?: string;
    }>;
    stats: {
        totalRequests: number;
        uniqueIps: number;
        blockedRequests: number;
        topIps: Array<{ ip: string; count: number; blocked: number; }>;
        topPaths: Array<{ path: string; count: number; }>;
        requestsByHour: Array<{ hour: number; count: number; blocked: number; }>;
    };
    suspicious: Array<{
        type: 'high_frequency' | 'failed_auth' | 'suspicious_paths' | 'blocked_requests';
        ip: string;
        count: number;
        severity: 'low' | 'medium' | 'high';
        details: string;
    }>;
}

/**
 * API route to get access logs and statistics
 */
export default async function AccessLogsGet(ctx: AuthedCtx) {
    const sendTypedResp = (data: AccessLogsGetResp | GenericApiErrorResp) => ctx.send(data);

    // Check permissions
    if (!ctx.admin.hasPermission('txadmin.log.view')) {
        return sendTypedResp({ error: 'You don\'t have permission to view access logs.' });
    }

    try {
        // Parse query parameters
        const limit = Math.min(parseInt(ctx.query.limit as string) || 1000, 5000);
        const hours = Math.min(parseInt(ctx.query.hours as string) || 24, 168); // Max 1 week
        const method = ctx.query.method as string;
        const ip = ctx.query.ip as string;
        const path = ctx.query.path as string;
        const status = ctx.query.status ? parseInt(ctx.query.status as string) : undefined;
        const blocked = ctx.query.blocked === 'true' ? true : ctx.query.blocked === 'false' ? false : undefined;
        const userName = ctx.query.userName as string;

        // Get filtered logs
        const fromTime = Date.now() - (hours * 60 * 60 * 1000);
        const entries = txCore.logger.access.searchLogs({
            ip,
            path,
            method,
            status,
            fromTime,
            blocked,
            userName,
            limit,
        });

        // Get statistics
        const stats = txCore.logger.access.getRecentStats(hours);

        // Get suspicious activity
        const suspicious = txCore.logger.access.getSuspiciousActivity();

        return sendTypedResp({
            entries: entries.map(entry => ({
                timestamp: entry.timestamp,
                ip: entry.ip,
                method: entry.method,
                path: entry.path,
                userAgent: entry.userAgent,
                statusCode: entry.statusCode,
                responseTime: entry.responseTime,
                userName: entry.userName,
                blocked: entry.blocked,
                reason: entry.reason,
            })),
            stats,
            suspicious,
        });
    } catch (error) {
        console.error(`Error getting access logs: ${(error as Error).message}`);
        return sendTypedResp({ error: 'Failed to retrieve access logs' });
    }
};