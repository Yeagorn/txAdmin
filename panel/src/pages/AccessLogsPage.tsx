import React, { useEffect, useState } from 'react';
import { RefreshCwIcon, DownloadIcon, BanIcon, GlobeIcon, UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBackendApi } from '@/hooks/fetch';

interface AccessLogEntry {
  timestamp: number;
  ip: string;
  method: string;
  path: string;
  statusCode?: number;
  userName?: string;
  blocked?: boolean;
}

interface OverviewStats {
  totalRequests: number;
  uniqueIps: number;
  blockedRequests: number;
  topIps: Array<{ ip: string; count: number; blocked: number; }>;
  topPaths: Array<{ path: string; count: number; }>;
  requestsByHour: Array<{ hour: number; count: number; blocked: number; }>;
}

interface SuspiciousActivity {
  type: 'high_frequency' | 'failed_auth' | 'suspicious_paths' | 'blocked_requests';
  ip: string;
  count: number;
  severity: 'low' | 'medium' | 'high';
  details: string;
}

export default function AccessLogsPage() {
  const [logs, setLogs] = useState<AccessLogEntry[]>([]);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [suspicious, setSuspicious] = useState<SuspiciousActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [ipFilter, setIpFilter] = useState('');
  const [pathFilter, setPathFilter] = useState('');

  const apiGetLogs = useBackendApi<{ entries: AccessLogEntry[]; stats?: OverviewStats; suspicious?: SuspiciousActivity[]; }>(
    { method: 'GET', path: '/accessLogs' }
  );
  const apiIpBlocks = useBackendApi({ method: 'GET', path: '/ipBlocks' });

  const loadOverview = async () => {
    try {
      const res = await apiGetLogs({ queryParams: { limit: '100' } });
      if (res && (res as any).stats) {
        setStats((res as any).stats);
      }
      if (res && (res as any).suspicious) {
        setSuspicious((res as any).suspicious);
      }
      if (res && (res as any).entries) {
        setLogs((res as any).entries);
      }
    } catch (e) {
      console.error('Failed to load overview stats', e);
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const queryParams: any = {};
      if (ipFilter) queryParams.ip = ipFilter;
      if (pathFilter) queryParams.path = pathFilter;
      const res = await apiGetLogs({ queryParams });
      if (res && (res as any).entries) setLogs((res as any).entries);
    } catch (e) {
      console.error('Failed to load logs', e);
    } finally {
      setLoading(false);
    }
  };

  const downloadMainLog = () => {
    window.location.href = '/accessLogs/download';
  };

  const [ipBlocks, setIpBlocks] = useState<Array<any>>([]);
  const loadIpBlocks = async () => {
    try {
      const res = await apiIpBlocks({});
      if (res && (res as any).entries) setIpBlocks((res as any).entries);
    } catch (e) {
      console.error('Failed to load IP blocks', e);
    }
  };

  // Helper function to calculate method distribution from logs
  const getMethodDistribution = () => {
    const methods = logs.reduce((acc, log) => {
      acc[log.method] = (acc[log.method] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const total = Object.values(methods).reduce((sum, count) => sum + count, 0);
    return Object.entries(methods).map(([method, count]) => ({
      method,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0
    }));
  };

  // Helper function to calculate status code distribution from logs
  const getStatusDistribution = () => {
    const statuses = logs.reduce((acc, log) => {
      if (log.statusCode) {
        const category = Math.floor(log.statusCode / 100);
        const key = `${category}xx`;
        acc[key] = (acc[key] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    const total = Object.values(statuses).reduce((sum, count) => sum + count, 0);
    return Object.entries(statuses).map(([status, count]) => ({
      status,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0
    }));
  };

  const getSeverityColor = (severity: string): "default" | "destructive" | "secondary" | "outline" => {
    switch (severity) {
      case 'high': return 'destructive';
      case 'medium': return 'outline';
      case 'low': return 'secondary';
      default: return 'default';
    }
  };

  useEffect(() => {
    loadOverview();
    loadLogs();
    loadIpBlocks();
  }, []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Access Logs & Security</h1>
          <p className="text-sm text-muted-foreground">Monitor HTTP access, manage IP blocks, and analyze security events</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={() => { loadOverview(); loadLogs(); loadIpBlocks(); }} disabled={loading}><RefreshCwIcon className="w-4 h-4 mr-2" />Refresh</Button>
          <Button onClick={downloadMainLog}><DownloadIcon className="w-4 h-4 mr-2" />Download Main Log</Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="access-logs">Access Logs</TabsTrigger>
          <TabsTrigger value="ip-blocks">IP Blocks</TabsTrigger>
          <TabsTrigger value="suspicious">Suspicious</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                <GlobeIcon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalRequests?.toLocaleString() || '0'}</div>
                <p className="text-xs text-muted-foreground">Last 24 hours</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Unique IPs</CardTitle>
                <UserIcon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.uniqueIps?.toLocaleString() || '0'}</div>
                <p className="text-xs text-muted-foreground">Distinct visitors</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Blocked Requests</CardTitle>
                <BanIcon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.blockedRequests?.toLocaleString() || '0'}</div>
                <p className="text-xs text-muted-foreground">Security blocks</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Blocks</CardTitle>
                <BanIcon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{ipBlocks?.length?.toLocaleString() || '0'}</div>
                <p className="text-xs text-muted-foreground">Currently blocked IPs</p>
              </CardContent>
            </Card>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest access attempts (excluding localhost)</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>Path</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.filter(l => l.ip !== '127.0.0.1').slice(0, 5).map((l, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{new Date(l.timestamp).toLocaleTimeString()}</TableCell>
                        <TableCell className="font-mono text-xs">{l.ip}</TableCell>
                        <TableCell className="max-w-xs truncate">{l.path}</TableCell>
                        <TableCell>{l.statusCode || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Top IPs</CardTitle>
                <CardDescription>Most active IP addresses (excluding localhost)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats?.topIps?.filter(ipStat => ipStat.ip !== '127.0.0.1').slice(0, 5).map((ipStat, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="font-mono text-sm">{ipStat.ip}</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm">{ipStat.count} requests</span>
                        {ipStat.blocked > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {ipStat.blocked} blocked
                          </Badge>
                        )}
                      </div>
                    </div>
                  )) || (
                    <div className="text-center text-muted-foreground py-4">
                      No IP activity data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="access-logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Filter Requests</CardTitle>
              <CardDescription>Filter by IP or path</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <Label>IP</Label>
                  <Input value={ipFilter} onChange={(e) => setIpFilter(e.target.value)} placeholder="Filter by IP" />
                </div>
                <div>
                  <Label>Path</Label>
                  <Input value={pathFilter} onChange={(e) => setPathFilter(e.target.value)} placeholder="Filter by path" />
                </div>
                <div className="flex items-end">
                  <Button onClick={loadLogs}><RefreshCwIcon className="w-4 h-4 mr-2" />Apply</Button>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Path</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>User</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.filter(l => l.ip !== '127.0.0.1').slice(0, 500).map((l, i) => (
                    <TableRow key={i} className={l.blocked ? 'bg-destructive/10' : ''}>
                      <TableCell className="font-mono text-xs">{new Date(l.timestamp).toLocaleTimeString()}</TableCell>
                      <TableCell className="font-mono text-xs">{l.ip}</TableCell>
                      <TableCell><Badge>{l.method}</Badge></TableCell>
                      <TableCell className="max-w-xs truncate">{l.path}</TableCell>
                      <TableCell>{l.statusCode || '-'}</TableCell>
                      <TableCell>{l.userName || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ip-blocks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>IP Blocks</CardTitle>
              <CardDescription>Manage blocked IP addresses and review blocked activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Search IP</Label>
                    <Input placeholder="Search by IP or reason" />
                  </div>
                  <div>
                    <Label>Filter</Label>
                    <Input placeholder="auto/manual" />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={loadIpBlocks}><RefreshCwIcon className="w-4 h-4 mr-2" />Refresh Blocks</Button>
                  </div>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>IP</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Added By</TableHead>
                    <TableHead>Hits</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ipBlocks.map((b: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono">{b.ip}</TableCell>
                      <TableCell>{b.reason}</TableCell>
                      <TableCell>{b.addedBy}</TableCell>
                      <TableCell>{b.hitCount}</TableCell>
                      <TableCell>
                        <Button size="sm">Unblock</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suspicious" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Suspicious Activity</CardTitle>
              <CardDescription>Potential security threats detected by the system</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {suspicious.filter(activity => activity.ip !== '127.0.0.1').map((activity, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <Badge variant={getSeverityColor(activity.severity)}>
                        {activity.severity.toUpperCase()}
                      </Badge>
                      <div>
                        <p className="font-medium">{activity.details}</p>
                        <p className="text-sm text-muted-foreground">
                          IP: {activity.ip} - {activity.count} occurrences ({activity.type.replace('_', ' ')})
                        </p>
                      </div>
                    </div>
                    <Button size="sm">Block IP</Button>
                  </div>
                ))}
                {suspicious.filter(activity => activity.ip !== '127.0.0.1').length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No suspicious activity detected in recent logs.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Request Methods</CardTitle>
                <CardDescription>Distribution of HTTP methods</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {getMethodDistribution().map((method, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span>{method.method}</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-32 bg-secondary rounded-full h-2">
                          <div className="bg-primary h-2 rounded-full" style={{width: `${method.percentage}%`}}></div>
                        </div>
                        <span className="text-sm">{method.percentage}%</span>
                      </div>
                    </div>
                  ))}
                  {getMethodDistribution().length === 0 && (
                    <div className="text-center text-muted-foreground py-4">No method data available</div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Response Status Codes</CardTitle>
                <CardDescription>HTTP response distribution</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {getStatusDistribution().map((status, index) => {
                    const getStatusColor = (statusCode: string) => {
                      if (statusCode.startsWith('2')) return 'bg-green-500';
                      if (statusCode.startsWith('3')) return 'bg-blue-500';
                      if (statusCode.startsWith('4')) return 'bg-yellow-500';
                      if (statusCode.startsWith('5')) return 'bg-red-500';
                      return 'bg-gray-500';
                    };
                    
                    return (
                      <div key={index} className="flex justify-between items-center">
                        <span>{status.status} {status.status.startsWith('2') ? 'Success' : status.status.startsWith('4') ? 'Client Error' : status.status.startsWith('5') ? 'Server Error' : 'Redirect'}</span>
                        <div className="flex items-center space-x-2">
                          <div className="w-32 bg-secondary rounded-full h-2">
                            <div className={`h-2 rounded-full ${getStatusColor(status.status)}`} style={{width: `${status.percentage}%`}}></div>
                          </div>
                          <span className="text-sm">{status.percentage}%</span>
                        </div>
                      </div>
                    );
                  })}
                  {getStatusDistribution().length === 0 && (
                    <div className="text-center text-muted-foreground py-4">No status data available</div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Paths</CardTitle>
                <CardDescription>Most accessed endpoints</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats?.topPaths?.slice(0, 10).map((pathStat, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="font-mono text-sm truncate max-w-xs">{pathStat.path}</span>
                      <span className="text-sm">{pathStat.count} hits</span>
                    </div>
                  )) || (
                    <div className="text-center text-muted-foreground py-4">No path data available</div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Requests Over Time</CardTitle>
                <CardDescription>Hourly request distribution (last 24h)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end space-x-1 h-32">
                  {stats?.requestsByHour?.map((hourStat, i) => {
                    const maxCount = Math.max(...(stats?.requestsByHour?.map(h => h.count) || [1]));
                    const height = maxCount > 0 ? (hourStat.count / maxCount) * 100 : 0;
                    const currentHour = new Date().getHours();
                    
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center">
                        <div 
                          className={`w-full rounded-t ${hourStat.hour === currentHour ? 'bg-primary' : 'bg-secondary'}`}
                          style={{ height: `${Math.max(height, 5)}%` }}
                          title={`${hourStat.hour}:00 - ${hourStat.count} requests${hourStat.blocked ? `, ${hourStat.blocked} blocked` : ''}`}
                        ></div>
                      </div>
                    );
                  }) || Array.from({length: 24}, (_, i) => (
                    <div key={i} className="flex-1 bg-secondary rounded-t" style={{ height: '20%' }}></div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>00:00</span>
                  <span>06:00</span>
                  <span>12:00</span>
                  <span>18:00</span>
                  <span>24:00</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}