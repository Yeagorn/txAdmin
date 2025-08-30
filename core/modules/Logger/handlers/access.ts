const modulename = 'Logger:Access';
import path from 'node:path';
import fsp from 'node:fs/promises';
import * as rfs from 'rotating-file-stream';
import { getTimeFilename } from '@lib/misc';
import { LoggerBase } from '../LoggerBase';
import type { Options as RfsOptions } from 'rotating-file-stream';
import consoleFactory from '@lib/console';
const console = consoleFactory(modulename);

export interface AccessLogEntry {
    timestamp: number;
    ip: string;
    method: string;
    path: string;
    userAgent?: string;
    referer?: string;
    statusCode?: number;
    responseTime?: number;
    userId?: string;
    userName?: string;
    requestSize?: number;
    responseSize?: number;
    blocked?: boolean;
    reason?: string;
}

export interface AccessLogStats {
    totalRequests: number;
    uniqueIps: number;
    blockedRequests: number;
    topIps: Array<{ ip: string; count: number; blocked: number; }>;
    topPaths: Array<{ path: string; count: number; }>;
    requestsByHour: Array<{ hour: number; count: number; blocked: number; }>;
}

/**
 * Logger for HTTP access logs with analytics capabilities
 */
export default class AccessLogger extends LoggerBase {
    private recentBuffer: AccessLogEntry[] = [];
    private readonly bufferSize = 10000; // Keep last 10k requests in memory
    private writeCounter = 0;
    private internalWriteCounter = 0;
    private internalStream: rfs.RotatingFileStream | null = null;

    constructor(basePath: string, lrProfileConfig?: RfsOptions) {
        const lrDefaultOptions: RfsOptions = {
            path: basePath,
            intervalBoundary: true,
            initialRotation: true,
            history: 'access.history',
            interval: '1d', // Rotate daily for access logs
        };
        super(basePath, 'access', lrDefaultOptions, lrProfileConfig);
        this.writeCounter = 0;
        // Create a separate rotating stream for internal/localhost logs
        try {
            const internalFilenameGenerator: rfs.Generator = (time, index) => {
                return time ? `access_internal_${getTimeFilename(time)}_${index}.log` : `access_internal.log`;
            };
            const internalOptions: rfs.Options = Object.assign({}, lrDefaultOptions, { path: basePath });
            this.internalStream = rfs.createStream(internalFilenameGenerator, internalOptions);
            this.internalStream.on('error', (error) => {
                if ((error as any).code !== 'ERR_STREAM_DESTROYED') {
                    console.verbose.error(error, 'access_internal');
                }
            });
            this.internalStream.on('rotated', (filename) => {
                try { this.internalStream && this.internalStream.write(`--- Log Rotated: ${filename}\n`); } catch (e) { /* ignore */ }
            });
        } catch (err) {
            console.verbose.warn('Failed to create internal access log stream', (err as Error).message);
            this.internalStream = null;
        }
    }

    /**
     * Returns usage statistics
     */
    getUsageStats(): string {
        return `Writes: ${this.writeCounter}, lrErrors: ${this.lrErrors}, Buffer: ${this.recentBuffer.length}`;
    }

    /**
     * Returns the recent access log buffer
     */
    getRecentBuffer(limit?: number): AccessLogEntry[] {
        const entries = limit ? this.recentBuffer.slice(-limit) : this.recentBuffer;
        return entries.slice(); // Return a copy
    }

