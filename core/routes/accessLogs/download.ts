const modulename = 'WebServer:AccessLogsDownload';
import consoleFactory from '@lib/console';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { GenericApiErrorResp } from '@shared/genericApiTypes';
import fs from 'fs';
import path from 'path';
const console = consoleFactory(modulename);

/**
 * API route to download access logs
 */
export default async function AccessLogsDownload(ctx: AuthedCtx) {
    // Check permissions
    if (!ctx.admin.hasPermission('txadmin.log.view')) {
        return ctx.send({ error: 'You don\'t have permission to view access logs.' });
    }

    try {
        const logFile = txCore.logger.access.activeFilePath;
        if (!fs.existsSync(logFile)) {
            return ctx.send({ error: 'Access log file not found' });
        }

        const filename = `access_${new Date().toISOString().split('T')[0]}.log`;
        
        // Set headers for file download
        ctx.set('Content-Type', 'text/plain');
        ctx.set('Content-Disposition', `attachment; filename="${filename}"`);
        
        // Stream the file
        ctx.body = fs.createReadStream(logFile);
    } catch (error) {
        console.error(`Error downloading access logs: ${(error as Error).message}`);
        return ctx.send({ error: 'Failed to download access logs' });
    }
};