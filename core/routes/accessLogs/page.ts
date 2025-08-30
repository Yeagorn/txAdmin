const modulename = 'WebServer:AccessLogsPage';
import consoleFactory from '@lib/console';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
const console = consoleFactory(modulename);

/**
 * Returns the access logs and IP blocking management page
 */
export default async function AccessLogsPage(ctx: AuthedCtx) {
    // Check permissions
    if (!ctx.admin.hasPermission('txadmin.log.view')) {
        return ctx.utils.render('main/message', { 
            message: 'You don\'t have permission to view this page.' 
        });
    }

    const renderData = {
        headerTitle: 'Access Logs & IP Blocking',
        hasWritePermission: ctx.admin.hasPermission('settings.write'),
    };
    return ctx.utils.render('main/accessLogs', renderData);
};