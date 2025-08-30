import React, { useEffect, useState } from 'react';
import { RefreshCwIcon, PlusIcon, UsersIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useBackendApi } from '@/hooks/fetch';

interface IPWhitelistEntry {
  ip: string;
  reason: string;
  addedBy: string;
  timestamp: number;
  expiration?: number;
  adminUser?: string;
  hitCount: number;
  lastHit: number;
}

interface IPWhitelistStats {
  totalWhitelisted: number;
  activeWhitelists: number;
  adminWhitelists: number;
  manualWhitelists: number;
  expiredWhitelists: number;
  topWhitelistedIps: Array<{ ip: string; hits: number; reason: string; adminUser?: string; }>;
}

interface Admin {
  name: string;
}

interface IPWhitelistData {
  entries: IPWhitelistEntry[];
  total: number;
  pages: number;
  currentPage: number;
  stats: IPWhitelistStats;
  admins: Admin[];
}

export default function IPWhitelistPage() {
  const [data, setData] = useState<IPWhitelistData | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [adminFilter, setAdminFilter] = useState('');
  const [page, setPage] = useState(1);
  
  // Add IP Dialog
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({
    ip: '',
    reason: '',
    durationMinutes: '',
    adminUser: '',
  });

  const apiGetWhitelist = useBackendApi<IPWhitelistData>(
    { method: 'GET', path: '/ipWhitelist' }
  );
  const apiWhitelistActions = useBackendApi({ method: 'POST', path: '/ipWhitelist/:action' });

  const loadData = async () => {
    setLoading(true);
    try {
      const queryParams: any = { page: page.toString() };
      if (search) queryParams.search = search;
      if (adminFilter) queryParams.adminUser = adminFilter;

      const res = await apiGetWhitelist({ queryParams });
      if (res) setData(res as IPWhitelistData);
    } catch (error) {
      console.error('Failed to load IP whitelist', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddIP = async () => {
    if (!addForm.ip || !addForm.reason || !addForm.adminUser) {
      alert('IP, reason, and admin user are required');
      return;
    }

    try {
      const requestData: any = {
        ip: addForm.ip,
        reason: addForm.reason,
        adminUser: addForm.adminUser,
      };
      
      if (addForm.durationMinutes) {
        requestData.durationMinutes = parseInt(addForm.durationMinutes);
      }

      await apiWhitelistActions({ 
        pathParams: { action: 'whitelist' },
        data: requestData 
      });
      
      setShowAddDialog(false);
      setAddForm({ ip: '', reason: '', durationMinutes: '', adminUser: '' });
      await loadData();
    } catch (error) {
      console.error('Failed to add IP to whitelist', error);
      alert('Failed to add IP to whitelist');
    }
  };

  const handleRemoveIP = async (ip: string) => {
    if (!confirm(`Are you sure you want to remove ${ip} from the whitelist?`)) return;

    try {
      await apiWhitelistActions({ 
        pathParams: { action: 'remove' },
        data: { ip } 
      });
      await loadData();
    } catch (error) {
      console.error('Failed to remove IP from whitelist', error);
      alert('Failed to remove IP from whitelist');
    }
  };

  const handleClearAdminWhitelist = async (adminUser: string) => {
    if (!confirm(`Are you sure you want to clear all whitelist entries for admin ${adminUser}?`)) return;

    try {
      await apiWhitelistActions({ 
        pathParams: { action: 'clear-admin' },
        data: { adminUser } 
      });
      await loadData();
    } catch (error) {
      console.error('Failed to clear admin whitelist', error);
      alert('Failed to clear admin whitelist');
    }
  };

  useEffect(() => {
    loadData();
  }, [page, search, adminFilter]);

  if (!data) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading IP whitelist...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin IP Whitelist</h1>
          <p className="text-sm text-muted-foreground">Manage IP addresses whitelisted for specific admin users</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={loadData} disabled={loading}>
            <RefreshCwIcon className="w-4 h-4 mr-2" />Refresh
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <PlusIcon className="w-4 h-4 mr-2" />Add IP
          </Button>
        </div>
      </div>

      <div className="space-y-4">

        <Card>
          <CardContent>
            <div className="flex gap-4 mb-4">
              <div className="flex-1">
                <Label>Search</Label>
                <Input 
                  value={search} 
                  onChange={(e) => setSearch(e.target.value)} 
                  placeholder="Search by IP, reason, or admin" 
                />
              </div>
              <div className="w-48">
                <Label>Filter by Admin</Label>
                <Select value={adminFilter || 'all'} onValueChange={(value) => setAdminFilter(value === 'all' ? '' : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All admins" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All admins</SelectItem>
                    {data.admins.map((admin) => (
                      <SelectItem key={admin.name} value={admin.name}>
                        {admin.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={() => { setSearch(''); setAdminFilter(''); }}>Clear</Button>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Admin User</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Added By</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Hits</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.entries.map((entry, index) => (
                  <TableRow key={index} className={entry.expiration && entry.expiration < Date.now() ? 'opacity-50' : ''}>
                    <TableCell className="font-mono">{entry.ip}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{entry.adminUser}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{entry.reason}</TableCell>
                    <TableCell>{entry.addedBy}</TableCell>
                    <TableCell className="text-xs">{new Date(entry.timestamp).toLocaleDateString()}</TableCell>
                    <TableCell className="text-xs">
                      {entry.expiration ? new Date(entry.expiration).toLocaleDateString() : 'Never'}
                    </TableCell>
                    <TableCell>{entry.hitCount}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="destructive" onClick={() => handleRemoveIP(entry.ip)}>
                          Remove
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                Total entries: {data.entries.length} | Active: {data.stats.activeWhitelists}
              </div>
              <div className="flex gap-2">
                {data.admins.map((admin) => (
                  <Button 
                    key={admin.name} 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleClearAdminWhitelist(admin.name)}
                  >
                    Clear {admin.name}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add IP Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add IP to Admin Whitelist</DialogTitle>
            <DialogDescription>
              Add an IP address to the admin whitelist. You must assign it to a specific admin user.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="ip" className="text-right">IP Address</Label>
              <Input
                id="ip"
                value={addForm.ip}
                onChange={(e) => setAddForm({ ...addForm, ip: e.target.value })}
                placeholder="192.168.1.1"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="reason" className="text-right">Reason</Label>
              <Textarea
                id="reason"
                value={addForm.reason}
                onChange={(e) => setAddForm({ ...addForm, reason: e.target.value })}
                placeholder="Why is this IP being whitelisted?"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="duration" className="text-right">Duration (min)</Label>
              <Input
                id="duration"
                type="number"
                value={addForm.durationMinutes}
                onChange={(e) => setAddForm({ ...addForm, durationMinutes: e.target.value })}
                placeholder="Leave empty for permanent"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="adminUser" className="text-right">Admin User *</Label>
              <Select value={addForm.adminUser} onValueChange={(value) => setAddForm({ ...addForm, adminUser: value })} required>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select admin user" />
                </SelectTrigger>
                <SelectContent>
                  {data.admins.map((admin) => (
                    <SelectItem key={admin.name} value={admin.name}>
                      {admin.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAddIP}>Add to Whitelist</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}