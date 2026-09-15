import { useEffect, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { authApi, usersApi, type ApiToken, type Role, type UserAccount } from '../api';
import { useAuth } from '../AuthContext';

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus(null);
    setSaving(true);
    try {
      await authApi.changePassword(current, next);
      setCurrent('');
      setNext('');
      setStatus('Password changed.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-stone-900 p-4">
      <h2 className="font-semibold mb-3">Change your password</h2>
      <form onSubmit={submit} className="flex flex-wrap gap-2 items-end">
        <div>
          <label htmlFor="current-password" className="block text-xs text-stone-500 dark:text-stone-400">
            Current password
          </label>
          <input
            id="current-password"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            className="rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="new-password" className="block text-xs text-stone-500 dark:text-stone-400">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            className="rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-brand-500 hover:bg-brand-600 text-white text-sm px-3 py-1.5 disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Change password'}
        </button>
      </form>
      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      {status && <p className="text-brand-600 dark:text-brand-400 text-sm mt-2">{status}</p>}
    </section>
  );
}

/**
 * A token is shown exactly once, right after creation — the backend only ever stores its hash,
 * same as a password, so there's no "view it again later" for this or anyone else, including us.
 */
function ApiTokens() {
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [label, setLabel] = useState('');
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    authApi.listTokens().then(setTokens).catch((err: Error) => setError(err.message));
  };

  useEffect(load, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const { token } = await authApi.createToken(label.trim() || null);
      setJustCreated(token);
      setLabel('');
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const revoke = async (id: number) => {
    if (!confirm('Revoke this token? Anything using it (like the browser extension) will stop working.')) return;
    await authApi.revokeToken(id);
    load();
  };

  return (
    <section className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-stone-900 p-4">
      <h2 className="font-semibold mb-1">API tokens</h2>
      <p className="text-sm text-stone-500 dark:text-stone-400 mb-3">
        For the browser extension, which can't hold a sign-in session at its own address. Paste one into the
        extension's <strong>Backend settings</strong> section once.
      </p>

      {justCreated && (
        <div className="mb-3 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-2">
          <p className="text-xs text-amber-800 dark:text-amber-300 mb-1">
            Copy this now — it won't be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs break-all bg-white dark:bg-stone-950 rounded px-2 py-1 border border-amber-200 dark:border-amber-800">
              {justCreated}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(justCreated)}
              aria-label="Copy token"
              title="Copy"
              className="p-1.5 rounded text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-800/40"
            >
              <Copy size={14} />
            </button>
          </div>
        </div>
      )}

      <form onSubmit={create} className="flex items-end gap-2 mb-3">
        <div>
          <label htmlFor="token-label" className="block text-xs text-stone-500 dark:text-stone-400">
            Label (optional)
          </label>
          <input
            id="token-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Browser extension"
            className="w-48 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
          />
        </div>
        <button
          type="submit"
          className="flex items-center gap-1.5 rounded bg-brand-500 hover:bg-brand-600 text-white text-sm px-3 py-1.5"
        >
          <Plus size={14} /> Create token
        </button>
      </form>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}

      {tokens && tokens.length === 0 && <p className="text-sm text-stone-500 dark:text-stone-400">No tokens yet.</p>}
      {tokens && tokens.length > 0 && (
        <ul className="space-y-1 text-sm">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 rounded border border-stone-200 dark:border-stone-700 px-2 py-1">
              <span>
                {t.label ?? '(no label)'}{' '}
                <span className="text-xs text-stone-400 dark:text-stone-500">
                  — created {t.created_at}{t.last_used_at ? `, last used ${t.last_used_at}` : ', never used'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => revoke(t.id)}
                aria-label="Revoke token"
                title="Revoke"
                className="p-1 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'contributor', label: 'Contributor' },
  { value: 'viewer', label: 'Viewer' },
];

function ManageUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserAccount[] | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('contributor');
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    usersApi.list().then(setUsers).catch((err: Error) => setError(err.message));
  };

  useEffect(load, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await usersApi.create({ username: username.trim(), password, role });
      setUsername('');
      setPassword('');
      setRole('contributor');
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const changeRole = async (id: number, newRole: Role) => {
    setError(null);
    try {
      await usersApi.update(id, { role: newRole });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggleActive = async (u: UserAccount) => {
    setError(null);
    try {
      await usersApi.update(u.id, { active: !u.active });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const resetPassword = async (id: number) => {
    const newPassword = prompt('New password for this user:');
    if (!newPassword) return;
    setError(null);
    try {
      await usersApi.update(id, { password: newPassword });
      alert('Password reset. Let them know their new password some other way — it is not shown here again.');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (u: UserAccount) => {
    if (!confirm(`Delete the account "${u.username}"? This can't be undone.`)) return;
    setError(null);
    try {
      await usersApi.remove(u.id);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-stone-900 p-4">
      <h2 className="font-semibold mb-1">Manage accounts</h2>
      <p className="text-sm text-stone-500 dark:text-stone-400 mb-3">
        No self-registration, no email reset — you create every account here, and reset a forgotten password
        directly (there's no email to send one through).
      </p>

      <form onSubmit={create} className="flex flex-wrap items-end gap-2 mb-3">
        <div>
          <label htmlFor="new-user-username" className="block text-xs text-stone-500 dark:text-stone-400">
            Username
          </label>
          <input
            id="new-user-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="new-user-password" className="block text-xs text-stone-500 dark:text-stone-400">
            Password
          </label>
          <input
            id="new-user-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="new-user-role" className="block text-xs text-stone-500 dark:text-stone-400">
            Role
          </label>
          <select
            id="new-user-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="flex items-center gap-1.5 rounded bg-brand-500 hover:bg-brand-600 text-white text-sm px-3 py-1.5"
        >
          <Plus size={14} /> Create account
        </button>
      </form>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}

      {users && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <caption className="sr-only">User accounts and roles</caption>
            <thead>
              <tr className="text-brand-700 dark:text-brand-400 border-b border-brand-200 dark:border-brand-800">
                <th scope="col" className="py-1 pr-4">Username</th>
                <th scope="col" className="py-1 pr-4">Role</th>
                <th scope="col" className="py-1 pr-4">Status</th>
                <th scope="col" className="py-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                  <td className="py-1.5 pr-4">
                    {u.username} {u.id === me?.id && <span className="text-xs text-stone-400">(you)</span>}
                  </td>
                  <td className="py-1.5 pr-4">
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u.id, e.target.value as Role)}
                      className="rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-1.5 py-0.5 text-xs"
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 pr-4">
                    <button
                      type="button"
                      onClick={() => toggleActive(u)}
                      className={
                        'px-2 py-0.5 rounded-full text-xs ' +
                        (u.active
                          ? 'bg-brand-100 dark:bg-brand-800/40 text-brand-700 dark:text-brand-300'
                          : 'bg-stone-200 dark:bg-stone-800 text-stone-500 dark:text-stone-400')
                      }
                    >
                      {u.active ? 'active' : 'deactivated'}
                    </button>
                  </td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => resetPassword(u.id)}
                        className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        Reset password
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(u)}
                        disabled={u.id === me?.id}
                        aria-label={`Delete ${u.username}`}
                        title={u.id === me?.id ? "Can't delete your own account" : 'Delete'}
                        className="p-1 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function Settings() {
  const { user, isAdmin } = useAuth();

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-stone-500 dark:text-stone-400">
        Signed in as <span className="font-medium text-stone-700 dark:text-stone-300">{user?.username}</span> (
        {user?.role}).
      </p>
      <ChangePassword />
      <ApiTokens />
      {isAdmin && <ManageUsers />}
    </div>
  );
}