    /**
     * Returns statistics from the recent buffer
     */
    getRecentStats(hours = 24): AccessLogStats {
        const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
        const recentEntries = this.recentBuffer.filter(entry => entry.timestamp > cutoffTime);

        // Calculate basic stats
        const totalRequests = recentEntries.length;
        const uniqueIps = new Set(recentEntries.map(e => e.ip)).size;
        const blockedRequests = recentEntries.filter(e => e.blocked).length;

        // Top IPs
        const ipCounts = new Map<string, { count: number; blocked: number; }>();
        recentEntries.forEach(entry => {
            const current = ipCounts.get(entry.ip) || { count: 0, blocked: 0 };
            current.count++;
            if (entry.blocked) current.blocked++;
            ipCounts.set(entry.ip, current);
        });
        const topIps = Array.from(ipCounts.entries())
            .map(([ip, stats]) => ({ ip, ...stats }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Top paths
        const pathCounts = new Map<string, number>();
        recentEntries.forEach(entry => {
            const sanitizedPath = this.sanitizePath(entry.path);
            pathCounts.set(sanitizedPath, (pathCounts.get(sanitizedPath) || 0) + 1);
        });
        const topPaths = Array.from(pathCounts.entries())
            .map(([path, count]) => ({ path, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Requests by hour
        const hourCounts = new Array(24).fill(0).map((_, i) => ({ hour: i, count: 0, blocked: 0 }));
        recentEntries.forEach(entry => {
            const hour = new Date(entry.timestamp).getHours();
            hourCounts[hour].count++;
            if (entry.blocked) hourCounts[hour].blocked++;
        });

        return {
            totalRequests,
            uniqueIps,
            blockedRequests,
            topIps,
            topPaths,
            requestsByHour: hourCounts,
        };
    }

    /**
     * Log an access entry
     */
    logAccess(entry: AccessLogEntry): void {
        // Detect loopback/local addresses and route them to the internal log stream
        const isLoopback = (rawIp?: string) => {
            if (!rawIp) return false;
            let ipOnly = rawIp.trim().toLowerCase();
            // Strip IPv6 scope id (e.g., ::1%lo0)
            const pctIdx = ipOnly.indexOf('%');
            if (pctIdx !== -1) ipOnly = ipOnly.slice(0, pctIdx);
            // If there's a port, remove it (handles both ipv4 and [ipv6]:port)
            // For IPv6 in brackets like [::1]:123, remove brackets
            if (ipOnly.startsWith('[') && ipOnly.includes(']')) {
                ipOnly = ipOnly.slice(1, ipOnly.indexOf(']'));
            } else if (ipOnly.includes(':') && !ipOnly.includes('::')) {
                // Possible ipv4:port
                const parts = ipOnly.split(':');
                if (/^\d+$/.test(parts[parts.length - 1])) {
                    parts.pop();
                    ipOnly = parts.join(':');
                }
            }
            if (!ipOnly) return false;
            if (ipOnly === '127.0.0.1' || ipOnly === '::1') return true;
            // IPv4-mapped IPv6 like ::ffff:127.0.0.1
            if (ipOnly.endsWith('127.0.0.1')) return true;
            return false;
        };

        if (isLoopback(entry.ip)) {
            // Format log line for internal logs same as external
            const timestamp = new Date(entry.timestamp).toISOString();
            const statusCode = entry.statusCode || 0;
            const responseTime = entry.responseTime || 0;
            const requestSize = entry.requestSize || 0;
            const responseSize = entry.responseSize || 0;
            const userInfo = entry.userName ? `"${entry.userName}"` : '-';
            const userAgent = entry.userAgent || '-';
            const referer = entry.referer || '-';
            const blocked = entry.blocked ? 'BLOCKED' : 'OK';
            const reason = entry.reason || '-';
            const logLine = `${entry.ip} - ${userInfo} [${timestamp}] "${entry.method} ${entry.path} HTTP/1.1" ${statusCode} ${responseSize} "${referer}" "${userAgent}" ${responseTime}ms ${requestSize}b ${blocked} "${reason}"`;
            try {
                if (this.internalStream) {
                    this.internalStream.write(`${logLine}\n`);
                    this.internalWriteCounter++;
                } else {
                    // Fallback: append to a simple file if internalStream not available
                    const logsDir = path.dirname(this.activeFilePath || '.');
                    fsp.appendFile(path.join(logsDir, 'access_internal.log'), `${logLine}\n`).catch(() => { /* swallow */ });
                    this.internalWriteCounter++;
                }
            } catch (e) {
                // ignore errors writing internal logs
            }
            return;
        }

        // Add to recent buffer
        this.recentBuffer.push(entry);
        if (this.recentBuffer.length > this.bufferSize) {
            this.recentBuffer.shift();
        }

        // Format log line
        const timestamp = new Date(entry.timestamp).toISOString();
        const statusCode = entry.statusCode || 0;
        const responseTime = entry.responseTime || 0;
        const requestSize = entry.requestSize || 0;
        const responseSize = entry.responseSize || 0;
        const userInfo = entry.userName ? `"${entry.userName}"` : '-';
        const userAgent = entry.userAgent || '-';
        const referer = entry.referer || '-';
        const blocked = entry.blocked ? 'BLOCKED' : 'OK';
        const reason = entry.reason || '-';

        // Combined Log Format + extensions
        const logLine = `${entry.ip} - ${userInfo} [${timestamp}] "${entry.method} ${entry.path} HTTP/1.1" ${statusCode} ${responseSize} "${referer}" "${userAgent}" ${responseTime}ms ${requestSize}b ${blocked} "${reason}"`;

        // Write to file
        this.lrStream.write(`${logLine}\n`);
        this.writeCounter++;
    }

    /**
     * Search access logs with filters
     */
    searchLogs(filters: {
        ip?: string;
        path?: string;
        method?: string;
        status?: number;
        fromTime?: number;
        toTime?: number;
        blocked?: boolean;
        userName?: string;
        limit?: number;
    }): AccessLogEntry[] {
        let results = this.recentBuffer;

        if (filters.ip) {
            results = results.filter(entry => entry.ip.includes(filters.ip!));
        }

        if (filters.path) {
            results = results.filter(entry => entry.path.includes(filters.path!));
        }

        if (filters.method) {
            results = results.filter(entry => entry.method === filters.method);
        }

        if (filters.status) {
            results = results.filter(entry => entry.statusCode === filters.status);
        }

        if (filters.fromTime) {
            results = results.filter(entry => entry.timestamp >= filters.fromTime!);
        }

        if (filters.toTime) {
            results = results.filter(entry => entry.timestamp <= filters.toTime!);
        }

        if (filters.blocked !== undefined) {
            results = results.filter(entry => entry.blocked === filters.blocked);
        }

        if (filters.userName) {
            results = results.filter(entry => 
                entry.userName && entry.userName.toLowerCase().includes(filters.userName!.toLowerCase())
            );
        }

        // Sort by timestamp descending
        results = results.sort((a, b) => b.timestamp - a.timestamp);

        if (filters.limit) {
            results = results.slice(0, filters.limit);
        }

        return results;
    }

    /**
     * Get suspicious activity patterns
     */
    getSuspiciousActivity(): Array<{
        type: 'high_frequency' | 'failed_auth' | 'suspicious_paths' | 'blocked_requests';
        ip: string;
        count: number;
        severity: 'low' | 'medium' | 'high';
        details: string;
    }> {
        const suspicious: Array<{
            type: 'high_frequency' | 'failed_auth' | 'suspicious_paths' | 'blocked_requests';
            ip: string;
            count: number;
            severity: 'low' | 'medium' | 'high';
            details: string;
        }> = [];

        const recentEntries = this.recentBuffer.filter(entry => 
            entry.timestamp > Date.now() - (60 * 60 * 1000) // Last hour
        );

        // Group by IP
        const ipActivity = new Map<string, AccessLogEntry[]>();
        recentEntries.forEach(entry => {
            if (!ipActivity.has(entry.ip)) {
                ipActivity.set(entry.ip, []);
            }
            ipActivity.get(entry.ip)!.push(entry);
        });

        ipActivity.forEach((entries, ip) => {
            const count = entries.length;
            const blocked = entries.filter(e => e.blocked).length;
            const authFailures = entries.filter(e => e.statusCode === 401 || e.statusCode === 403).length;
            const suspiciousPaths = entries.filter(e => 
                e.path.includes('admin') || 
                e.path.includes('login') || 
                e.path.includes('auth') ||
                e.path.includes('api')
            ).length;

            // High frequency requests
            if (count > 1000) {
                suspicious.push({
                    type: 'high_frequency',
                    ip,
                    count,
                    severity: count > 2000 ? 'high' : 'medium',
                    details: `${count} requests in the last hour`
                });
            }

            // Failed authentication attempts
            if (authFailures > 10) {
                suspicious.push({
                    type: 'failed_auth',
                    ip,
                    count: authFailures,
                    severity: authFailures > 50 ? 'high' : 'medium',
                    details: `${authFailures} authentication failures`
                });
            }

            // Suspicious path access
            if (suspiciousPaths > 50) {
                suspicious.push({
                    type: 'suspicious_paths',
                    ip,
                    count: suspiciousPaths,
                    severity: suspiciousPaths > 100 ? 'high' : 'medium',
                    details: `${suspiciousPaths} admin/auth endpoint attempts`
                });
            }

            // Blocked requests
            if (blocked > 0) {
                suspicious.push({
                    type: 'blocked_requests',
                    ip,
                    count: blocked,
                    severity: blocked > 50 ? 'high' : 'low',
                    details: `${blocked} blocked requests`
                });
            }
        });

        return suspicious.sort((a, b) => {
            const severityOrder = { high: 3, medium: 2, low: 1 };
            return severityOrder[b.severity] - severityOrder[a.severity];
        });
    }

    /**
     * Sanitize path for statistics (remove sensitive params)
     */
    private sanitizePath(path: string): string {
        // Remove query parameters
        const pathOnly = path.split('?')[0];
        
        // Replace IDs with placeholder
        return pathOnly.replace(/\/\d+/g, '/:id')
                      .replace(/\/[a-fA-F0-9-]{32,}/g, '/:uuid')
                      .replace(/\/[a-fA-F0-9]{20,}/g, '/:token');
    }

    // Using LoggerBase.getLogFile for file access to keep a single implementation
}