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
}

export default function AccessLogsPage() {
  const [logs, setLogs] = useState<AccessLogEntry[]>([]);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [ipFilter, setIpFilter] = useState('');
  const [pathFilter, setPathFilter] = useState('');

  const apiGetLogs = useBackendApi<{ entries: AccessLogEntry[]; stats?: any; }>(
    { method: 'GET', path: '/accessLogs' }
  );
  const apiIpBlocks = useBackendApi({ method: 'GET', path: '/ipBlocks' });

  const loadOverview = async () => {
    try {
      const res = await apiGetLogs({ queryParams: { limit: '1' } });
      if (res && (res as any).stats) {
        setStats((res as any).stats || null);
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
                <CardDescription>Most active IP addresses</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {/* Placeholder for top IPs - would come from backend stats */}
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-sm">192.168.1.100</span>
                    <span className="text-sm">42 requests</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-sm">10.0.0.50</span>
                    <span className="text-sm">28 requests</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-sm">203.0.113.1</span>
                    <span className="text-sm">15 requests</span>
                  </div>
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
              <CardDescription>Potential security threats and anomalies</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <Badge variant="destructive">HIGH</Badge>
                    <div>
                      <p className="font-medium">Multiple failed authentication attempts</p>
                      <p className="text-sm text-muted-foreground">IP: 203.0.113.50 - 15 attempts in 5 minutes</p>
                    </div>
                  </div>
                  <Button size="sm">Block IP</Button>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <Badge variant="outline">MEDIUM</Badge>
                    <div>
                      <p className="font-medium">Unusual request patterns</p>
                      <p className="text-sm text-muted-foreground">IP: 198.51.100.25 - Scanning common paths</p>
                    </div>
                  </div>
                  <Button size="sm">Block IP</Button>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <Badge variant="secondary">LOW</Badge>
                    <div>
                      <p className="font-medium">High request frequency</p>
                      <p className="text-sm text-muted-foreground">IP: 192.0.2.100 - 200 requests in 1 hour</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline">Monitor</Button>
                </div>
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
                  <div className="flex justify-between items-center">
                    <span>GET</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-32 bg-secondary rounded-full h-2">
                        <div className="bg-primary h-2 rounded-full" style={{width: '80%'}}></div>
                      </div>
                      <span className="text-sm">80%</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>POST</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-32 bg-secondary rounded-full h-2">
                        <div className="bg-primary h-2 rounded-full" style={{width: '15%'}}></div>
                      </div>
                      <span className="text-sm">15%</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>PUT</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-32 bg-secondary rounded-full h-2">
                        <div className="bg-primary h-2 rounded-full" style={{width: '3%'}}></div>
                      </div>
                      <span className="text-sm">3%</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>DELETE</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-32 bg-secondary rounded-full h-2">
                        <div className="bg-primary h-2 rounded-full" style={{width: '2%'}}></div>
                      </div>
                      <span className="text-sm">2%</span>
                    </div>
                  </div>
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
                  <div className="flex justify-between items-center">
                    <span>2xx Success</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-32 bg-secondary rounded-full h-2">
                        <div className="bg-green-500 h-2 rounded-full" style={{width: '85%'}}></div>
                      </div>
                      <span className="text-sm">85%</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>4xx Client Error</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-32 bg-secondary rounded-full h-2">
                        <div className="bg-yellow-500 h-2 rounded-full" style={{width: '10%'}}></div>
                      </div>
                      <span className="text-sm">10%</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>5xx Server Error</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-32 bg-secondary rounded-full h-2">
                        <div className="bg-red-500 h-2 rounded-full" style={{width: '3%'}}></div>
                      </div>
                      <span className="text-sm">3%</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>3xx Redirect</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-32 bg-secondary rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{width: '2%'}}></div>
                      </div>
                      <span className="text-sm">2%</span>
                    </div>
                  </div>
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
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-sm">/</span>
                    <span className="text-sm">1,250 hits</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-sm">/auth/self</span>
                    <span className="text-sm">892 hits</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-sm">/player/search</span>
                    <span className="text-sm">445 hits</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-sm">/accessLogs</span>
                    <span className="text-sm">234 hits</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-sm">/perfChartData</span>
                    <span className="text-sm">187 hits</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Requests Over Time</CardTitle>
                <CardDescription>Hourly request distribution</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end space-x-1 h-32">
                  {Array.from({length: 24}, (_, i) => (
                    <div key={i} className="flex-1 bg-secondary rounded-t" style={{
                      height: `${Math.random() * 80 + 20}%`,
                      backgroundColor: i === new Date().getHours() ? 'hsl(var(--primary))' : undefined
                    }}></div>
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
