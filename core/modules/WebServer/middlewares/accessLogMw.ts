const modulename = 'WebServer:AccessLogMiddleware';
import consoleFactory from '@lib/console';
import type { AccessLogEntry } from '@modules/Logger/handlers/access';
const console = consoleFactory(modulename);

/**
 * Middleware to log HTTP access and check IP blocks
 */
const accessLogMiddleware = async (ctx: any, next: any) => {
    const startTime = Date.now();
    const ip = ctx.txVars.realIP;

    // Detect in-game NUI/WebPipe requests so we can avoid logging them.
    // These requests are forwarded from the game server and include special headers
    // (set in resource/menu/server/sv_webpipe.lua) such as X-TxAdmin-Token and
    // X-TxAdmin-Identifiers, or may arrive with a /WebPipe prefix.
    const isWebPipeRequest = !!(
        ctx.headers['x-txadmin-token'] ||
        ctx.headers['x-txadmin-identifiers'] ||
        (typeof ctx.path === 'string' && ctx.path.startsWith('/WebPipe'))
    );

    // Check if IP is blocked
    const blockCheck = txCore.ipBlockManager.isBlocked(ip);
    if (blockCheck.blocked) {
        const entry = blockCheck.entry!;

        // If this is an in-game WebPipe request, don't record it in the access log.
        if (!isWebPipeRequest) {
            // Log the blocked request
            const logEntry: AccessLogEntry = {
                timestamp: startTime,
                ip,
                method: ctx.method,
                path: ctx.path,
                userAgent: ctx.headers['user-agent'] as string,
                referer: ctx.headers.referer as string,
                statusCode: 403,
                responseTime: Date.now() - startTime,
                userId: undefined,
                userName: undefined,
                requestSize: parseInt(ctx.headers['content-length'] as string) || 0,
                responseSize: 0,
                blocked: true,
                reason: `IP blocked: ${entry.reason}`,
            };
            txCore.logger.access.logAccess(logEntry);
        }

        // Return blocked response (do not log WebPipe requests)
        ctx.status = 403;
        ctx.body = {
            error: 'Access Denied',
            message: 'Your IP address has been blocked.',
            timestamp: new Date().toISOString(),
        };
        return;
    }

    try {
        await next();
    } catch (error) {
        // Let the error bubble up but still log it
        throw error;
    } finally {
        // Log the request after processing (or error)
        const responseTime = Date.now() - startTime;
        
        // Get user info if authenticated
        let userId: string | undefined;
        let userName: string | undefined;
        if (ctx.admin && ctx.admin.name) {
            userId = ctx.admin.name;
            userName = ctx.admin.name;
        }

        // Calculate response size
        let responseSize = 0;
        if (ctx.body) {
            if (typeof ctx.body === 'string') {
                responseSize = Buffer.byteLength(ctx.body);
            } else if (Buffer.isBuffer(ctx.body)) {
                responseSize = ctx.body.length;
            } else if (typeof ctx.body === 'object') {
                responseSize = Buffer.byteLength(JSON.stringify(ctx.body));
            }
        }

        const logEntry: AccessLogEntry = {
            timestamp: startTime,
            ip,
            method: ctx.method,
            path: ctx.path,
            userAgent: ctx.headers['user-agent'] as string,
            referer: ctx.headers.referer as string,
            statusCode: ctx.status,
            responseTime,
            userId,
            userName,
            requestSize: parseInt(ctx.headers['content-length'] as string) || 0,
            responseSize,
            blocked: false,
        };

        // If this is an in-game WebPipe request, skip writing to the access log and
        // avoid reporting it as suspicious activity. We still processed the request
        // and return the normal response to the client.
        if (!isWebPipeRequest) {
            // Log to access logger
            txCore.logger.access.logAccess(logEntry);

            // Log suspicious activity
            if (ctx.status >= 400 || responseTime > 10000) {
                console.verbose.warn(`Slow/error request: ${ctx.method} ${ctx.path} - ${ctx.status} (${responseTime}ms) from ${ip}`);
            }
        }
    }
};

export default accessLogMiddleware;