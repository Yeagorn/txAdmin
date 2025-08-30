const modulename = 'IPBlockManager';
import consoleFactory from '@lib/console';
import { isIpAddressLocal } from '@lib/host/isIpAddressLocal';
const console = consoleFactory(modulename);

export interface IPBlockEntry {
    ip: string;
    reason: string;
    addedBy: string;
    timestamp: number;
    expiration?: number; // Unix timestamp, undefined for permanent
    autoBlocked: boolean; // True if blocked by DDoS protection
    hitCount: number; // Number of blocked requests
    lastHit: number; // Last time this IP tried to access
}

export interface IPBlockStats {
    totalBlocked: number;
    activeBlocks: number;
    autoBlocks: number;
    manualBlocks: number;
    expiredBlocks: number;
    topBlockedIps: Array<{ ip: string; hits: number; reason: string; }>;
}

/**
 * Manager for IP blocking functionality with automatic and manual blocking
 */
export default class IPBlockManager {
    private blockedIps = new Map<string, IPBlockEntry>();
    private readonly maxEntries = 50000; // Maximum number of blocked IPs to keep in memory
    
    constructor() {
        // Clean up expired blocks every 5 minutes
        setInterval(() => {
            this.cleanupExpiredBlocks();
        }, 5 * 60 * 1000);

        // Log statistics every hour
        setInterval(() => {
            const stats = this.getStats();
            if (stats.activeBlocks > 0) {
                console.log(`IP Block Status: ${stats.activeBlocks} active blocks (${stats.autoBlocks} auto, ${stats.manualBlocks} manual)`);
            }
        }, 60 * 60 * 1000);
    }

    /**
     * Check if an IP is blocked
     */
    isBlocked(ip: string): { blocked: boolean; entry?: IPBlockEntry } {
        // Local IPs are never blocked
        if (isIpAddressLocal(ip)) {
            return { blocked: false };
        }

        const entry = this.blockedIps.get(ip);
        if (!entry) {
            return { blocked: false };
        }

        // Check if block has expired
        if (entry.expiration && entry.expiration < Date.now()) {
            this.blockedIps.delete(ip);
            return { blocked: false };
        }

        // Update hit count and last hit time
        entry.hitCount++;
        entry.lastHit = Date.now();
        this.blockedIps.set(ip, entry);

        return { blocked: true, entry };
    }

    /**
     * Block an IP address manually
     */
    blockIP(
        ip: string, 
        reason: string, 
        addedBy: string, 
        durationMinutes?: number
    ): { success: boolean; message: string } {
        // Validate IP format
        if (!this.isValidIP(ip)) {
            return { success: false, message: 'Invalid IP address format' };
        }

        // Don't allow blocking local IPs
        if (isIpAddressLocal(ip)) {
            return { success: false, message: 'Cannot block local IP addresses' };
        }

        const timestamp = Date.now();
        const expiration = durationMinutes ? timestamp + (durationMinutes * 60 * 1000) : undefined;

        const entry: IPBlockEntry = {
            ip,
            reason,
            addedBy,
            timestamp,
            expiration,
            autoBlocked: false,
            hitCount: 0,
            lastHit: timestamp,
        };

        this.blockedIps.set(ip, entry);
        this.limitEntries();

        const durationText = durationMinutes ? `for ${durationMinutes} minutes` : 'permanently';
        console.warn(`IP ${ip} blocked ${durationText} by ${addedBy}: ${reason}`);

        return { 
            success: true, 
            message: `IP ${ip} has been blocked ${durationText}`
        };
    }

    /**
     * Block an IP address automatically (by DDoS protection)
     */
    autoBlockIP(ip: string, reason: string): { success: boolean; message: string } {
        // Don't auto-block local IPs
        if (isIpAddressLocal(ip)) {
            return { success: false, message: 'Cannot auto-block local IP addresses' };
        }

        const timestamp = Date.now();
        const expiration = timestamp + (15 * 60 * 1000); // Auto-blocks expire after 15 minutes

        const existingEntry = this.blockedIps.get(ip);
        if (existingEntry && existingEntry.autoBlocked) {
            // Extend the expiration time for existing auto-blocks
            existingEntry.expiration = expiration;
            existingEntry.hitCount++;
            existingEntry.lastHit = timestamp;
            this.blockedIps.set(ip, existingEntry);
            return { success: true, message: 'Auto-block time extended' };
        }

        const entry: IPBlockEntry = {
            ip,
            reason,
            addedBy: 'system',
            timestamp,
            expiration,
            autoBlocked: true,
            hitCount: 0,
            lastHit: timestamp,
        };

        this.blockedIps.set(ip, entry);
        this.limitEntries();

        return { success: true, message: `IP ${ip} auto-blocked for DDoS protection` };
    }

    /**
     * Unblock an IP address
     */
    unblockIP(ip: string, removedBy: string): { success: boolean; message: string } {
        const entry = this.blockedIps.get(ip);
        if (!entry) {
            return { success: false, message: 'IP address is not blocked' };
        }

        this.blockedIps.delete(ip);
        console.log(`IP ${ip} unblocked by ${removedBy}`);

        return { success: true, message: `IP ${ip} has been unblocked` };
    }

