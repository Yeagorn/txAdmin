const modulename = 'WebServer:AccessLogsInternal';
import consoleFactory from '@lib/console';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { GenericApiErrorResp } from '@shared/genericApiTypes';
import fs from 'node:fs';
import path from 'node:path';
const console = consoleFactory(modulename);

/**
 * Endpoints to list and download in-game/internal access logs (access_internal.*)
 * - GET /accessLogs/internal/list -> { files: [{ name, size, mtime }] }
 * - GET /accessLogs/internal/download?file=<name> -> file stream (attachment)
 * - GET /accessLogs/internal/stream -> Server-Sent Events tailing the current internal log
 */

export default async function AccessLogsInternal(ctx: AuthedCtx) {
    // Route handler multiplex: use ctx.path to determine action
    try {
        if (!ctx.admin.hasPermission('txadmin.log.view')) {
            return ctx.send({ error: 'You do not have permission to view logs.' } as GenericApiErrorResp);
        }

        const action = ctx.query.action as string || 'list';

        const logsDir = path.dirname(txCore.logger.access.activeFilePath || '.');

        if (action === 'list') {
            const files = fs.readdirSync(logsDir).filter(f => f.startsWith('access_internal'))
                .map(f => {
                    const st = fs.statSync(path.join(logsDir, f));
                    return { name: f, size: st.size, mtime: st.mtimeMs };
                }).sort((a, b) => b.mtime - a.mtime);
            return ctx.send({ files });
        }

        if (action === 'download') {
            const file = ctx.query.file as string;
            if (!file) return ctx.send({ error: 'file parameter is required' } as GenericApiErrorResp);
            // simple validation
            if (!/^access_internal(.*)\.log$/.test(file)) return ctx.send({ error: 'invalid file' } as GenericApiErrorResp);
            const fullPath = path.join(logsDir, file);
            if (!fs.existsSync(fullPath)) return ctx.send({ error: 'file not found' } as GenericApiErrorResp);
            ctx.set('Content-Disposition', `attachment; filename="${file}"`);
            ctx.body = fs.createReadStream(fullPath);
            return;
        }

        // Return file as JSON base64 payload for browser download via API client
        if (action === 'downloadBase64') {
            const file = ctx.query.file as string;
            if (!file) return ctx.send({ error: 'file parameter is required' } as GenericApiErrorResp);
            if (!/^access_internal(.*)\.log$/.test(file)) return ctx.send({ error: 'invalid file' } as GenericApiErrorResp);
            const fullPath = path.join(logsDir, file);
            if (!fs.existsSync(fullPath)) return ctx.send({ error: 'file not found' } as GenericApiErrorResp);
            const buf = fs.readFileSync(fullPath);
            return ctx.send({ filename: file, base64: buf.toString('base64') });
        }

        if (action === 'stream') {
            // SSE stream: tail current access_internal.log (or latest rotated)
            ctx.set('Content-Type', 'text/event-stream');
            ctx.set('Cache-Control', 'no-cache');
            ctx.set('Connection', 'keep-alive');
            ctx.status = 200;

            // Determine file to tail: prefer access_internal.log
            const currentFile = path.join(logsDir, 'access_internal.log');
            let fileToTailName = fs.existsSync(currentFile)
                ? 'access_internal.log'
                : (fs.readdirSync(logsDir).filter(f => f.startsWith('access_internal')).sort().reverse()[0] || null);
            if (!fileToTailName) {
                ctx.res.write('event: line\ndata: \n\n');
                return;
            }

            const fullPath = path.join(logsDir, fileToTailName);
            // Track last size and use fs.watchFile to detect appended data
            let lastSize = fs.statSync(fullPath).size;

            const sendLines = (text: string) => {
                const lines = text.split(/\r?\n/).filter(Boolean);
                for (const line of lines) {
                    try { ctx.res.write(`event: line\ndata: ${JSON.stringify(line)}\n\n`); } catch (e) { /* ignore */ }
                }
            };

            // Initial empty heartbeat
            try { ctx.res.write(':ok\n\n'); } catch (e) { }

            const watcher = fs.watchFile(fullPath, { interval: 1000 }, (curr, prev) => {
                if (curr.size > prev.size) {
                    try {
                        const stream = fs.createReadStream(fullPath, { start: prev.size, end: curr.size - 1, encoding: 'utf8' });
                        let buf = '';
                        stream.on('data', (chunk) => buf += chunk.toString());
                        stream.on('end', () => { sendLines(buf); });
                        stream.on('error', () => { /* ignore */ });
                    } catch (e) { /* ignore */ }
                }
            });

            const onClose = () => { try { fs.unwatchFile(fullPath); } catch (e) { } };
            ctx.req.on('close', onClose);
            return;
        }

        return ctx.send({ error: 'unknown action' } as GenericApiErrorResp);
    } catch (error) {
        console.error('Error in AccessLogsInternal route', (error as Error).message);
        return ctx.send({ error: 'Failed to handle internal logs' } as GenericApiErrorResp);
    }
}
