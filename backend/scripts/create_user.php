<?php

/**
 * Creates a user — mainly for the very first admin account (there's no self-registration, so
 * something has to create the account that can then create everyone else's via the Settings tab).
 * Prompts for the password interactively rather than taking it as an argument, so it never ends
 * up in shell history or `docker compose exec` process listings.
 *
 * Usage: php backend/scripts/create_user.php <username> <admin|contributor|viewer>
 */

require __DIR__ . '/../vendor/autoload.php';

use RestockRadar\Auth\AuthService;
use RestockRadar\Storage\Database;

[$username, $role] = [$argv[1] ?? null, $argv[2] ?? null];

if ($username === null || $role === null) {
    fwrite(STDERR, "Usage: php backend/scripts/create_user.php <username> <admin|contributor|viewer>\n");
    exit(1);
}

if (!in_array($role, ['admin', 'contributor', 'viewer'], true)) {
    fwrite(STDERR, "role must be one of: admin, contributor, viewer\n");
    exit(1);
}

fwrite(STDOUT, "Password for {$username}: ");
system('stty -echo');
$password = trim((string) fgets(STDIN));
system('stty echo');
fwrite(STDOUT, "\n");

if ($password === '') {
    fwrite(STDERR, "Password can't be empty.\n");
    exit(1);
}

$auth = new AuthService(Database::connection());
$id = $auth->createUser($username, $password, $role);

echo "Created {$role} \"{$username}\" (id {$id}).\n";