    /**
     * Get all blocked IPs with pagination
     */
    getBlockedIPs(
        page = 1,
        limit = 50,
        filter?: {
            search?: string;
            autoBlocked?: boolean;
            includeExpired?: boolean;
        }
    ): {
        entries: IPBlockEntry[];
        total: number;
        pages: number;
        currentPage: number;
    } {
        let entries = Array.from(this.blockedIps.values());

        // Apply filters
        if (filter) {
            if (filter.search) {
                const searchLower = filter.search.toLowerCase();
                entries = entries.filter(entry => 
                    entry.ip.includes(searchLower) ||
                    entry.reason.toLowerCase().includes(searchLower) ||
                    entry.addedBy.toLowerCase().includes(searchLower)
                );
            }

            if (filter.autoBlocked !== undefined) {
                entries = entries.filter(entry => entry.autoBlocked === filter.autoBlocked);
            }

            if (!filter.includeExpired) {
                const now = Date.now();
                entries = entries.filter(entry => 
                    !entry.expiration || entry.expiration > now
                );
            }
        }

        // Sort by timestamp (newest first)
        entries.sort((a, b) => b.timestamp - a.timestamp);

        // Pagination
        const total = entries.length;
        const pages = Math.ceil(total / limit);
        const start = (page - 1) * limit;
        const paginatedEntries = entries.slice(start, start + limit);

        return {
            entries: paginatedEntries,
            total,
            pages,
            currentPage: page,
        };
    }

    /**
     * Get blocking statistics
     */
    getStats(): IPBlockStats {
        const now = Date.now();
        let activeBlocks = 0;
        let autoBlocks = 0;
        let manualBlocks = 0;
        let expiredBlocks = 0;

        const hitCounts = new Map<string, { hits: number; reason: string; }>();

        this.blockedIps.forEach((entry) => {
            const isExpired = entry.expiration && entry.expiration < now;
            
            if (isExpired) {
                expiredBlocks++;
            } else {
                activeBlocks++;
                if (entry.autoBlocked) {
                    autoBlocks++;
                } else {
                    manualBlocks++;
                }
            }

            hitCounts.set(entry.ip, {
                hits: entry.hitCount,
                reason: entry.reason,
            });
        });

        const topBlockedIps = Array.from(hitCounts.entries())
            .map(([ip, data]) => ({ ip, hits: data.hits, reason: data.reason }))
            .sort((a, b) => b.hits - a.hits)
            .slice(0, 10);

        return {
            totalBlocked: this.blockedIps.size,
            activeBlocks,
            autoBlocks,
            manualBlocks,
            expiredBlocks,
            topBlockedIps,
        };
    }

    /**
     * Clear all expired blocks
     */
    cleanupExpiredBlocks(): number {
        const now = Date.now();
        let removed = 0;

        this.blockedIps.forEach((entry, ip) => {
            if (entry.expiration && entry.expiration < now) {
                this.blockedIps.delete(ip);
                removed++;
            }
        });

        if (removed > 0) {
            console.verbose.log(`Cleaned up ${removed} expired IP blocks`);
        }

        return removed;
    }

    /**
     * Clear all auto-blocks (used when DDoS attack stops)
     */
    clearAutoBlocks(): number {
        let removed = 0;

        this.blockedIps.forEach((entry, ip) => {
            if (entry.autoBlocked) {
                this.blockedIps.delete(ip);
                removed++;
            }
        });

        if (removed > 0) {
            console.log(`Cleared ${removed} auto-blocked IPs`);
        }

        return removed;
    }

    /**
     * Import blocked IPs from the existing rate limiter
     */
    importFromRateLimiter(bannedIps: Set<string>): number {
        let imported = 0;

        bannedIps.forEach(ip => {
            if (!this.blockedIps.has(ip)) {
                this.autoBlockIP(ip, 'DDoS protection (imported)');
                imported++;
            }
        });

        return imported;
    }

    /**
     * Export current blocked IPs for backup/migration
     */
    exportBlocks(): IPBlockEntry[] {
        return Array.from(this.blockedIps.values());
    }

    /**
     * Import blocked IPs from backup/migration
     */
    importBlocks(entries: IPBlockEntry[]): number {
        let imported = 0;

        entries.forEach(entry => {
            if (this.isValidIP(entry.ip) && !isIpAddressLocal(entry.ip)) {
                this.blockedIps.set(entry.ip, entry);
                imported++;
            }
        });

        this.limitEntries();
        return imported;
    }

    /**
     * Get usage information for diagnostics
     */
    getUsageInfo(): string {
        const stats = this.getStats();
        return `Blocked IPs: ${stats.activeBlocks} active (${stats.autoBlocks} auto, ${stats.manualBlocks} manual), ${stats.expiredBlocks} expired`;
    }

    /**
     * Validate IP address format
     */
    private isValidIP(ip: string): boolean {
        const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
        return ipv4Regex.test(ip) || ipv6Regex.test(ip);
    }

    /**
     * Limit the number of entries to prevent memory exhaustion
     */
    private limitEntries(): void {
        if (this.blockedIps.size > this.maxEntries) {
            // Remove oldest entries (by timestamp)
            const entries = Array.from(this.blockedIps.entries())
                .sort(([, a], [, b]) => a.timestamp - b.timestamp);
            
            const toRemove = this.blockedIps.size - this.maxEntries + 1000; // Remove extra to avoid frequent cleanup
            
            for (let i = 0; i < toRemove && i < entries.length; i++) {
                this.blockedIps.delete(entries[i][0]);
            }

            console.verbose.warn(`Removed ${toRemove} old IP block entries to prevent memory exhaustion`);
        }
    }
}