const modulename = 'IPWhitelistManager';
import consoleFactory from '@lib/console';
import { isIpAddressLocal } from '@lib/host/isIpAddressLocal';
const console = consoleFactory(modulename);

export interface IPWhitelistEntry {
    ip: string;
    reason: string;
    addedBy: string;
    timestamp: number;
    expiration?: number;
    adminUser?: string; // For admin-specific whitelist
    hitCount: number;
    lastHit: number;
}

export interface IPWhitelistStats {
    totalWhitelisted: number;
    activeWhitelists: number;
    adminWhitelists: number;
    manualWhitelists: number;
    expiredWhitelists: number;
    topWhitelistedIps: Array<{ ip: string; hits: number; reason: string; adminUser?: string; }>;
}

export interface IPWhitelistFilterOptions {
    search?: string;
    adminUser?: string;
    includeExpired?: boolean;
}

export interface IPWhitelistResult {
    entries: IPWhitelistEntry[];
    total: number;
    pages: number;
    currentPage: number;
}

/**
 * Manager for IP whitelisting functionality with automatic and manual whitelisting
 */
export default class IPWhitelistManager {
    private whitelistedIps = new Map<string, IPWhitelistEntry>();
    private readonly maxEntries = 10000; // Maximum number of whitelisted IPs to keep in memory
    
