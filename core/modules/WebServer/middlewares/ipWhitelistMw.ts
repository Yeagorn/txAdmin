const modulename = 'IPWhitelistMiddleware';
import consoleFactory from '@lib/console';
const console = consoleFactory(modulename);

/**
 * Middleware to check if IP is whitelisted and allow priority access
 * This should be used before rate limiting for whitelisted IPs
 */
export const ipWhitelistMiddleware = async (ctx: any, next: any) => {
    const clientIP = ctx.txVars.realIP;
    
    // Skip whitelist check for local IPs
    if (ctx.txVars.isLocalRequest) {
        return await next();
    }

    try {
        // Check if IP is whitelisted (general whitelist)
        const whitelistResult = txCore.ipWhitelistManager.isWhitelisted(clientIP);
        
        if (whitelistResult.whitelisted) {
            // Mark request as whitelisted for other middlewares
            ctx.txVars.isWhitelisted = true;
            ctx.txVars.whitelistEntry = whitelistResult.entry;
            
            // Log whitelist hit if verbose
            if (console.isVerbose) {
                console.log(`Whitelisted IP access: ${clientIP} - ${whitelistResult.entry?.reason || 'Unknown reason'}`);
            }
        }
    } catch (error) {
        // Don't block request if whitelist check fails
        console.error(`Whitelist check failed for ${clientIP}: ${(error as Error).message}`);
    }

    return await next();
};

/**
 * Middleware to check admin-specific IP whitelist
 * This should be used in admin authentication flows
 */
export const adminIPWhitelistMiddleware = async (ctx: any, next: any) => {
    const clientIP = ctx.txVars.realIP;
    
    // Skip for local requests or if already whitelisted
    if (ctx.txVars.isLocalRequest || ctx.txVars.isWhitelisted) {
        return await next();
    }

    try {
        // If we have admin context, check admin-specific whitelist
        if (ctx.admin?.name) {
            const adminWhitelistResult = txCore.ipWhitelistManager.isWhitelisted(clientIP, ctx.admin.name);
            
            if (adminWhitelistResult.whitelisted) {
                ctx.txVars.isAdminWhitelisted = true;
                ctx.txVars.adminWhitelistEntry = adminWhitelistResult.entry;
                
                // Log admin whitelist hit
                console.log(`Admin whitelisted IP access: ${clientIP} for admin ${ctx.admin.name}`);
            }
        }
    } catch (error) {
        console.error(`Admin whitelist check failed for ${clientIP}: ${(error as Error).message}`);
    }

    return await next();
};

export default ipWhitelistMiddleware;