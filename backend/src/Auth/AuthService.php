<?php

namespace RestockRadar\Auth;

use PDO;

/**
 * Three roles, checked everywhere as a flat string: 'admin' (full control, including user
 * management), 'contributor' (read/write everything else — watchlist, purchases, coverage),
 * 'viewer' (read-only everywhere). Two ways in: a PHP session (the web app — same-origin via the
 * Vite/Caddy proxy so the cookie actually survives) or a long-lived bearer token (the browser
 * extension, which can't hold a session cookie at its own chrome-extension:// origin). Both
 * resolve to the same {id, username, role} shape via index.php's currentUser().
 *
 * No self-registration, no email-based reset (this app has no mail capability) — the first
 * account comes from scripts/create_user.php; after that, an admin creates/resets accounts
 * directly from the Settings tab.
 */
final class AuthService
{
    public function __construct(private PDO $pdo)
    {
    }

    /** @return array{id: int, username: string, role: string}|null null on bad credentials or a deactivated account. */
    public function login(string $username, string $password): ?array
    {
        $stmt = $this->pdo->prepare('SELECT id, username, password_hash, role, active FROM users WHERE username = :username');
        $stmt->execute(['username' => $username]);
        $user = $stmt->fetch();

        if ($user === false || !$user['active'] || !password_verify($password, $user['password_hash'])) {
            return null;
        }

        return ['id' => (int) $user['id'], 'username' => $user['username'], 'role' => $user['role']];
    }

    /** @return array{id: int, username: string, role: string}|null */
    public function findActiveUser(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT id, username, role, active FROM users WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $user = $stmt->fetch();

        if ($user === false || !$user['active']) {
            return null;
        }

        return ['id' => (int) $user['id'], 'username' => $user['username'], 'role' => $user['role']];
    }

    /**
     * Looks up a bearer token by its hash (the raw token is never stored, so this is the only
     * way to find one) and records that it was just used, for visibility in Settings.
     *
     * @return array{id: int, username: string, role: string}|null
     */
    public function userFromToken(string $token): ?array
    {
        $hash = hash('sha256', $token);
        $stmt = $this->pdo->prepare(
            'SELECT u.id AS user_id, u.username, u.role, u.active, t.id AS token_id
             FROM api_tokens t JOIN users u ON u.id = t.user_id
             WHERE t.token_hash = :hash'
        );
        $stmt->execute(['hash' => $hash]);
        $row = $stmt->fetch();

        if ($row === false || !$row['active']) {
            return null;
        }

        $this->pdo->prepare("UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = :id")
            ->execute(['id' => $row['token_id']]);

        return ['id' => (int) $row['user_id'], 'username' => $row['username'], 'role' => $row['role']];
    }

    public function changeOwnPassword(int $userId, string $currentPassword, string $newPassword): bool
    {
        $stmt = $this->pdo->prepare('SELECT password_hash FROM users WHERE id = :id');
        $stmt->execute(['id' => $userId]);
        $hash = $stmt->fetchColumn();

        if ($hash === false || !password_verify($currentPassword, $hash)) {
            return false;
        }

        $this->setPassword($userId, $newPassword);

        return true;
    }

    /** No current-password check — for an admin resetting someone ELSE's password. */
    public function setPassword(int $userId, string $newPassword): void
    {
        $stmt = $this->pdo->prepare('UPDATE users SET password_hash = :hash WHERE id = :id');
        $stmt->execute(['hash' => password_hash($newPassword, PASSWORD_DEFAULT), 'id' => $userId]);
    }

    /** @return array<int, array{id:int, username:string, role:string, active:int, created_at:string}> */
    public function listUsers(): array
    {
        return $this->pdo->query('SELECT id, username, role, active, created_at FROM users ORDER BY username ASC')->fetchAll();
    }

    public function createUser(string $username, string $password, string $role): int
    {
        $stmt = $this->pdo->prepare('INSERT INTO users (username, password_hash, role) VALUES (:username, :hash, :role)');
        $stmt->execute(['username' => $username, 'hash' => password_hash($password, PASSWORD_DEFAULT), 'role' => $role]);

        return (int) $this->pdo->lastInsertId();
    }

    /** $fields may include: role, active. Password changes always go through setPassword() explicitly, never silently via this. */
    public function updateUser(int $id, array $fields): void
    {
        $allowed = ['role', 'active'];
        $sets = [];
        $params = ['id' => $id];

        foreach ($fields as $key => $value) {
            if (!in_array($key, $allowed, true)) {
                continue;
            }
            $sets[] = "{$key} = :{$key}";
            $params[$key] = $value;
        }

        if ($sets === []) {
            return;
        }

        $this->pdo->prepare('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
    }

    public function deleteUser(int $id): void
    {
        $this->pdo->prepare('DELETE FROM users WHERE id = :id')->execute(['id' => $id]);
    }

    /** Used to refuse an action that would leave zero active admins locked out of user management. */
    public function activeAdminCount(): int
    {
        return (int) $this->pdo->query("SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1")->fetchColumn();
    }

    /** @return string the RAW token — shown to the caller exactly once; only its hash is ever stored. */
    public function createToken(int $userId, ?string $label): string
    {
        $raw = bin2hex(random_bytes(32));
        $stmt = $this->pdo->prepare('INSERT INTO api_tokens (user_id, token_hash, label) VALUES (:user_id, :hash, :label)');
        $stmt->execute(['user_id' => $userId, 'hash' => hash('sha256', $raw), 'label' => $label]);

        return $raw;
    }

    /** @return array<int, array{id:int, label:?string, created_at:string, last_used_at:?string}> */
    public function listTokens(int $userId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, label, created_at, last_used_at FROM api_tokens WHERE user_id = :user_id ORDER BY created_at DESC'
        );
        $stmt->execute(['user_id' => $userId]);

        return $stmt->fetchAll();
    }

    public function revokeToken(int $tokenId, int $userId): void
    {
        $this->pdo->prepare('DELETE FROM api_tokens WHERE id = :id AND user_id = :user_id')
            ->execute(['id' => $tokenId, 'user_id' => $userId]);
    }
}