    constructor() {
        this.cleanup();
        // Run cleanup every 5 minutes
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    /**
     * Check if an IP is whitelisted
     */
    isWhitelisted(ip: string, adminUser?: string): { whitelisted: boolean; entry?: IPWhitelistEntry } {
        const entry = this.whitelistedIps.get(ip);
        if (!entry) {
            return { whitelisted: false };
        }

        // Check if expired
        if (entry.expiration && entry.expiration < Date.now()) {
            this.whitelistedIps.delete(ip);
            return { whitelisted: false };
        }

        // If checking for specific admin, verify match
        if (adminUser && entry.adminUser && entry.adminUser !== adminUser) {
            return { whitelisted: false };
        }

        // Update hit count
        entry.hitCount++;
        entry.lastHit = Date.now();
        this.whitelistedIps.set(ip, entry);

        return { whitelisted: true, entry };
    }

    /**
     * Whitelist an IP address manually
     */
    whitelistIP(
        ip: string, 
        reason: string, 
        addedBy: string, 
        durationMinutes?: number,
        adminUser?: string
    ): { success: boolean; message: string } {
        // Validate IP format
        if (!this.isValidIP(ip)) {
            return { success: false, message: 'Invalid IP address format' };
        }

        const timestamp = Date.now();
        const expiration = durationMinutes ? timestamp + (durationMinutes * 60 * 1000) : undefined;

        const entry: IPWhitelistEntry = {
            ip,
            reason,
            addedBy,
            timestamp,
            expiration,
            adminUser,
            hitCount: 0,
            lastHit: timestamp,
        };

        this.whitelistedIps.set(ip, entry);
        this.limitEntries();

        const durationText = durationMinutes ? `for ${durationMinutes} minutes` : 'permanently';
        const adminText = adminUser ? ` for admin ${adminUser}` : '';
        console.log(`IP ${ip} whitelisted ${durationText}${adminText} by ${addedBy}: ${reason}`);

        return { 
            success: true, 
            message: `IP ${ip} has been whitelisted ${durationText}${adminText}`
        };
    }

    /**
     * Remove an IP from whitelist
     */
    removeFromWhitelist(ip: string, removedBy: string): { success: boolean; message: string } {
        const entry = this.whitelistedIps.get(ip);
        if (!entry) {
            return { success: false, message: 'IP address is not whitelisted' };
        }

        this.whitelistedIps.delete(ip);
        console.log(`IP ${ip} removed from whitelist by ${removedBy}`);

        return { success: true, message: `IP ${ip} has been removed from whitelist` };
    }

    /**
     * Get whitelisted IPs with pagination and filtering
     */
    getWhitelistedIPs(
        page: number = 1,
        limit: number = 50,
        options: IPWhitelistFilterOptions = {}
    ): IPWhitelistResult {
        let entries = Array.from(this.whitelistedIps.values());

        // Filter by admin user
        if (options.adminUser) {
            entries = entries.filter(entry => entry.adminUser === options.adminUser);
        }

        // Filter expired entries
        if (!options.includeExpired) {
            const now = Date.now();
            entries = entries.filter(entry => !entry.expiration || entry.expiration > now);
        }

        // Search filter
        if (options.search) {
            const searchLower = options.search.toLowerCase();
            entries = entries.filter(entry => 
                entry.ip.includes(searchLower) ||
                entry.reason.toLowerCase().includes(searchLower) ||
                entry.addedBy.toLowerCase().includes(searchLower) ||
                (entry.adminUser && entry.adminUser.toLowerCase().includes(searchLower))
            );
        }

        // Sort by timestamp (newest first)
        entries.sort((a, b) => b.timestamp - a.timestamp);

        // Pagination
        const total = entries.length;
        const pages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedEntries = entries.slice(startIndex, endIndex);

        return {
            entries: paginatedEntries,
            total,
            pages,
            currentPage: page,
        };
    }

    /**
     * Get all whitelisted IPs for a specific admin
     */
    getAdminWhitelistedIPs(adminUser: string): IPWhitelistEntry[] {
        const entries = Array.from(this.whitelistedIps.values());
        return entries.filter(entry => entry.adminUser === adminUser);
    }

    /**
     * Get whitelist statistics
     */
    getStats(): IPWhitelistStats {
        const entries = Array.from(this.whitelistedIps.values());
        const now = Date.now();

        const activeEntries = entries.filter(entry => !entry.expiration || entry.expiration > now);
        const expiredEntries = entries.filter(entry => entry.expiration && entry.expiration <= now);
        const adminEntries = entries.filter(entry => entry.adminUser);
        const manualEntries = entries.filter(entry => !entry.adminUser);

        // Get top whitelisted IPs by hit count
        const topWhitelistedIps = entries
            .sort((a, b) => b.hitCount - a.hitCount)
            .slice(0, 10)
            .map(entry => ({
                ip: entry.ip,
                hits: entry.hitCount,
                reason: entry.reason,
                adminUser: entry.adminUser
            }));

        return {
            totalWhitelisted: entries.length,
            activeWhitelists: activeEntries.length,
            adminWhitelists: adminEntries.length,
            manualWhitelists: manualEntries.length,
            expiredWhitelists: expiredEntries.length,
            topWhitelistedIps
        };
    }

    /**
     * Cleanup expired entries
     */
    cleanup(): number {
        let removed = 0;
        const now = Date.now();

        this.whitelistedIps.forEach((entry, ip) => {
            if (entry.expiration && entry.expiration <= now) {
                this.whitelistedIps.delete(ip);
                removed++;
            }
        });

        if (removed > 0) {
            console.log(`Cleaned up ${removed} expired whitelist entries`);
        }

        return removed;
    }

    /**
     * Clear all admin-specific whitelists for a user
     */
    clearAdminWhitelists(adminUser: string): number {
        let removed = 0;

        this.whitelistedIps.forEach((entry, ip) => {
            if (entry.adminUser === adminUser) {
                this.whitelistedIps.delete(ip);
                removed++;
            }
        });

        if (removed > 0) {
            console.log(`Cleared ${removed} whitelist entries for admin ${adminUser}`);
        }

        return removed;
    }

    /**
     * Clear all manual whitelists
     */
    clearManualWhitelists(): number {
        let removed = 0;

        this.whitelistedIps.forEach((entry, ip) => {
            if (!entry.adminUser) {
                this.whitelistedIps.delete(ip);
                removed++;
            }
        });

        if (removed > 0) {
            console.log(`Cleared ${removed} manual whitelist entries`);
        }

        return removed;
    }

    /**
     * Import whitelisted IPs from external source
     */
    importWhitelists(entries: IPWhitelistEntry[]): number {
        let imported = 0;

        entries.forEach(entry => {
            if (this.isValidIP(entry.ip) && !this.whitelistedIps.has(entry.ip)) {
                this.whitelistedIps.set(entry.ip, entry);
                imported++;
            }
        });

        this.limitEntries();
        return imported;
    }

    /**
     * Export current whitelisted IPs for backup/migration
     */
    exportWhitelists(): IPWhitelistEntry[] {
        return Array.from(this.whitelistedIps.values());
    }

    /**
     * Get usage information for diagnostics
     */
    getUsageInfo(): string {
        const entries = Array.from(this.whitelistedIps.values());
        const adminEntries = entries.filter(e => e.adminUser).length;
        const manualEntries = entries.filter(e => !e.adminUser).length;
        
        return `Whitelisted IPs: ${entries.length} total (${adminEntries} admin-specific, ${manualEntries} manual)`;
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
        if (this.whitelistedIps.size <= this.maxEntries) return;

        // Convert to array and sort by last hit (oldest first)
        const entries = Array.from(this.whitelistedIps.entries());
        entries.sort((a, b) => a[1].lastHit - b[1].lastHit);

        // Remove oldest entries until we're under the limit
        const toRemove = this.whitelistedIps.size - this.maxEntries;
        for (let i = 0; i < toRemove; i++) {
            this.whitelistedIps.delete(entries[i][0]);
        }

        console.warn(`Removed ${toRemove} oldest whitelist entries to prevent memory exhaustion`);
    }
}