const modulename = 'WebServer:AccessLogsStream';
import consoleFactory from '@lib/console';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import fs from 'fs';
import { PassThrough } from 'stream';
const console = consoleFactory(modulename);

/**
 * API route to stream access logs in real-time using Server-Sent Events
 */
export default async function AccessLogsStream(ctx: AuthedCtx) {
    // Check permissions
    if (!ctx.admin.hasPermission('txadmin.log.view')) {
        ctx.status = 403;
        ctx.body = { error: 'You don\'t have permission to view access logs.' };
        return;
    }

    try {
        const logFile = txCore.logger.access.activeFilePath;
        if (!fs.existsSync(logFile)) {
            ctx.status = 404;
            ctx.body = { error: 'Access log file not found' };
            return;
        }

        // Set SSE headers
        ctx.set('Content-Type', 'text/event-stream');
        ctx.set('Cache-Control', 'no-cache');
        ctx.set('Connection', 'keep-alive');
        ctx.set('Access-Control-Allow-Origin', '*');

        // Create a PassThrough stream for SSE
        const stream = new PassThrough();
        ctx.body = stream;

        // Send initial connection event
        stream.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);

        let lastPosition = 0;
        let fileSize = fs.statSync(logFile).size;
        
        // Start watching the file for changes
        const watcher = fs.watchFile(logFile, { interval: 1000 }, (curr) => {
            if (curr.size > fileSize) {
                // File has grown, read the new content
                const readStream = fs.createReadStream(logFile, {
                    start: lastPosition,
                    end: curr.size - 1
                });

                let buffer = '';
                readStream.on('data', (chunk: Buffer) => {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    
                    // Keep the last incomplete line in buffer
                    buffer = lines.pop() || '';
                    
                    // Send complete lines
                    lines.forEach(line => {
                        if (line.trim()) {
                            stream.write(`event: line\n`);
                            stream.write(`data: ${JSON.stringify(line)}\n\n`);
                        }
                    });
                });

                readStream.on('end', () => {
                    lastPosition = curr.size;
                    fileSize = curr.size;
                });

                readStream.on('error', (error) => {
                    console.error('Error reading log file:', error);
                    stream.write(`event: error\n`);
                    stream.write(`data: ${JSON.stringify({ error: 'Error reading log file' })}\n\n`);
                });
            }
        });

        // Send heartbeat every 30 seconds
        const heartbeat = setInterval(() => {
            stream.write(`event: heartbeat\n`);
            stream.write(`data: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
        }, 30000);

        // Cleanup when client disconnects
        ctx.req.on('close', () => {
            clearInterval(heartbeat);
            fs.unwatchFile(logFile);
            stream.end();
        });

        ctx.req.on('error', () => {
            clearInterval(heartbeat);
            fs.unwatchFile(logFile);
            stream.end();
        });

    } catch (error) {
        console.error(`Error streaming access logs: ${(error as Error).message}`);
        ctx.status = 500;
        ctx.body = { error: 'Failed to stream access logs' };
    }
};