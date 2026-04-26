import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Shield, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const ROLE_COLORS = {
  admin: 'bg-rose-100 text-rose-800',
  agent: 'bg-blue-100 text-blue-800',
  viewer: 'bg-neutral-100 text-neutral-600',
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/users')
      .then(r => setUsers(r.data))
      .catch(err => {
        if (err.response?.status === 403) {
          toast.error('Only admins can manage users');
        } else {
          toast.error('Failed to load users');
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.put(`/users/${userId}/role`, { role: newRole });
      toast.success(`Role updated to ${newRole}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update role');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setSaving(true);
    try {
      await api.delete(`/users/${deleteConfirm.id}`);
      toast.success(`User ${deleteConfirm.name} deleted`);
      setDeleteConfirm(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete user');
    }
    setSaving(false);
  };

  if (currentUser?.role !== 'admin') {
    return (
      <div className="text-center py-20">
        <Shield className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
        <h2 className="text-lg font-semibold text-neutral-700" style={{ fontFamily: 'Outfit' }}>Admin Access Required</h2>
        <p className="text-sm text-neutral-500 mt-1">Only administrators can manage users and roles.</p>
      </div>
    );
  }

  return (
    <div data-testid="users-page" className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold text-neutral-900 tracking-tight" style={{ fontFamily: 'Outfit' }}>Users & Roles</h1>
        <p className="text-sm text-neutral-500 mt-0.5">Manage team members and their access permissions</p>
      </div>

      {/* Role Legend */}
      <div className="bg-white border border-neutral-200 rounded-lg p-4">
        <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-medium mb-3">Role Permissions</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex items-start gap-3 p-3 bg-rose-50 rounded-lg">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 shrink-0">ADMIN</span>
            <p className="text-xs text-neutral-600">Full access — manage users, customers, payments, settings, delete records</p>
          </div>
          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 shrink-0">AGENT</span>
            <p className="text-xs text-neutral-600">Add/edit customers & payments, send messages, view reports. Can delete customers.</p>
          </div>
          <div className="flex items-start gap-3 p-3 bg-neutral-50 rounded-lg">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 shrink-0">VIEWER</span>
            <p className="text-xs text-neutral-600">Read-only — view dashboard, customers, reports. Cannot modify or delete data.</p>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-neutral-50">
              <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">User</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Email</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Current Role</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Change Role</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500 w-16">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-neutral-400">Loading...</TableCell></TableRow>
            ) : users.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-neutral-400">No users found</TableCell></TableRow>
            ) : users.map(u => (
              <TableRow key={u.id} data-testid={`user-row-${u.id}`}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center text-xs font-semibold text-neutral-600">
                      {(u.name || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{u.name}</p>
                      {u.id === currentUser?.id && <p className="text-[10px] text-cyan-600 font-medium">You</p>}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-neutral-600">{u.email}</TableCell>
                <TableCell>
                  <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${ROLE_COLORS[u.role] || ROLE_COLORS.viewer}`}>
                    {u.role}
                  </span>
                </TableCell>
                <TableCell>
                  {u.id === currentUser?.id ? (
                    <span className="text-xs text-neutral-400">Cannot change own role</span>
                  ) : (
                    <Select value={u.role} onValueChange={(v) => handleRoleChange(u.id, v)}>
                      <SelectTrigger data-testid={`role-select-${u.id}`} className="w-32 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="agent">Agent</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell>
                  {u.id !== currentUser?.id && (
                    <Button
                      data-testid={`delete-user-${u.id}`}
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-neutral-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setDeleteConfirm(u)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle style={{ fontFamily: 'Outfit' }}>Delete User</DialogTitle></DialogHeader>
          <div className="flex items-start gap-3 py-2">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-700">Delete <strong>{deleteConfirm?.name}</strong> ({deleteConfirm?.email})?</p>
              <p className="text-xs text-neutral-500 mt-1">This user will lose all access. This cannot be undone.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button data-testid="confirm-delete-user-btn" variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? 'Deleting...' : 'Delete User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
